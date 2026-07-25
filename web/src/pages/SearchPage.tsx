import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiUnreachableError, api } from "../api/client";
import type { ArtifactType, SearchResponse } from "../api/types";
import { ARTIFACT_TYPES } from "../api/types";
import { ApiDownBlock, LoadingBlock, StateBlock } from "../components/StateBlock";
import { PreviewCard } from "../components/PreviewCard";
import { titleCase } from "../lib/format";

type Sort = "relevance" | "trust" | "recent" | "usage";

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "trust", label: "Trust score" },
  { value: "recent", label: "Recently updated" },
  { value: "usage", label: "Most used" },
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [inputValue, setInputValue] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);
  const [type, setType] = useState<ArtifactType | null>(null);
  const [minTrust, setMinTrust] = useState(0);
  const [certifiedOnly, setCertifiedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("relevance");

  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiDown, setApiDown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Picks up query changes coming from the topbar search box.
  useEffect(() => {
    const urlQ = params.get("q") ?? "";
    if (urlQ !== query) {
      setInputValue(urlQ);
      setQuery(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Debounce free-text typing; filter changes below apply immediately.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(inputValue);
      setParams(inputValue ? { q: inputValue } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setApiDown(false);

    api
      .search({
        q: query || undefined,
        type: type ?? undefined,
        minTrust: minTrust > 0 ? minTrust : undefined,
        certifiedOnly: certifiedOnly || undefined,
        sort,
        limit: 30,
      })
      .then((result) => {
        if (!cancelled) setResponse(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiUnreachableError) setApiDown(true);
        else setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, type, minTrust, certifiedOnly, sort]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Find a capability</h1>
          <p className="page-subtitle">
            Search prompts, agents, skills and workflows before building something new.
          </p>
        </div>
      </div>

      <div className="card card-pad flex-col">
        <div className="search-input-wrap">
          <span className="search-input-icon">⌕</span>
          <input
            className="input"
            autoFocus
            placeholder="e.g. draft a cold outreach email for a prospect"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </div>

        <div className="flex-row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${type === null ? "selected" : ""}`}
              onClick={() => setType(null)}
            >
              All types
            </button>
            {ARTIFACT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip ${type === t ? "selected" : ""}`}
                onClick={() => setType(type === t ? null : t)}
              >
                {titleCase(t)}
              </button>
            ))}
          </div>

          <div className="flex-row">
            <label className="flex-row text-sm" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={certifiedOnly}
                onChange={(e) => setCertifiedOnly(e.target.checked)}
              />
              Certified only
            </label>

            <label className="flex-row text-sm" style={{ gap: 6 }}>
              Min trust
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={minTrust}
                onChange={(e) => setMinTrust(Number(e.target.value))}
              />
              <span className="mono" style={{ minWidth: 24 }}>
                {minTrust}
              </span>
            </label>

            <select className="input" style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <LoadingBlock label="Searching capabilities…" />}

      {!loading && apiDown && <ApiDownBlock />}

      {!loading && !apiDown && error && (
        <StateBlock icon="✕" title="Search failed" detail={error} />
      )}

      {!loading && !apiDown && !error && response && (
        <>
          <div className="text-faint text-sm">
            {response.results.length} result{response.results.length === 1 ? "" : "s"} · {response.tookMs}ms
          </div>

          {response.results.length === 0 ? (
            <StateBlock
              icon="⌕"
              title="No matching capabilities"
              detail="Nothing in the registry matches these filters yet. Consider creating a new capability from the Registry page — Prism will check for duplicates first."
            />
          ) : (
            <div className="flex-col">
              {response.results.map((result) => (
                <PreviewCard key={result.artifact.id} result={result} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
