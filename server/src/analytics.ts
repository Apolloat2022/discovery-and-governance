import type { Db } from "./db.js";
import { RULES } from "./governance.js";
import { canView } from "./rbac.js";
import { loadArtifacts } from "./repo.js";
import type { Artifact, User } from "./types.js";
import { isoDaysAgo } from "./util.js";

export interface AnalyticsOverview {
  totals: {
    artifacts: number;
    active: number;
    flagged: number;
    archived: number;
    executions30d: number;
    costUsd30d: number;
  };
  topByUsage: Artifact[];
  abandoned: Artifact[];
  costByArtifact: Array<{ artifact: Artifact; costUsd30d: number; tokens30d: number }>;
}

/** Every figure below counts only artifacts the caller is allowed to see. */
export function buildOverview(db: Db, user: User | null): AnalyticsOverview {
  const artifacts = loadArtifacts(db).filter((artifact) => canView(artifact, user));
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const since30 = isoDaysAgo(30);
  const since60 = isoDaysAgo(RULES.staleDays);

  const recent = db.all<{ artifact_id: string; runs: number; tokens: number; cost: number }>(
    `SELECT artifact_id, COUNT(*) AS runs, COALESCE(SUM(tokens),0) AS tokens,
            COALESCE(SUM(cost_usd),0) AS cost
       FROM execution_events WHERE created_at >= ? GROUP BY artifact_id`,
    [since30],
  ).filter((row) => byId.has(row.artifact_id));

  const totals = {
    artifacts: artifacts.length,
    active: artifacts.filter((a) => a.status === "active").length,
    flagged: artifacts.filter((a) => a.status === "flagged").length,
    archived: artifacts.filter((a) => a.status === "archived").length,
    executions30d: recent.reduce((sum, row) => sum + row.runs, 0),
    costUsd30d: Math.round(recent.reduce((sum, row) => sum + row.cost, 0) * 100) / 100,
  };

  const topByUsage = [...artifacts]
    .sort((a, b) => b.trust.usageCount - a.trust.usageCount)
    .slice(0, 10);

  // Abandonment mirrors the stale rule so the dashboard and the governance
  // queue never disagree about what counts as unused.
  const abandoned = artifacts
    .filter((a) => a.status !== "archived")
    .filter((a) => a.createdAt < since60 && (a.lastExecutedAt === null || a.lastExecutedAt < since60))
    .sort((a, b) => (a.lastExecutedAt ?? a.createdAt).localeCompare(b.lastExecutedAt ?? b.createdAt));

  const costByArtifact = recent
    .map((row) => ({
      artifact: byId.get(row.artifact_id)!,
      costUsd30d: Math.round(row.cost * 100) / 100,
      tokens30d: row.tokens,
    }))
    .sort((a, b) => b.costUsd30d - a.costUsd30d)
    .slice(0, 10);

  return { totals, topByUsage, abandoned, costByArtifact };
}
