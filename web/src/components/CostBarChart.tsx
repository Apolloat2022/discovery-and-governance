import { useNavigate } from "react-router-dom";
import type { AnalyticsOverview } from "../api/types";
import { formatUsd } from "../lib/format";

export function CostBarChart({ items }: { items: AnalyticsOverview["costByArtifact"] }) {
  const navigate = useNavigate();
  const max = Math.max(1, ...items.map((i) => i.costUsd30d));

  return (
    <div className="flex-col" style={{ gap: 10 }}>
      {items.map((item) => (
        <div
          key={item.artifact.id}
          className="flex-row"
          style={{ gap: 12, cursor: "pointer" }}
          onClick={() => navigate(`/artifacts/${item.artifact.id}`)}
        >
          <span
            className="text-sm cost-bar-label"
            title={item.artifact.name}
          >
            {item.artifact.name}
          </span>
          <div style={{ flex: 1, background: "var(--color-neutral-soft)", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                width: `${(item.costUsd30d / max) * 100}%`,
                background: "var(--color-accent)",
                height: 18,
                borderRadius: 4,
                minWidth: 2,
              }}
            />
          </div>
          <span className="mono text-sm" style={{ width: 64, textAlign: "right", flexShrink: 0 }}>
            {formatUsd(item.costUsd30d)}
          </span>
        </div>
      ))}
    </div>
  );
}
