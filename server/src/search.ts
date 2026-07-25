import { buildCorpus } from "./corpus.js";
import type { Db } from "./db.js";
import { cosine, lexicalOverlap, tokenize } from "./embedder.js";
import { buildAffinity, graphAffinity } from "./graph.js";
import { canView } from "./rbac.js";
import { loadArtifacts } from "./repo.js";
import type { Artifact, ArtifactType, SearchResult, User } from "./types.js";

export interface SearchOptions {
  q?: string;
  type?: ArtifactType;
  minTrust?: number;
  certifiedOnly?: boolean;
  sort?: "relevance" | "trust" | "recent" | "usage";
  limit?: number;
}

/** Relevance weights when the caller typed a query. */
const QUERY_WEIGHTS = { semantic: 0.55, graph: 0.2, trust: 0.25 };
/** Browsing with no query: relevance falls back to graph position and trust. */
const BROWSE_WEIGHTS = { semantic: 0, graph: 0.45, trust: 0.55 };

/** Text similarity below this is treated as "not a match" rather than a weak one. */
const MATCH_FLOOR = 0.03;

export function search(
  db: Db,
  user: User | null,
  options: SearchOptions,
): { results: SearchResult[]; tookMs: number } {
  const startedAt = performance.now();
  const query = (options.q ?? "").trim();
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));

  // Archived artifacts are excluded from discovery; they remain reachable
  // through the registry with status=archived, which is their audit trail.
  const candidates = loadArtifacts(db, "a.status != 'archived'").filter((artifact) => canView(artifact, user));

  const corpus = buildCorpus(candidates);
  const affinity = buildAffinity(db, user);
  const weights = query ? QUERY_WEIGHTS : BROWSE_WEIGHTS;
  const queryTerms = query ? tokenize(query) : [];
  const queryVector = query ? corpus.embedder.embed(query) : null;

  const scored: SearchResult[] = [];
  for (const artifact of candidates) {
    if (options.type && artifact.type !== options.type) continue;
    if (options.certifiedOnly && !artifact.certified) continue;
    if (options.minTrust !== undefined && artifact.trustScore < options.minTrust) continue;

    let semantic = 0;
    if (queryVector) {
      const vectorScore = cosine(queryVector, corpus.vectorOf(artifact.id));
      const lexical = lexicalOverlap(queryTerms, `${artifact.name} ${artifact.tags.join(" ")}`);
      semantic = 0.85 * vectorScore + 0.15 * lexical;
      if (semantic < MATCH_FLOOR) continue;
    }

    const graph = graphAffinity(artifact, affinity);
    const trust = artifact.trustScore / 100;
    const score = weights.semantic * semantic + weights.graph * graph.score + weights.trust * trust;

    scored.push({
      artifact,
      score: round(score),
      breakdown: { semantic: round(semantic), graph: round(graph.score), trust: round(trust) },
      reason: explain(artifact, semantic, graph.signals, Boolean(query)),
    });
  }

  scored.sort(comparator(options.sort ?? "relevance"));
  return { results: scored.slice(0, limit), tookMs: Math.round((performance.now() - startedAt) * 100) / 100 };
}

function comparator(sort: NonNullable<SearchOptions["sort"]>): (a: SearchResult, b: SearchResult) => number {
  switch (sort) {
    case "trust":
      return (a, b) => b.artifact.trustScore - a.artifact.trustScore || b.score - a.score;
    case "recent":
      return (a, b) => b.artifact.updatedAt.localeCompare(a.artifact.updatedAt);
    case "usage":
      return (a, b) => b.artifact.trust.usageCount - a.artifact.trust.usageCount || b.score - a.score;
    default:
      return (a, b) => b.score - a.score;
  }
}

/** Turns the strongest contributing signals into a sentence a user can act on. */
function explain(artifact: Artifact, semantic: number, signals: string[], hasQuery: boolean): string {
  const parts: string[] = [];
  if (hasQuery) {
    if (semantic >= 0.45) parts.push("Strong match for your query");
    else if (semantic >= 0.2) parts.push("Related to your query");
    else parts.push("Loosely related to your query");
  }
  if (artifact.certified) parts.push("certified by leadership");
  parts.push(...signals.slice(0, 2));
  if (parts.length < 2 && artifact.trustScore >= 70) parts.push(`high trust score (${artifact.trustScore})`);
  if (parts.length === 0) parts.push(`trust score ${artifact.trustScore}`);

  const sentence = parts.join(" · ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
