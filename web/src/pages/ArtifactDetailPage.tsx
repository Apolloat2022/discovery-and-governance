import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { ArtifactDetailResponse, LineageNode, TelemetryDay } from "../api/types";
import { CertifiedBadge, StatusPill, TypeBadge } from "../components/Badges";
import { LineageTree } from "../components/LineageTree";
import { Modal } from "../components/Modal";
import { PreviewCard } from "../components/PreviewCard";
import { StarRating } from "../components/StarRating";
import { ApiDownBlock, LoadingBlock, StateBlock } from "../components/StateBlock";
import { TelemetryChart } from "../components/TelemetryChart";
import { TrustMeter } from "../components/TrustMeter";
import { useAsync } from "../hooks/useAsync";
import { formatDate, formatRelativeDate, formatTokens, formatUsd, titleCase } from "../lib/format";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad flex-col">
      <h2 className="section-title">{title}</h2>
      {children}
    </div>
  );
}

export function ArtifactDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const detail = useAsync<ArtifactDetailResponse>(() => api.getArtifact(id), [id]);
  const lineage = useAsync<{ tree: LineageNode }>(() => api.getLineage(id), [id]);
  const telemetry = useAsync<{ daily: TelemetryDay[] }>(() => api.getTelemetry(id, 90), [id]);

  const [executing, setExecuting] = useState(false);
  const [executeMessage, setExecuteMessage] = useState<string | null>(null);
  const [forkOpen, setForkOpen] = useState(false);

  if (detail.apiDown) return <div className="page"><ApiDownBlock onRetry={detail.reload} /></div>;
  if (detail.loading) return <div className="page"><LoadingBlock label="Loading capability…" /></div>;
  if (detail.error || !detail.data) {
    return (
      <div className="page">
        <StateBlock icon="✕" title="Couldn't load this capability" detail={detail.error ?? "Not found or you don't have access."} />
      </div>
    );
  }

  const { artifact, owner, team, related } = detail.data;

  async function handleExecute() {
    setExecuting(true);
    setExecuteMessage(null);
    try {
      const result = await api.executeArtifact(id);
      setExecuteMessage(result.event.success ? "Run recorded — succeeded." : "Run recorded — failed.");
      detail.reload();
      telemetry.reload();
    } catch (err) {
      setExecuteMessage(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  }

  async function handleRate(rating: number) {
    try {
      await api.rateArtifact(id, rating);
      detail.reload();
    } catch {
      // Non-critical for the demo; the trust score simply won't move.
    }
  }

  return (
    <div className="page">
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="page-header">
        <div className="flex-col" style={{ gap: 8 }}>
          <div className="chip-row">
            <TypeBadge type={artifact.type} />
            <StatusPill status={artifact.status} />
            {artifact.certified && <CertifiedBadge />}
            <span className="badge" style={{ background: "var(--color-neutral-soft)", color: "var(--color-text-muted)" }}>
              {artifact.securityScope}
            </span>
          </div>
          <h1 className="page-title">{artifact.name}</h1>
          <p className="page-subtitle" style={{ maxWidth: 640 }}>
            {artifact.description}
          </p>
        </div>
        <TrustMeter score={artifact.trustScore} />
      </div>

      <div className="detail-grid">
        <div className="flex-col">
          <SectionCard title="Content">
            <pre className="code-block">{artifact.content}</pre>
          </SectionCard>

          <SectionCard title="Inputs & outputs">
            <div className="flex-row" style={{ alignItems: "flex-start", gap: "var(--space-6)" }}>
              <div className="flex-col" style={{ gap: 6, flex: 1 }}>
                <span className="text-faint text-sm">Inputs</span>
                <div className="tag-list">
                  {artifact.inputs.length === 0 && <span className="text-faint text-sm">None</span>}
                  {artifact.inputs.map((input) => (
                    <span className="tag" key={input}>
                      {input}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex-col" style={{ gap: 6, flex: 1 }}>
                <span className="text-faint text-sm">Outputs</span>
                <div className="tag-list">
                  {artifact.outputs.length === 0 && <span className="text-faint text-sm">None</span>}
                  {artifact.outputs.map((output) => (
                    <span className="tag" key={output}>
                      {output}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-col" style={{ gap: 6 }}>
              <span className="text-faint text-sm">Tags</span>
              <div className="tag-list">
                {artifact.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Usage over the last 90 days">
            {telemetry.loading && <LoadingBlock label="Loading telemetry…" />}
            {telemetry.apiDown && <ApiDownBlock onRetry={telemetry.reload} />}
            {telemetry.data && <TelemetryChart daily={telemetry.data.daily} />}
          </SectionCard>

          <SectionCard title="Lineage">
            {lineage.loading && <LoadingBlock label="Loading lineage…" />}
            {lineage.apiDown && <ApiDownBlock onRetry={lineage.reload} />}
            {lineage.data && <LineageTree tree={lineage.data.tree} currentId={artifact.id} />}
          </SectionCard>

          {related.length > 0 && (
            <SectionCard title="Related capabilities">
              <div className="flex-col">
                {related.map((r) => (
                  <PreviewCard
                    key={r.id}
                    result={{
                      artifact: r,
                      score: 0,
                      breakdown: { semantic: 0, graph: 0, trust: r.trustScore / 100 },
                      reason: "",
                    }}
                  />
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        <div className="flex-col">
          <div className="card card-pad flex-col">
            <h2 className="section-title">Actions</h2>
            <button type="button" className="btn btn-primary" onClick={handleExecute} disabled={executing || artifact.status === "archived"}>
              {executing ? "Running…" : "Execute (simulate)"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setForkOpen(true)}>
              Fork this capability
            </button>
            {executeMessage && <div className="text-faint text-sm">{executeMessage}</div>}

            <hr className="divider" />

            <div className="flex-col" style={{ gap: 4 }}>
              <span className="text-faint text-sm">Rate this capability</span>
              <StarRating value={null} onRate={handleRate} />
            </div>
          </div>

          <div className="card card-pad flex-col">
            <h2 className="section-title">Trust</h2>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Usage</span>
              <span className="mono">{artifact.trust.usageCount} runs</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Avg rating</span>
              <span className="mono">
                {artifact.trust.avgRating !== null ? `★ ${artifact.trust.avgRating.toFixed(1)} (${artifact.trust.ratingCount})` : "No ratings yet"}
              </span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Success rate</span>
              <span className="mono">{artifact.trust.successRate !== null ? `${Math.round(artifact.trust.successRate * 100)}%` : "—"}</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Certified</span>
              <span className="mono">{artifact.trust.certified ? "Yes" : "No"}</span>
            </div>
          </div>

          <div className="card card-pad flex-col">
            <h2 className="section-title">Cost</h2>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Total tokens</span>
              <span className="mono">{formatTokens(artifact.cost.totalTokens)}</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Total cost</span>
              <span className="mono">{formatUsd(artifact.cost.totalCostUsd)}</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Avg tokens/run</span>
              <span className="mono">{formatTokens(artifact.cost.avgTokensPerRun)}</span>
            </div>
          </div>

          <div className="card card-pad flex-col">
            <h2 className="section-title">Details</h2>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Owner</span>
              <span>{owner.name}</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Team</span>
              <span>{team.name}</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Scope</span>
              <span>{titleCase(artifact.securityScope)}</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Created</span>
              <span title={formatDate(artifact.createdAt)}>{formatRelativeDate(artifact.createdAt)}</span>
            </div>
            <div className="flex-row" style={{ justifyContent: "space-between" }}>
              <span className="text-muted text-sm">Last run</span>
              <span>{formatRelativeDate(artifact.lastExecutedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {forkOpen && <ForkDialog artifactId={artifact.id} defaultName={`${artifact.name} (fork)`} onClose={() => setForkOpen(false)} />}
    </div>
  );
}

function ForkDialog({ artifactId, defaultName, onClose }: { artifactId: string; defaultName: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const fork = await api.forkArtifact(artifactId, name.trim() ? { name: name.trim() } : {});
      navigate(`/artifacts/${fork.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fork failed");
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Fork this capability" onClose={onClose}>
      <p className="text-muted text-sm">
        Creates your own editable copy, linked back to this one in the lineage tree. Its visibility never widens beyond
        the original.
      </p>
      <div className="field">
        <label className="field-label" htmlFor="fork-name">
          Name
        </label>
        <input id="fork-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {error && <div className="banner banner-danger">{error}</div>}
      <div className="flex-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? "Forking…" : "Fork"}
        </button>
      </div>
    </Modal>
  );
}
