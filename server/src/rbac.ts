import type { Artifact, User } from "./types.js";

/**
 * Visibility rules, applied on every read path (search, detail, related,
 * recommendations, analytics, graph, lineage):
 *
 *   public     — everyone, including anonymous callers
 *   team       — members of the owning team, plus admins
 *   restricted — the owner, plus admins
 */
export function canView(artifact: Artifact, user: User | null): boolean {
  if (artifact.securityScope === "public") return true;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (artifact.securityScope === "team") return artifact.teamId === user.teamId;
  return artifact.ownerId === user.id;
}

export function visibleArtifacts(artifacts: Artifact[], user: User | null): Artifact[] {
  return artifacts.filter((artifact) => canView(artifact, user));
}

/** Writes are limited to the owner, the owning team's lead, and admins. */
export function canEdit(artifact: Artifact, user: User | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (artifact.ownerId === user.id) return true;
  return user.role === "lead" && user.teamId === artifact.teamId;
}

/** Governance actions (resolving flags) are reserved for leads and admins. */
export function canGovern(user: User | null): boolean {
  return user?.role === "admin" || user?.role === "lead";
}
