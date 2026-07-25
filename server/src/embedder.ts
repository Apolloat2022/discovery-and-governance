/**
 * Local, deterministic text embeddings.
 *
 * The prototype must run offline and sub-second, so vectors are TF-IDF over the
 * artifact corpus rather than model embeddings. Everything downstream (search,
 * dedup, duplicate clustering) talks to the `Embedder` interface only, so a
 * hosted embedding provider can replace this without touching callers.
 */

export type SparseVector = Map<string, number>;

export interface Embedder {
  /** Identifies the vector space; stored vectors are invalid across ids. */
  readonly id: string;
  /** Builds the vocabulary / IDF table from the corpus. */
  fit(documents: string[]): void;
  embed(text: string): SparseVector;
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "for", "from",
  "has", "have", "how", "in", "into", "is", "it", "its", "of", "on", "or", "our",
  "that", "the", "their", "then", "there", "these", "they", "this", "to", "up",
  "use", "used", "using", "was", "were", "what", "when", "which", "who", "will",
  "with", "you", "your", "we", "if", "not", "no", "do", "does", "so", "such",
]);

/** Cheap suffix stemmer — applied identically to documents and queries. */
function stem(word: string): string {
  let w = word;
  if (w.endsWith("'s")) w = w.slice(0, -2);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().split(/[^a-z0-9+#]+/);
  const out: string[] = [];
  for (const token of raw) {
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    const stemmed = stem(token);
    if (stemmed.length >= 2 && !STOPWORDS.has(stemmed)) out.push(stemmed);
  }
  return out;
}

export class TfIdfEmbedder implements Embedder {
  readonly id = "tfidf-v1";
  private idf = new Map<string, number>();
  private fallbackIdf = 1;

  fit(documents: string[]): void {
    const df = new Map<string, number>();
    for (const doc of documents) {
      for (const term of new Set(tokenize(doc))) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
    const n = documents.length;
    this.idf = new Map();
    for (const [term, count] of df) {
      this.idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
    }
    // Terms absent from the corpus are maximally distinctive.
    this.fallbackIdf = Math.log(n + 1) + 1;
  }

  embed(text: string): SparseVector {
    const counts = new Map<string, number>();
    for (const term of tokenize(text)) counts.set(term, (counts.get(term) ?? 0) + 1);

    const vector: SparseVector = new Map();
    let norm = 0;
    for (const [term, count] of counts) {
      const weight = (1 + Math.log(count)) * (this.idf.get(term) ?? this.fallbackIdf);
      vector.set(term, weight);
      norm += weight * weight;
    }
    if (norm === 0) return vector;
    const scale = 1 / Math.sqrt(norm);
    for (const [term, weight] of vector) vector.set(term, weight * scale);
    return vector;
  }
}

/** Cosine similarity of two unit-normalized sparse vectors. */
export function cosine(a: SparseVector, b: SparseVector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }
  return dot < 0 ? 0 : dot > 1 ? 1 : dot;
}

/** Fraction of query terms that appear literally in `text`. Used as a lexical assist. */
export function lexicalOverlap(queryTerms: string[], text: string): number {
  if (queryTerms.length === 0) return 0;
  const target = new Set(tokenize(text));
  let hits = 0;
  for (const term of queryTerms) if (target.has(term)) hits += 1;
  return hits / queryTerms.length;
}
