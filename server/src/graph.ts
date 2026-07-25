import type { Db } from "./db.js";
import { tokenize } from "./embedder.js";
import { canView } from "./rbac.js";
import { loadArtifacts, loadTeam } from "./repo.js";
import type { Artifact, GraphEdge, GraphNode, User } from "./types.js";

const AFFINITY_WINDOW_DAYS = 90;

/**
 * The knowledge & capability graph connects users, teams, tasks and artifacts.
 * Ownership, membership, forks and executions are derived from the base tables;
 * only task links live in the `edges` table.
 */
export interface Affinity {
  user: User | null;
  teamExecutions: Map<string, number>;
  myExecutions: Map<string, number>;
  /** Lineage roots the caller's team already owns or runs. */
  teamRoots: Set<string>;
  /** Vocabulary describing the caller: job title, team objective, active tasks. */
  contextTerms: Set<string>;
}

export function buildAffinity(db: Db, user: User | null): Affinity {
  const empty: Affinity = {
    user,
    teamExecutions: new Map(),
    myExecutions: new Map(),
    teamRoots: new Set(),
    contextTerms: new Set(),
  };
  if (!user) return empty;

  const since = new Date(Date.now() - AFFINITY_WINDOW_DAYS * 86_400_000).toISOString();

  for (const row of db.all<{ id: string; n: number }>(
    `SELECT e.artifact_id AS id, COUNT(*) AS n
       FROM execution_events e JOIN users u ON u.id = e.user_id
      WHERE u.team_id = ? AND e.created_at >= ?
      GROUP BY e.artifact_id`,
    [user.teamId, since],
  )) {
    empty.teamExecutions.set(row.id, row.n);
  }

  for (const row of db.all<{ id: string; n: number }>(
    `SELECT artifact_id AS id, COUNT(*) AS n
       FROM execution_events WHERE user_id = ? AND created_at >= ? GROUP BY artifact_id`,
    [user.id, since],
  )) {
    empty.myExecutions.set(row.id, row.n);
  }

  for (const row of db.all<{ root_id: string }>(
    `SELECT DISTINCT root_id FROM artifacts
      WHERE team_id = ?
         OR id IN (SELECT e.artifact_id FROM execution_events e
                     JOIN users u ON u.id = e.user_id WHERE u.team_id = ?)`,
    [user.teamId, user.teamId],
  )) {
    empty.teamRoots.add(row.root_id);
  }

  const team = loadTeam(db, user.teamId);
  const tasks = db.all<{ title: string; description: string }>(
    `SELECT t.title, t.description FROM tasks t
      JOIN edges e ON e.target = t.id AND e.kind = 'workingOn'
     WHERE e.source = ?`,
    [user.id],
  );
  const context = [user.title, team?.objective ?? "", ...tasks.map((t) => `${t.title} ${t.description}`)].join(" ");
  for (const term of tokenize(context)) empty.contextTerms.add(term);

  return empty;
}

export interface AffinityScore {
  score: number;
  signals: string[];
}

/**
 * How connected an artifact is to the caller's position in the graph. Each
 * component is additive and the total is clamped, so several weak signals can
 * stand in for one strong one.
 */
export function graphAffinity(artifact: Artifact, affinity: Affinity): AffinityScore {
  const { user } = affinity;
  if (!user) return { score: 0, signals: [] };

  const signals: string[] = [];
  let score = 0;

  if (artifact.teamId === user.teamId) {
    score += 0.35;
    signals.push("owned by your team");
  }

  const teamRuns = affinity.teamExecutions.get(artifact.id) ?? 0;
  if (teamRuns > 0) {
    score += 0.3 * Math.min(1, teamRuns / 10);
    signals.push(`run ${teamRuns}× by your team`);
  }

  if ((affinity.myExecutions.get(artifact.id) ?? 0) > 0) {
    score += 0.2;
    signals.push("you have used it before");
  }

  if (artifact.teamId !== user.teamId && affinity.teamRoots.has(artifact.rootId)) {
    score += 0.15;
    signals.push("shares lineage with a capability your team uses");
  }

  if (affinity.contextTerms.size > 0) {
    const terms = new Set(tokenize([artifact.name, artifact.tags.join(" "), artifact.description].join(" ")));
    let hits = 0;
    for (const term of terms) if (affinity.contextTerms.has(term)) hits += 1;
    if (hits > 0) {
      score += 0.2 * Math.min(1, hits / 4);
      signals.push("matches your role and team objective");
    }
  }

  return { score: Math.min(1, score), signals };
}

/** Builds the node/edge view around a focus node, filtered to what the caller may see. */
export function buildGraphView(
  db: Db,
  user: User | null,
  focusId: string | null,
  depth: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const artifacts = loadArtifacts(db).filter((artifact) => canView(artifact, user));
  const artifactById = new Map(artifacts.map((a) => [a.id, a]));
  const users = db.all<{ id: string; name: string; role: string; team_id: string; title: string }>(
    "SELECT * FROM users",
  );
  const teams = db.all<{ id: string; name: string; objective: string }>("SELECT * FROM teams");
  const tasks = db.all<{ id: string; title: string; team_id: string }>("SELECT * FROM tasks");

  const allNodes = new Map<string, GraphNode>();
  for (const team of teams) allNodes.set(team.id, { id: team.id, kind: "team", label: team.name });
  for (const u of users) {
    allNodes.set(u.id, { id: u.id, kind: "user", label: u.name, meta: { role: u.role, title: u.title } });
  }
  for (const task of tasks) allNodes.set(task.id, { id: task.id, kind: "task", label: task.title });
  for (const artifact of artifacts) {
    allNodes.set(artifact.id, {
      id: artifact.id,
      kind: "artifact",
      label: artifact.name,
      meta: { type: artifact.type, trustScore: artifact.trustScore, status: artifact.status },
    });
  }

  const allEdges: GraphEdge[] = [];
  for (const u of users) allEdges.push({ source: u.id, target: u.team_id, kind: "memberOf", weight: 1 });
  for (const artifact of artifacts) {
    allEdges.push({ source: artifact.ownerId, target: artifact.id, kind: "owns", weight: 1 });
    if (artifact.parentId && artifactById.has(artifact.parentId)) {
      allEdges.push({ source: artifact.id, target: artifact.parentId, kind: "forkOf", weight: 1 });
    }
  }
  for (const row of db.all<{ user_id: string; artifact_id: string; n: number }>(
    `SELECT user_id, artifact_id, COUNT(*) AS n FROM execution_events
      WHERE user_id IS NOT NULL GROUP BY user_id, artifact_id`,
  )) {
    if (!artifactById.has(row.artifact_id)) continue;
    allEdges.push({ source: row.user_id, target: row.artifact_id, kind: "executed", weight: row.n });
  }
  for (const row of db.all<{ source: string; target: string; kind: GraphEdge["kind"]; weight: number }>(
    "SELECT source, target, kind, weight FROM edges",
  )) {
    if (allNodes.has(row.source) && allNodes.has(row.target)) allEdges.push(row);
  }

  if (!focusId || !allNodes.has(focusId)) {
    return { nodes: [...allNodes.values()], edges: allEdges };
  }

  // Breadth-first expansion from the focus node, treating edges as undirected.
  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const list = neighbours.get(from);
    if (list) list.push(to);
    else neighbours.set(from, [to]);
  };
  for (const edge of allEdges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const reached = new Set<string>([focusId]);
  let frontier = [focusId];
  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of neighbours.get(id) ?? []) {
        if (!reached.has(neighbour)) {
          reached.add(neighbour);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: [...reached].map((id) => allNodes.get(id)).filter((node): node is GraphNode => Boolean(node)),
    edges: allEdges.filter((edge) => reached.has(edge.source) && reached.has(edge.target)),
  };
}
