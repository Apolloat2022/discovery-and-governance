import { cosine, TfIdfEmbedder, type Embedder, type SparseVector } from "./embedder.js";
import type { Artifact } from "./types.js";

/** The indexable fields of an artifact — also satisfied by an unsaved draft. */
export type Indexable = Pick<
  Artifact,
  "name" | "type" | "description" | "tags" | "inputs" | "outputs" | "content"
>;

/** Text an artifact is indexed by. The name is repeated so titles carry weight. */
export function artifactText(artifact: Indexable): string {
  return [
    artifact.name,
    artifact.name,
    artifact.type,
    artifact.description,
    artifact.tags.join(" "),
    artifact.inputs.join(" "),
    artifact.outputs.join(" "),
    artifact.content,
  ].join("\n");
}

export interface Corpus {
  embedder: Embedder;
  artifacts: Artifact[];
  vectorOf(id: string): SparseVector;
  similarTo(vector: SparseVector, options?: { exclude?: string; minimum?: number }): Array<{ artifact: Artifact; similarity: number }>;
}

/**
 * Builds the IDF table and artifact vectors for one request.
 *
 * At prototype scale (tens to low thousands of artifacts) this is ~1ms and
 * removes any chance of serving stale vectors after a write. A larger corpus
 * would cache this behind an invalidation hook on artifact mutation.
 */
export function buildCorpus(artifacts: Artifact[]): Corpus {
  const embedder = new TfIdfEmbedder();
  embedder.fit(artifacts.map(artifactText));

  const vectors = new Map<string, SparseVector>();
  for (const artifact of artifacts) vectors.set(artifact.id, embedder.embed(artifactText(artifact)));

  return {
    embedder,
    artifacts,
    vectorOf(id) {
      return vectors.get(id) ?? new Map();
    },
    similarTo(vector, options = {}) {
      const minimum = options.minimum ?? 0;
      const out: Array<{ artifact: Artifact; similarity: number }> = [];
      for (const artifact of artifacts) {
        if (artifact.id === options.exclude) continue;
        const similarity = cosine(vector, vectors.get(artifact.id) ?? new Map());
        if (similarity >= minimum) out.push({ artifact, similarity });
      }
      return out.sort((a, b) => b.similarity - a.similarity);
    },
  };
}
