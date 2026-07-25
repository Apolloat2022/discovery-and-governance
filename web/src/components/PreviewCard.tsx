import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SearchResult } from "../api/types";
import { CertifiedBadge, StatusPill, TypeBadge } from "./Badges";
import { ScoreBreakdown, TrustMeter } from "./TrustMeter";

export function PreviewCard({ result }: { result: SearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { artifact, reason, breakdown } = result;

  return (
    <div className="card result-card" onClick={() => navigate(`/artifacts/${artifact.id}`)}>
      <div className="result-card-top">
        <div className="flex-col" style={{ gap: 6, minWidth: 0 }}>
          <div className="result-card-title-row">
            <TypeBadge type={artifact.type} />
            {artifact.certified && <CertifiedBadge />}
            {artifact.status !== "active" && <StatusPill status={artifact.status} />}
          </div>
          <div className="result-card-name">{artifact.name}</div>
          <div className="result-card-desc">{artifact.description}</div>
        </div>
        <TrustMeter score={artifact.trustScore} />
      </div>

      <div className="result-card-meta">
        <span>{artifact.teamId.replace("team_", "").replace("_", " ")}</span>
        <span>·</span>
        <span>{artifact.trust.usageCount} runs</span>
        {artifact.trust.avgRating !== null && (
          <>
            <span>·</span>
            <span>★ {artifact.trust.avgRating.toFixed(1)}</span>
          </>
        )}
      </div>

      {reason && <div className="result-card-reason">{reason}</div>}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ alignSelf: "flex-start", padding: "2px 8px" }}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
      >
        {expanded ? "Hide" : "Show"} score breakdown {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <div className="result-card-breakdown" onClick={(e) => e.stopPropagation()}>
          <ScoreBreakdown breakdown={breakdown} />
        </div>
      )}
    </div>
  );
}
