import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { AnalyticsOverview } from "../api/types";
import { CertifiedBadge, TypeBadge } from "../components/Badges";
import { CostBarChart } from "../components/CostBarChart";
import { ApiDownBlock, LoadingBlock, StateBlock } from "../components/StateBlock";
import { useAsync } from "../hooks/useAsync";
import { formatRelativeDate, formatUsd } from "../lib/format";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card stat-tile">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
    </div>
  );
}

export function AnalyticsPage() {
  const navigate = useNavigate();
  const { data, loading, error, apiDown, reload } = useAsync<AnalyticsOverview>(() => api.getAnalyticsOverview(), []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Usage, cost and abandonment across everything you can see.</p>
        </div>
      </div>

      {loading && <LoadingBlock label="Loading analytics…" />}
      {apiDown && <ApiDownBlock onRetry={reload} />}
      {!loading && !apiDown && error && <StateBlock icon="✕" title="Couldn't load analytics" detail={error} />}

      {data && (
        <>
          <div className="stat-grid">
            <StatTile label="Total capabilities" value={data.totals.artifacts} />
            <StatTile label="Active" value={data.totals.active} />
            <StatTile label="Flagged" value={data.totals.flagged} />
            <StatTile label="Archived" value={data.totals.archived} />
            <StatTile label="Executions (30d)" value={data.totals.executions30d} />
            <StatTile label="Cost (30d)" value={formatUsd(data.totals.costUsd30d)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-5)", alignItems: "start" }}>
            <div className="card card-pad flex-col">
              <h2 className="section-title">Top by usage</h2>
              {data.topByUsage.length === 0 ? (
                <span className="text-faint text-sm">No usage recorded yet.</span>
              ) : (
                <div className="flex-col" style={{ gap: 4 }}>
                  {data.topByUsage.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex-row"
                      style={{ justifyContent: "space-between", cursor: "pointer", padding: "6px 0" }}
                      onClick={() => navigate(`/artifacts/${artifact.id}`)}
                    >
                      <div className="flex-row" style={{ minWidth: 0, gap: 8 }}>
                        <TypeBadge type={artifact.type} />
                        <span
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={artifact.name}
                        >
                          {artifact.name}
                        </span>
                        {artifact.certified && <CertifiedBadge />}
                      </div>
                      <span className="mono text-sm text-muted" style={{ flexShrink: 0 }}>
                        {artifact.trust.usageCount} runs
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card card-pad flex-col">
              <h2 className="section-title">Abandoned capabilities</h2>
              <p className="text-faint text-sm" style={{ marginTop: -6 }}>
                No executions in 60+ days — candidates for the governance queue.
              </p>
              {data.abandoned.length === 0 ? (
                <span className="text-faint text-sm">Nothing abandoned right now.</span>
              ) : (
                <div className="flex-col" style={{ gap: 4 }}>
                  {data.abandoned.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex-row"
                      style={{ justifyContent: "space-between", cursor: "pointer", padding: "6px 0" }}
                      onClick={() => navigate(`/artifacts/${artifact.id}`)}
                    >
                      <div className="flex-row" style={{ minWidth: 0, gap: 8 }}>
                        <TypeBadge type={artifact.type} />
                        <span
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={artifact.name}
                        >
                          {artifact.name}
                        </span>
                      </div>
                      <span className="text-faint text-sm" style={{ flexShrink: 0 }}>
                        last run {formatRelativeDate(artifact.lastExecutedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card card-pad flex-col">
            <h2 className="section-title">Cost by capability (30d)</h2>
            {data.costByArtifact.length === 0 ? (
              <span className="text-faint text-sm">No spend recorded in the last 30 days.</span>
            ) : (
              <CostBarChart items={data.costByArtifact} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
