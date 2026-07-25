import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Recommendation } from "../api/types";
import { CertifiedBadge, TypeBadge } from "../components/Badges";
import { ApiDownBlock, LoadingBlock, StateBlock } from "../components/StateBlock";
import { TrustMeter } from "../components/TrustMeter";
import { useAsync } from "../hooks/useAsync";

export function RecommendationsPage() {
  const navigate = useNavigate();
  const { data, loading, error, apiDown, reload } = useAsync<{ recommendations: Recommendation[] }>(
    () => api.getRecommendations(),
    [],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Recommended for you</h1>
          <p className="page-subtitle">
            High-performing capabilities from across the org that you haven't adopted yet.
          </p>
        </div>
      </div>

      {loading && <LoadingBlock label="Finding recommendations…" />}
      {apiDown && <ApiDownBlock onRetry={reload} />}
      {!loading && !apiDown && error && <StateBlock icon="✕" title="Couldn't load recommendations" detail={error} />}

      {!loading && !apiDown && !error && data && (
        <>
          {data.recommendations.length === 0 ? (
            <StateBlock
              icon="✦"
              title="Nothing new to recommend right now"
              detail="You're already using most of what's relevant to you, or there isn't enough signal yet."
            />
          ) : (
            <div className="flex-col">
              {data.recommendations.map(({ artifact, reason }) => (
                <div
                  className="card card-pad result-card"
                  key={artifact.id}
                  onClick={() => navigate(`/artifacts/${artifact.id}`)}
                >
                  <div className="result-card-top">
                    <div className="flex-col" style={{ gap: 6, minWidth: 0 }}>
                      <div className="result-card-title-row">
                        <TypeBadge type={artifact.type} />
                        {artifact.certified && <CertifiedBadge />}
                      </div>
                      <div className="result-card-name">{artifact.name}</div>
                      <div className="result-card-desc">{artifact.description}</div>
                    </div>
                    <TrustMeter score={artifact.trustScore} />
                  </div>
                  <div className="result-card-reason">✦ {reason}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
