import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { ArtifactType, SecurityScope, SimilarArtifact } from "../api/types";
import { ARTIFACT_TYPES, SECURITY_SCOPES } from "../api/types";
import { CertifiedBadge, TypeBadge } from "../components/Badges";
import { TrustMeter } from "../components/TrustMeter";
import { titleCase } from "../lib/format";

interface Draft {
  name: string;
  type: ArtifactType;
  description: string;
  content: string;
  tags: string;
  securityScope: SecurityScope;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  type: "prompt",
  description: "",
  content: "",
  tags: "",
  securityScope: "team",
};

export function CreatePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarArtifact[] | null>(null);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSimilar(null);
  }

  async function submit(force: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createArtifact({
        name: draft.name.trim(),
        type: draft.type,
        description: draft.description.trim(),
        content: draft.content.trim(),
        tags: draft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        securityScope: draft.securityScope,
        force,
      });
      navigate(`/artifacts/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_SUSPECTED" && err.similar) {
        setSimilar(err.similar);
      } else {
        // Any other failure (including "create anyway" failing for a reason
        // unrelated to duplicates) drops back to the form so the error banner,
        // which only renders there, is actually visible.
        setSimilar(null);
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  const formValid = draft.name.trim() && draft.description.trim() && draft.content.trim();

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Create a capability</h1>
          <p className="page-subtitle">
            Prism checks for equivalent capabilities before letting a new one into the registry.
          </p>
        </div>
      </div>

      {similar && similar.length > 0 ? (
        <DuplicateIntercept
          similar={similar}
          onUseExisting={(id) => navigate(`/artifacts/${id}`)}
          onEditDraft={() => setSimilar(null)}
          onCreateAnyway={() => void submit(true)}
          submitting={submitting}
        />
      ) : (
        <form className="card card-pad flex-col" onSubmit={onSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="input"
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Renewal Risk Briefing Agent"
              required
            />
          </div>

          <div className="form-row">
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="type">
                Type
              </label>
              <select id="type" className="input" value={draft.type} onChange={(e) => update("type", e.target.value as ArtifactType)}>
                {ARTIFACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="scope">
                Security scope
              </label>
              <select
                id="scope"
                className="input"
                value={draft.securityScope}
                onChange={(e) => update("securityScope", e.target.value as SecurityScope)}
              >
                {SECURITY_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              className="input"
              rows={2}
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What does this capability do, in one or two sentences?"
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="content">
              Content
            </label>
            <textarea
              id="content"
              className="input"
              rows={8}
              value={draft.content}
              onChange={(e) => update("content", e.target.value)}
              placeholder="The prompt text, agent configuration, or workflow definition…"
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="tags">
              Tags (comma-separated)
            </label>
            <input
              id="tags"
              className="input"
              value={draft.tags}
              onChange={(e) => update("tags", e.target.value)}
              placeholder="sales, outreach, email"
            />
          </div>

          {error && <div className="banner banner-danger">{error}</div>}

          <div className="flex-row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={!formValid || submitting}>
              {submitting ? "Checking for duplicates…" : "Create capability"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function DuplicateIntercept({
  similar,
  onUseExisting,
  onEditDraft,
  onCreateAnyway,
  submitting,
}: {
  similar: SimilarArtifact[];
  onUseExisting: (id: string) => void;
  onEditDraft: () => void;
  onCreateAnyway: () => void;
  submitting: boolean;
}) {
  return (
    <div className="flex-col">
      <div className="banner banner-warning">
        <span style={{ fontSize: 18 }}>⚠</span>
        <span>
          <strong>Did you mean to use one of these?</strong> Prism found {similar.length} existing capabilit
          {similar.length === 1 ? "y" : "ies"} that look similar to what you're describing.
        </span>
      </div>

      <div className="flex-col">
        {similar.map(({ artifact, similarity }) => (
          <div className="card card-pad" key={artifact.id}>
            <div className="flex-row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div className="flex-col" style={{ gap: 6, minWidth: 0 }}>
                <div className="chip-row">
                  <TypeBadge type={artifact.type} />
                  {artifact.certified && <CertifiedBadge />}
                  <span
                    className="badge"
                    style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-strong)" }}
                  >
                    {Math.round(similarity * 100)}% similar
                  </span>
                </div>
                <div className="result-card-name">{artifact.name}</div>
                <div className="result-card-desc" style={{ WebkitLineClamp: 3 }}>
                  {artifact.description}
                </div>
                <div className="flex-row text-faint text-sm">
                  <TrustMeter score={artifact.trustScore} compact />
                  <span>·</span>
                  <span>{artifact.trust.usageCount} runs</span>
                </div>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onUseExisting(artifact.id)}>
                Use existing
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-ghost" onClick={onEditDraft}>
          ← Edit my draft
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCreateAnyway} disabled={submitting}>
          {submitting ? "Creating…" : "Create anyway"}
        </button>
      </div>
    </div>
  );
}
