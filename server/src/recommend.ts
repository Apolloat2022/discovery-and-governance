import type { Db } from "./db.js";
import { buildAffinity, graphAffinity } from "./graph.js";
import { canView } from "./rbac.js";
import { loadArtifacts } from "./repo.js";
import type { Artifact, User } from "./types.js";

/**
 * Proactive propagation: surface high-performing capabilities the caller has
 * not adopted yet. Artifacts they own or already run are excluded — those are
 * not discoveries — leaving genuinely new suggestions from adjacent teams.
 *
 * Only fully active artifacts qualify. Anything the deprecation engine has
 * flagged as stale, redundant or unreliable is still searchable, but pushing it
 * at more people would spread exactly the sprawl this platform exists to remove.
 */
/** Runs by the caller at which a capability counts as already adopted. */
const ADOPTED_AT_RUNS = 3;

export function recommendFor(
  db: Db,
  user: User | null,
  limit = 6,
): Array<{ artifact: Artifact; reason: string }> {
  if (!user) return [];

  const affinity = buildAffinity(db, user);
  const candidates = loadArtifacts(db, "a.status = 'active'")
    .filter((artifact) => canView(artifact, user))
    .filter((artifact) => artifact.ownerId !== user.id)
    .filter((artifact) => (affinity.myExecutions.get(artifact.id) ?? 0) < ADOPTED_AT_RUNS);

  return candidates
    .map((artifact) => {
      const graph = graphAffinity(artifact, affinity);
      const trust = artifact.trustScore / 100;
      return { artifact, score: 0.45 * graph.score + 0.55 * trust, signals: graph.signals };
    })
    .filter((entry) => entry.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ artifact, signals }) => ({ artifact, reason: reasonFor(artifact, signals) }));
}

function reasonFor(artifact: Artifact, signals: string[]): string {
  const parts: string[] = [];
  if (artifact.certified) parts.push("Certified by leadership");
  const usage = artifact.trust.usageCount;
  if (usage >= 10) parts.push(`${usage} runs across the org`);
  if (artifact.trust.successRate !== null && artifact.trust.successRate >= 0.9) {
    parts.push(`${Math.round(artifact.trust.successRate * 100)}% success rate`);
  }
  parts.push(...signals.filter((signal) => !signal.startsWith("you ")).slice(0, 1));
  if (parts.length === 0) parts.push(`Trust score ${artifact.trustScore}`);

  const sentence = parts.slice(0, 3).join(" · ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
