import { buildCorpus } from "./corpus.js";
import type { Db } from "./db.js";
import { cosine } from "./embedder.js";
import { ApiError, badRequest, notFound } from "./errors.js";
import { canView } from "./rbac.js";
import { loadArtifact, loadArtifacts } from "./repo.js";
import type { Artifact, Flag, FlagKind, FlagResolution, User } from "./types.js";
import { newId, nowIso } from "./util.js";

/** Deprecation rules. Tuned so the seeded organisation trips every rule at least once. */
export const RULES = {
  /** No executions in this many days flags an artifact as stale. */
  staleDays: 60,
  /** Similarity at which two live artifacts are considered redundant. */
  duplicateThreshold: 0.85,
  /** Minimum runs before reliability is judged. */
  unreliableMinRuns: 10,
  /** Success rate below this (with enough runs) flags an artifact as unreliable. */
  unreliableRate: 0.5,
};

interface FlagRow {
  id: string;
  artifact_id: string;
  kind: FlagKind;
  detail: string;
  duplicate_of_id: string | null;
  status: "open" | "resolved";
  created_at: string;
  resolution: FlagResolution | null;
}

function hydrateFlag(row: FlagRow, artifact: Artifact): Flag {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    artifact,
    kind: row.kind,
    detail: row.detail,
    duplicateOfId: row.duplicate_of_id,
    status: row.status,
    createdAt: row.created_at,
    resolution: row.resolution,
  };
}

export function loadFlags(db: Db, status: "open" | "resolved" | "all", user: User | null): Flag[] {
  const rows =
    status === "all"
      ? db.all<FlagRow>("SELECT * FROM flags ORDER BY created_at DESC")
      : db.all<FlagRow>("SELECT * FROM flags WHERE status = ? ORDER BY created_at DESC", [status]);

  const artifacts = new Map(loadArtifacts(db).map((artifact) => [artifact.id, artifact]));
  const out: Flag[] = [];
  for (const row of rows) {
    const artifact = artifacts.get(row.artifact_id);
    if (!artifact || !canView(artifact, user)) continue;
    out.push(hydrateFlag(row, artifact));
  }
  return out;
}

export function loadFlag(db: Db, id: string): Flag | undefined {
  const row = db.get<FlagRow>("SELECT * FROM flags WHERE id = ?", [id]);
  if (!row) return undefined;
  const artifact = loadArtifact(db, row.artifact_id);
  return artifact ? hydrateFlag(row, artifact) : undefined;
}

function hasOpenFlag(db: Db, artifactId: string, kind: FlagKind): boolean {
  const row = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM flags WHERE artifact_id = ? AND kind = ? AND status = 'open'",
    [artifactId, kind],
  );
  return (row?.n ?? 0) > 0;
}

function daysBetween(from: string, to: number): number {
  return Math.floor((to - Date.parse(from)) / 86_400_000);
}

/**
 * The deprecation engine. Idempotent: an artifact never accumulates two open
 * flags of the same kind, so the scan can run on a schedule or on demand.
 */
export function runScan(db: Db): { created: number; flags: Flag[] } {
  const now = Date.now();
  const staleCutoff = new Date(now - RULES.staleDays * 86_400_000).toISOString();
  const live = loadArtifacts(db, "a.status != 'archived'");
  const created: Flag[] = [];

  const raise = (artifact: Artifact, kind: FlagKind, detail: string, duplicateOfId: string | null = null): void => {
    if (hasOpenFlag(db, artifact.id, kind)) return;
    const flag: FlagRow = {
      id: newId("flag"),
      artifact_id: artifact.id,
      kind,
      detail,
      duplicate_of_id: duplicateOfId,
      status: "open",
      created_at: nowIso(),
      resolution: null,
    };
    db.run(
      `INSERT INTO flags (id, artifact_id, kind, detail, duplicate_of_id, status, created_at, resolution)
       VALUES (?, ?, ?, ?, ?, 'open', ?, NULL)`,
      [flag.id, flag.artifact_id, flag.kind, flag.detail, flag.duplicate_of_id, flag.created_at],
    );
    if (artifact.status === "active") {
      db.run("UPDATE artifacts SET status = 'flagged' WHERE id = ?", [artifact.id]);
    }
    created.push(hydrateFlag(flag, artifact));
  };

  for (const artifact of live) {
    // Abandonment: nothing has run it inside the window, and it is old enough to judge.
    const olderThanWindow = artifact.createdAt < staleCutoff;
    const idle = artifact.lastExecutedAt === null || artifact.lastExecutedAt < staleCutoff;
    if (olderThanWindow && idle) {
      const since = artifact.lastExecutedAt ?? artifact.createdAt;
      const days = daysBetween(since, now);
      const detail = artifact.lastExecutedAt
        ? `No executions in ${days} days (last run ${artifact.lastExecutedAt.slice(0, 10)})`
        : `Never executed in the ${days} days since creation`;
      raise(artifact, "stale", detail);
    }

    // Reliability: enough runs to be confident, failing more often than not.
    const runs = artifact.trust.usageCount;
    const rate = artifact.trust.successRate;
    if (runs >= RULES.unreliableMinRuns && rate !== null && rate < RULES.unreliableRate) {
      raise(artifact, "unreliable", `Success rate ${Math.round(rate * 100)}% across ${runs} runs`);
    }
  }

  // Redundancy: near-identical live artifacts. Pairs inside one lineage are
  // skipped — a fork is a deliberate adaptation, tracked by the lineage tree,
  // not uncoordinated recreation.
  const corpus = buildCorpus(live);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.rootId === b.rootId) continue;
      const similarity = cosine(corpus.vectorOf(a.id), corpus.vectorOf(b.id));
      if (similarity < RULES.duplicateThreshold) continue;

      // Keep the more trusted artifact; ties break toward the older one.
      const [survivor, redundant] =
        a.trustScore > b.trustScore || (a.trustScore === b.trustScore && a.createdAt <= b.createdAt)
          ? [a, b]
          : [b, a];
      raise(
        redundant,
        "duplicate",
        `${Math.round(similarity * 100)}% similar to "${survivor.name}"`,
        survivor.id,
      );
    }
  }

  return { created: created.length, flags: created };
}

/** Telemetry totals for an artifact, including anything previously merged into it. */
function totalsFor(db: Db, artifactId: string): {
  runs: number;
  successes: number;
  tokens: number;
  cost: number;
  ratingSum: number;
  ratingCount: number;
} {
  const exec = db.get<{ n: number; s: number; t: number; c: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(success),0) AS s, COALESCE(SUM(tokens),0) AS t,
            COALESCE(SUM(cost_usd),0) AS c FROM execution_events WHERE artifact_id = ?`,
    [artifactId],
  );
  const rated = db.get<{ n: number; s: number }>(
    "SELECT COUNT(*) AS n, COALESCE(SUM(rating),0) AS s FROM ratings WHERE artifact_id = ?",
    [artifactId],
  );
  const merged = db.get<{
    merged_usage: number;
    merged_successes: number;
    merged_tokens: number;
    merged_cost_usd: number;
    merged_rating_sum: number;
    merged_rating_count: number;
  }>(
    `SELECT merged_usage, merged_successes, merged_tokens, merged_cost_usd,
            merged_rating_sum, merged_rating_count FROM artifacts WHERE id = ?`,
    [artifactId],
  );

  return {
    runs: (exec?.n ?? 0) + (merged?.merged_usage ?? 0),
    successes: (exec?.s ?? 0) + (merged?.merged_successes ?? 0),
    tokens: (exec?.t ?? 0) + (merged?.merged_tokens ?? 0),
    cost: (exec?.c ?? 0) + (merged?.merged_cost_usd ?? 0),
    ratingSum: (rated?.s ?? 0) + (merged?.merged_rating_sum ?? 0),
    ratingCount: (rated?.n ?? 0) + (merged?.merged_rating_count ?? 0),
  };
}

export type ResolveAction = "archive" | "merge" | "dismiss";

/**
 * Resolves a flag. Archiving and merging never rewrite lineage: children keep
 * pointing at the artifact they were forked from, so the tree stays readable
 * and no dependency is silently broken.
 */
export function resolveFlag(db: Db, flagId: string, action: ResolveAction): Flag {
  const flag = loadFlag(db, flagId);
  if (!flag) throw notFound("Flag not found");
  if (flag.status === "resolved") throw new ApiError(409, "ALREADY_RESOLVED", "Flag is already resolved");
  if (action === "merge" && flag.kind !== "duplicate") {
    throw badRequest("Merge is only available for duplicate flags");
  }
  if (action === "merge" && !flag.duplicateOfId) {
    throw badRequest("Flag has no merge target");
  }

  const resolution: FlagResolution = action === "archive" ? "archived" : action === "merge" ? "merged" : "dismissed";

  db.tx(() => {
    if (action === "merge") {
      const source = totalsFor(db, flag.artifactId);
      db.run(
        `UPDATE artifacts SET
           merged_usage        = merged_usage + ?,
           merged_successes    = merged_successes + ?,
           merged_tokens       = merged_tokens + ?,
           merged_cost_usd     = merged_cost_usd + ?,
           merged_rating_sum   = merged_rating_sum + ?,
           merged_rating_count = merged_rating_count + ?,
           updated_at          = ?
         WHERE id = ?`,
        [
          source.runs,
          source.successes,
          source.tokens,
          source.cost,
          source.ratingSum,
          source.ratingCount,
          nowIso(),
          flag.duplicateOfId,
        ],
      );
    }

    if (action === "dismiss") {
      db.run("UPDATE flags SET status='resolved', resolution=?, resolved_at=? WHERE id = ?", [
        resolution,
        nowIso(),
        flagId,
      ]);
      // Restore the artifact once nothing else is outstanding against it.
      const remaining = db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM flags WHERE artifact_id = ? AND status = 'open'",
        [flag.artifactId],
      );
      if ((remaining?.n ?? 0) === 0) {
        db.run("UPDATE artifacts SET status = 'active' WHERE id = ? AND status = 'flagged'", [flag.artifactId]);
      }
      return;
    }

    db.run("UPDATE artifacts SET status = 'archived', updated_at = ? WHERE id = ?", [nowIso(), flag.artifactId]);
    db.run("UPDATE flags SET status='resolved', resolution=?, resolved_at=? WHERE id = ?", [
      resolution,
      nowIso(),
      flagId,
    ]);
    // Other open flags on a retired artifact are moot; close them out too.
    db.run(
      `UPDATE flags SET status='resolved', resolution='dismissed', resolved_at=?
        WHERE artifact_id = ? AND status = 'open'`,
      [nowIso(), flag.artifactId],
    );
  });

  const updated = loadFlag(db, flagId);
  if (!updated) throw notFound("Flag not found");
  return updated;
}
