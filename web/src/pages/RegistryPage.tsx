import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Artifact, ArtifactStatus, ArtifactType } from "../api/types";
import { ARTIFACT_TYPES } from "../api/types";
import { CertifiedBadge, StatusPill, TypeBadge } from "../components/Badges";
import { ApiDownBlock, LoadingBlock, StateBlock } from "../components/StateBlock";
import { TrustMeter } from "../components/TrustMeter";
import { useAsync } from "../hooks/useAsync";
import { formatRelativeDate, titleCase } from "../lib/format";

type SortKey = "trust" | "usage" | "updated";

function teamLabel(teamId: string): string {
  return titleCase(teamId.replace(/^team_/, "").replace(/_/g, " "));
}

export function RegistryPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<ArtifactType | "">("");
  const [status, setStatus] = useState<ArtifactStatus | "">("");
  const [teamId, setTeamId] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("trust");
  const [sortDesc, setSortDesc] = useState(true);

  const { data, loading, error, apiDown, reload } = useAsync(
    () => api.getArtifacts({ type: type || undefined, status: status || undefined, teamId: teamId || undefined }),
    [type, status, teamId],
  );

  const teams = useMemo(() => {
    const ids = new Set((data ?? []).map((a) => a.teamId));
    return [...ids].sort();
  }, [data]);

  const sorted = useMemo(() => {
    if (!data) return [];
    const copy = [...data];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === "trust") diff = a.trustScore - b.trustScore;
      else if (sortKey === "usage") diff = a.trust.usageCount - b.trust.usageCount;
      else diff = a.updatedAt.localeCompare(b.updatedAt);
      return sortDesc ? -diff : diff;
    });
    return copy;
  }, [data, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return "";
    return sortDesc ? " ↓" : " ↑";
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Registry</h1>
          <p className="page-subtitle">Every capability tracked by Prism, including archived history.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/registry/new")}>
          + New capability
        </button>
      </div>

      <div className="card card-pad flex-row" style={{ flexWrap: "wrap" }}>
        <select className="input" style={{ width: "auto" }} value={type} onChange={(e) => setType(e.target.value as ArtifactType | "")}>
          <option value="">All types</option>
          {ARTIFACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </select>

        <select className="input" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value as ArtifactStatus | "")}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="flagged">Flagged</option>
          <option value="archived">Archived</option>
        </select>

        <select className="input" style={{ width: "auto" }} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">All teams</option>
          {teams.map((id) => (
            <option key={id} value={id}>
              {teamLabel(id)}
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingBlock label="Loading registry…" />}
      {apiDown && <ApiDownBlock onRetry={reload} />}
      {!loading && !apiDown && error && <StateBlock icon="✕" title="Couldn't load the registry" detail={error} />}

      {!loading && !apiDown && !error && (
        <div className="card">
          {sorted.length === 0 ? (
            <StateBlock icon="▤" title="No capabilities match these filters" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Team</th>
                    <th>Status</th>
                    <th className="sortable" onClick={() => toggleSort("trust")}>
                      Trust{sortIndicator("trust")}
                    </th>
                    <th className="sortable" onClick={() => toggleSort("usage")}>
                      Usage{sortIndicator("usage")}
                    </th>
                    <th className="sortable" onClick={() => toggleSort("updated")}>
                      Updated{sortIndicator("updated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((artifact: Artifact) => (
                    <tr key={artifact.id} className="table-row-link" onClick={() => navigate(`/artifacts/${artifact.id}`)}>
                      <td>
                        <div className="flex-row" style={{ gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{artifact.name}</span>
                          {artifact.certified && <CertifiedBadge />}
                        </div>
                      </td>
                      <td>
                        <TypeBadge type={artifact.type} />
                      </td>
                      <td className="text-muted">{teamLabel(artifact.teamId)}</td>
                      <td>
                        <StatusPill status={artifact.status} />
                      </td>
                      <td>
                        <TrustMeter score={artifact.trustScore} compact />
                      </td>
                      <td className="mono text-muted">{artifact.trust.usageCount}</td>
                      <td className="text-muted">{formatRelativeDate(artifact.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
