import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_DB_PATH, openDb, resetDbFile, type Db } from "./db.js";
import { runScan } from "./governance.js";
import { ARTIFACTS, TASKS, TEAMS, USERS, type SeedArtifact } from "./seed-data.js";
import type { ArtifactType } from "./types.js";
import { isoDaysAgo, mulberry32 } from "./util.js";

/** Typical token cost per run, by capability shape. */
const TOKEN_PROFILE: Record<ArtifactType, [number, number]> = {
  prompt: [700, 2400],
  skill: [1100, 3400],
  agent: [2000, 6200],
  workflow: [3000, 9000],
};

const COST_PER_TOKEN = 0.000004;

export function seed(db: Db): void {
  const random = mulberry32(20260724);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
  const between = (min: number, max: number): number => min + random() * (max - min);

  db.tx(() => {
    for (const table of ["edges", "flags", "ratings", "execution_events", "tasks", "artifacts", "users", "teams"]) {
      db.exec(`DELETE FROM ${table}`);
    }

    for (const team of TEAMS) {
      db.run("INSERT INTO teams (id, name, objective) VALUES (?,?,?)", [team.id, team.name, team.objective]);
    }
    for (const user of USERS) {
      db.run("INSERT INTO users (id, name, role, team_id, title) VALUES (?,?,?,?,?)", [
        user.id,
        user.name,
        user.role,
        user.teamId,
        user.title,
      ]);
    }

    // Artifacts first, so the lineage root of every fork is already resolvable.
    const rootOf = new Map<string, string>();
    const resolveRoot = (artifact: SeedArtifact): string => {
      if (!artifact.parentId) return artifact.id;
      return rootOf.get(artifact.parentId) ?? artifact.id;
    };

    for (const artifact of ARTIFACTS) {
      const rootId = resolveRoot(artifact);
      rootOf.set(artifact.id, rootId);
      const createdAt = isoDaysAgo(artifact.createdDaysAgo);
      db.run(
        `INSERT INTO artifacts (id, name, type, description, content, inputs, outputs, tags,
                                owner_id, team_id, security_scope, status, certified,
                                parent_id, root_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active', ?, ?, ?, ?, ?)`,
        [
          artifact.id,
          artifact.name,
          artifact.type,
          artifact.description,
          artifact.content,
          JSON.stringify(artifact.inputs),
          JSON.stringify(artifact.outputs),
          JSON.stringify(artifact.tags),
          artifact.ownerId,
          artifact.teamId,
          artifact.scope,
          artifact.certified ? 1 : 0,
          artifact.parentId ?? null,
          rootId,
          createdAt,
          isoDaysAgo(Math.max(0, artifact.createdDaysAgo - 20)),
        ],
      );
    }

    for (const task of TASKS) {
      db.run("INSERT INTO tasks (id, title, description, team_id, created_at) VALUES (?,?,?,?,?)", [
        task.id,
        task.title,
        task.description,
        task.teamId,
        isoDaysAgo(45),
      ]);
      for (const assignee of task.assignees) {
        db.run("INSERT INTO edges (source, target, kind, weight) VALUES (?,?, 'workingOn', 1)", [assignee, task.id]);
      }
      for (const artifactId of task.artifacts) {
        db.run("INSERT INTO edges (source, target, kind, weight) VALUES (?,?, 'relatesTo', 1)", [task.id, artifactId]);
      }
    }

    // Execution telemetry. Runs skew towards the owning team, with a minority
    // of cross-team usage so graph affinity has something to differentiate.
    let eventNumber = 0;
    for (const artifact of ARTIFACTS) {
      const teammates = USERS.filter((user) => user.teamId === artifact.teamId);
      const [minTokens, maxTokens] = TOKEN_PROFILE[artifact.type];

      for (let i = 0; i < artifact.runs; i += 1) {
        const [newest, oldest] = artifact.window;
        // Bias towards the recent end of the window for anything still in use.
        const skew = oldest <= 60 ? Math.pow(random(), 1.6) : random();
        const daysAgo = newest + skew * (oldest - newest);
        const actor = random() < 0.75 ? pick(teammates) : pick(USERS);
        const tokens = Math.round(between(minTokens, maxTokens));
        eventNumber += 1;

        db.run(
          `INSERT INTO execution_events (id, artifact_id, user_id, success, latency_ms, tokens, cost_usd, created_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            `evt_seed_${eventNumber}`,
            artifact.id,
            actor.id,
            random() < artifact.successRate ? 1 : 0,
            Math.round(between(400, artifact.type === "workflow" ? 9000 : 4200)),
            tokens,
            Math.round(tokens * COST_PER_TOKEN * 10000) / 10000,
            isoDaysAgo(daysAgo),
          ],
        );
      }

      // Ratings come from peers rather than the owner.
      const raters = USERS.filter((user) => user.id !== artifact.ownerId);
      artifact.ratings.forEach((rating, index) => {
        const rater = raters[index % raters.length]!;
        db.run("INSERT INTO ratings (id, artifact_id, user_id, rating, created_at) VALUES (?,?,?,?,?)", [
          `rat_seed_${artifact.id}_${index}`,
          artifact.id,
          rater.id,
          rating,
          isoDaysAgo(between(1, Math.min(80, artifact.createdDaysAgo))),
        ]);
      });
    }
  });

  // Seeding ends with a governance pass so a freshly built database already
  // has a populated review queue.
  runScan(db);
}

function main(): void {
  const path = process.env.PRISM_DB ?? DEFAULT_DB_PATH;
  resetDbFile(path);
  const db = openDb(path);

  seed(db);

  const counts = db.get<{ artifacts: number; events: number; ratings: number }>(
    `SELECT (SELECT COUNT(*) FROM artifacts) AS artifacts,
            (SELECT COUNT(*) FROM execution_events) AS events,
            (SELECT COUNT(*) FROM ratings) AS ratings`,
  )!;

  const byKind = db.all<{ kind: string; n: number }>(
    "SELECT kind, COUNT(*) AS n FROM flags WHERE status='open' GROUP BY kind ORDER BY kind",
  );

  console.log(`Seeded ${path}`);
  console.log(`  teams      ${TEAMS.length}`);
  console.log(`  users      ${USERS.length}`);
  console.log(`  artifacts  ${counts.artifacts}`);
  console.log(`  executions ${counts.events}`);
  console.log(`  ratings    ${counts.ratings}`);
  console.log(`Governance scan raised ${byKind.reduce((sum, row) => sum + row.n, 0)} flags:`);
  for (const row of byKind) console.log(`  ${row.kind.padEnd(11)}${row.n}`);
  db.close();
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) main();
