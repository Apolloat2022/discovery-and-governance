import { artifactText, buildCorpus, type Indexable } from "./corpus.js";
import type { Db } from "./db.js";
import { canView } from "./rbac.js";
import { loadArtifacts } from "./repo.js";
import type { Artifact, User } from "./types.js";

/** Similarity at which creation is interrupted with "did you mean to use X?". */
export const DUPLICATE_SUSPECTED_THRESHOLD = 0.6;

export interface SimilarArtifact {
  artifact: Artifact;
  similarity: number;
}

/**
 * Checks a draft against everything the author could reuse. Candidates are
 * RBAC-filtered on purpose: suggesting an artifact the author cannot open would
 * both leak its existence and waste their time.
 */
export function findSimilarToDraft(
  db: Db,
  user: User | null,
  draft: Indexable,
  limit = 5,
): SimilarArtifact[] {
  const candidates = loadArtifacts(db, "a.status != 'archived'").filter((artifact) => canView(artifact, user));
  if (candidates.length === 0) return [];

  // The draft joins the corpus so its own terms contribute to the IDF table.
  const corpus = buildCorpus(candidates);
  const draftVector = corpus.embedder.embed(artifactText(draft));

  return corpus
    .similarTo(draftVector, { minimum: DUPLICATE_SUSPECTED_THRESHOLD })
    .slice(0, limit)
    .map(({ artifact, similarity }) => ({ artifact, similarity: Math.round(similarity * 1000) / 1000 }));
}

/** Related-capabilities list shown on an artifact's detail page. */
export function findRelated(db: Db, user: User | null, artifact: Artifact, limit = 5): Artifact[] {
  const candidates = loadArtifacts(db, "a.status != 'archived'").filter((other) => canView(other, user));
  // An archived artifact still gets a related list, so make sure it is indexed.
  if (!candidates.some((other) => other.id === artifact.id)) candidates.push(artifact);
  const corpus = buildCorpus(candidates);
  return corpus
    .similarTo(corpus.vectorOf(artifact.id), { exclude: artifact.id, minimum: 0.08 })
    .slice(0, limit)
    .map((match) => match.artifact);
}
