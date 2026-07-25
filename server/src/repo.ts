import type { Db } from "./db.js";
import { computeTrust } from "./trust.js";
import type { Artifact, Team, User } from "./types.js";

interface ArtifactRow {
  id: string;
  name: string;
  type: Artifact["type"];
  description: string;
  content: string;
  inputs: string;
  outputs: string;
  tags: string;
  owner_id: string;
  team_id: string;
  security_scope: Artifact["securityScope"];
  status: Artifact["status"];
  certified: number;
  parent_id: string | null;
  root_id: string;
  created_at: string;
  updated_at: string;
  merged_usage: number;
  merged_successes: number;
  merged_tokens: number;
  merged_cost_usd: number;
  merged_rating_sum: number;
  merged_rating_count: number;
  exec_count: number;
  success_count: number;
  total_tokens: number;
  total_cost: number;
  last_exec: string | null;
  rating_sum: number;
  rating_count: number;
}

/**
 * Artifacts are always read through this projection so telemetry-derived fields
 * (trust, cost, last execution) are computed in one place. Correlated
 * subqueries are fine at prototype scale; a production build would maintain
 * these as materialized counters.
 */
const ARTIFACT_SELECT = `
SELECT a.*,
  (SELECT COUNT(*)                FROM execution_events e WHERE e.artifact_id = a.id)                 AS exec_count,
  (SELECT COUNT(*)                FROM execution_events e WHERE e.artifact_id = a.id AND e.success=1) AS success_count,
  (SELECT COALESCE(SUM(e.tokens),0)   FROM execution_events e WHERE e.artifact_id = a.id)             AS total_tokens,
  (SELECT COALESCE(SUM(e.cost_usd),0) FROM execution_events e WHERE e.artifact_id = a.id)             AS total_cost,
  (SELECT MAX(e.created_at)       FROM execution_events e WHERE e.artifact_id = a.id)                 AS last_exec,
  (SELECT COALESCE(SUM(r.rating),0)   FROM ratings r WHERE r.artifact_id = a.id)                      AS rating_sum,
  (SELECT COUNT(*)                FROM ratings r WHERE r.artifact_id = a.id)                          AS rating_count
FROM artifacts a`;

function parseList(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function hydrate(row: ArtifactRow): Artifact {
  const runCount = row.exec_count + row.merged_usage;
  const successCount = row.success_count + row.merged_successes;
  const ratingCount = row.rating_count + row.merged_rating_count;
  const ratingSum = row.rating_sum + row.merged_rating_sum;
  const totalTokens = row.total_tokens + row.merged_tokens;
  const totalCostUsd = row.total_cost + row.merged_cost_usd;

  const { trustScore, trust } = computeTrust({
    usageCount: runCount,
    runCount,
    successCount,
    ratingSum,
    ratingCount,
    certified: row.certified === 1,
  });

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    content: row.content,
    inputs: parseList(row.inputs),
    outputs: parseList(row.outputs),
    tags: parseList(row.tags),
    ownerId: row.owner_id,
    teamId: row.team_id,
    securityScope: row.security_scope,
    status: row.status,
    certified: row.certified === 1,
    parentId: row.parent_id,
    rootId: row.root_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trustScore,
    trust,
    cost: {
      totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      avgTokensPerRun: runCount > 0 ? Math.round(totalTokens / runCount) : 0,
    },
    lastExecutedAt: row.last_exec,
  };
}

export function loadArtifacts(db: Db, where = "", params: unknown[] = []): Artifact[] {
  const sql = `${ARTIFACT_SELECT}${where ? ` WHERE ${where}` : ""} ORDER BY a.name COLLATE NOCASE`;
  return db.all<ArtifactRow>(sql, params).map(hydrate);
}

export function loadArtifact(db: Db, id: string): Artifact | undefined {
  const row = db.get<ArtifactRow>(`${ARTIFACT_SELECT} WHERE a.id = ?`, [id]);
  return row ? hydrate(row) : undefined;
}

export function loadUser(db: Db, id: string): User | undefined {
  const row = db.get<{ id: string; name: string; role: User["role"]; team_id: string; title: string }>(
    "SELECT * FROM users WHERE id = ?",
    [id],
  );
  return row ? { id: row.id, name: row.name, role: row.role, teamId: row.team_id, title: row.title } : undefined;
}

export function loadUsers(db: Db): User[] {
  return db
    .all<{ id: string; name: string; role: User["role"]; team_id: string; title: string }>(
      "SELECT * FROM users ORDER BY name",
    )
    .map((row) => ({ id: row.id, name: row.name, role: row.role, teamId: row.team_id, title: row.title }));
}

export function loadTeam(db: Db, id: string): Team | undefined {
  return db.get<Team>("SELECT id, name, objective FROM teams WHERE id = ?", [id]);
}

export function loadTeams(db: Db): Team[] {
  return db.all<Team>("SELECT id, name, objective FROM teams ORDER BY name");
}
