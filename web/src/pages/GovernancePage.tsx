import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Flag, FlagAction } from "../api/types";
import { FlagKindBadge, TypeBadge } from "../components/Badges";
import { ApiDownBlock, LoadingBlock, StateBlock } from "../components/StateBlock";
import { useUser } from "../context/UserContext";
import { useAsync } from "../hooks/useAsync";
import { formatRelativeDate } from "../lib/format";

export function GovernancePage() {
  const navigate = useNavigate();
  const { currentUser, canGovern } = useUser();
  const { data, loading, error, apiDown, reload } = useAsync(() => api.getFlags("open"), []);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [banner, setBanner] = useState<{ text: string; tone: "info" | "danger" } | null>(null);

  async function resolve(flag: Flag, action: FlagAction) {
    setResolvingId(flag.id);
    try {
      await api.resolveFlag(flag.id, action);
      reload();
    } catch (err) {
      setBanner({ text: err instanceof Error ? err.message : "Couldn't resolve that flag", tone: "danger" });
    } finally {
      setResolvingId(null);
    }
  }

  async function runScan() {
    setScanning(true);
    setBanner(null);
    try {
      const result = await api.runGovernanceScan();
      setBanner({
        text:
          result.created > 0
            ? `Scan raised ${result.created} new flag${result.created === 1 ? "" : "s"}.`
            : "Scan complete — no new issues found.",
        tone: "info",
      });
      reload();
    } catch (err) {
      setBanner({ text: err instanceof Error ? err.message : "Scan failed", tone: "danger" });
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Governance queue</h1>
          <p className="page-subtitle">Stale, duplicate and unreliable capabilities flagged for review.</p>
        </div>
        {canGovern && (
          <button type="button" className="btn btn-secondary" onClick={runScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run scan"}
          </button>
        )}
      </div>

      {!canGovern && currentUser && (
        <div className="banner banner-info">
          <span>ⓘ</span>
          <span>
            You're viewing as <strong>{currentUser.name}</strong> ({currentUser.role}). Resolving flags is limited to
            team leads and admins — this queue is read-only for you. Switch to a lead or admin in the user switcher to
            take action.
          </span>
        </div>
      )}

      {banner && <div className={`banner banner-${banner.tone}`}>{banner.text}</div>}

      {loading && <LoadingBlock label="Loading the governance queue…" />}
      {apiDown && <ApiDownBlock onRetry={reload} />}
      {!loading && !apiDown && error && <StateBlock icon="✕" title="Couldn't load the queue" detail={error} />}

      {!loading && !apiDown && !error && data && (
        <>
          {data.flags.length === 0 ? (
            <StateBlock icon="◈" title="Queue is clear" detail="No open flags right now." />
          ) : (
            <div className="flex-col">
              {data.flags.map((flag) => (
                <div className="card card-pad" key={flag.id}>
                  <div className="flex-row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div className="flex-col" style={{ gap: 6, minWidth: 0, flex: 1 }}>
                      <div className="chip-row">
                        <FlagKindBadge kind={flag.kind} />
                        <TypeBadge type={flag.artifact.type} />
                      </div>
                      <div
                        className="result-card-name"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/artifacts/${flag.artifactId}`)}
                      >
                        {flag.artifact.name}
                      </div>
                      <div className="text-muted text-sm">{flag.detail}</div>
                      {flag.kind === "duplicate" && flag.duplicateOfId && (
                        <div className="text-sm">
                          Survivor:{" "}
                          <a
                            className="mono"
                            style={{ color: "var(--color-accent-strong)", cursor: "pointer" }}
                            onClick={() => navigate(`/artifacts/${flag.duplicateOfId}`)}
                          >
                            view capability →
                          </a>
                        </div>
                      )}
                      <div className="text-faint text-sm">Flagged {formatRelativeDate(flag.createdAt)}</div>
                    </div>

                    {canGovern && (
                      <div className="flex-row" style={{ flexWrap: "wrap" }}>
                        {flag.kind === "duplicate" && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={resolvingId === flag.id}
                            onClick={() => resolve(flag, "merge")}
                          >
                            Merge
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={resolvingId === flag.id}
                          onClick={() => resolve(flag, "archive")}
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={resolvingId === flag.id}
                          onClick={() => resolve(flag, "dismiss")}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
