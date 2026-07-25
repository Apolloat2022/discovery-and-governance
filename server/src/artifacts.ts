import type { Db } from "./db.js";
import { findSimilarToDraft, type SimilarArtifact } from "./dedup.js";
import { ApiError, badRequest, forbidden, notFound, unauthorized } from "./errors.js";
import { canEdit, canView } from "./rbac.js";
import { loadArtifact, loadArtifacts } from "./repo.js";
import {
  ARTIFACT_TYPES,
  SECURITY_SCOPES,
  type Artifact,
  type ArtifactType,
  type ExecutionEvent,
  type LineageNode,
  type SecurityScope,
  type User,
} from "./types.js";
import { isoDaysAgo, newId, nowIso } from "./util.js";

export interface CreateArtifactInput {
  name?: unknown;
  type?: unknown;
  description?: unknown;
  content?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  tags?: unknown;
  securityScope?: unknown;
  force?: unknown;
}

function requireString(value: unknown, field: string, max = 20_000): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`"${field}" is required`);
  }
  if (value.length > max) throw badRequest(`"${field}" exceeds ${max} characters`);
  return value.trim();
}

function optionalStringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw badRequest(`"${field}" must be an array of strings`);
  }
  return value.map((item) => (item as string).trim()).filter(Boolean);
}

export class DuplicateSuspectedError extends ApiError {
  constructor(similar: SimilarArtifact[]) {
    super(
      409,
      "DUPLICATE_SUSPECTED",
      "A similar capability already exists. Reuse it, or resubmit with force to create anyway.",
      { similar },
    );
  }
}

export function createArtifact(db: Db, user: User | null, input: CreateArtifactInput): Artifact {
  if (!user) throw unauthorized("Sign in to create a capability");

  const name = requireString(input.name, "name", 200);
  const description = requireString(input.description, "description", 2000);
  const content = requireString(input.content, "content");
  const type = input.type as ArtifactType;
  if (!ARTIFACT_TYPES.includes(type)) {
    throw badRequest(`"type" must be one of ${ARTIFACT_TYPES.join(", ")}`);
  }
  const securityScope = (input.securityScope ?? "team") as SecurityScope;
  if (!SECURITY_SCOPES.includes(securityScope)) {
    throw badRequest(`"securityScope" must be one of ${SECURITY_SCOPES.join(", ")}`);
  }

  const draft = {
    name,
    type,
    description,
    content,
    tags: optionalStringList(input.tags, "tags"),
    inputs: optionalStringList(input.inputs, "inputs"),
    outputs: optionalStringList(input.outputs, "outputs"),
  };

  // The sprawl intercept: only bypassed when the author explicitly insists.
  if (input.force !== true) {
    const similar = findSimilarToDraft(db, user, draft);
    if (similar.length > 0) throw new DuplicateSuspectedError(similar);
  }

  const id = newId("art");
  const timestamp = nowIso();
  db.run(
    `INSERT INTO artifacts (id, name, type, description, content, inputs, outputs, tags,
                            owner_id, team_id, security_scope, status, certified,
                            parent_id, root_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active', 0, NULL, ?, ?, ?)`,
    [
      id,
      draft.name,
      draft.type,
      draft.description,
      draft.content,
      JSON.stringify(draft.inputs),
      JSON.stringify(draft.outputs),
      JSON.stringify(draft.tags),
      user.id,
      user.teamId,
      securityScope,
      id,
      timestamp,
      timestamp,
    ],
  );

  return loadArtifact(db, id)!;
}

export function updateArtifact(db: Db, user: User | null, id: string, patch: Record<string, unknown>): Artifact {
  const artifact = loadArtifact(db, id);
  if (!artifact || !canView(artifact, user)) throw notFound("Artifact not found");
  if (!canEdit(artifact, user)) throw forbidden("Only the owner, their team lead, or an admin can edit this");

  const assignments: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown): void => {
    assignments.push(`${column} = ?`);
    params.push(value);
  };

  if (patch.name !== undefined) set("name", requireString(patch.name, "name", 200));
  if (patch.description !== undefined) set("description", requireString(patch.description, "description", 2000));
  if (patch.content !== undefined) set("content", requireString(patch.content, "content"));
  if (patch.tags !== undefined) set("tags", JSON.stringify(optionalStringList(patch.tags, "tags")));
  if (patch.inputs !== undefined) set("inputs", JSON.stringify(optionalStringList(patch.inputs, "inputs")));
  if (patch.outputs !== undefined) set("outputs", JSON.stringify(optionalStringList(patch.outputs, "outputs")));
  if (patch.securityScope !== undefined) {
    const scope = patch.securityScope as SecurityScope;
    if (!SECURITY_SCOPES.includes(scope)) throw badRequest("Invalid securityScope");
    set("security_scope", scope);
  }
  if (patch.status !== undefined) {
    const status = patch.status as Artifact["status"];
    if (!["active", "flagged", "archived"].includes(status)) throw badRequest("Invalid status");
    set("status", status);
  }
  if (patch.certified !== undefined) {
    // Certification is an executive signal, so only admins may grant it.
    if (user?.role !== "admin") throw forbidden("Only an admin can change certification");
    set("certified", patch.certified === true ? 1 : 0);
  }

  if (assignments.length === 0) return artifact;
  set("updated_at", nowIso());
  params.push(id);
  db.run(`UPDATE artifacts SET ${assignments.join(", ")} WHERE id = ?`, params);
  return loadArtifact(db, id)!;
}

/** Clones an artifact for the caller's context, preserving the lineage chain. */
export function forkArtifact(
  db: Db,
  user: User | null,
  id: string,
  options: { name?: unknown; teamId?: unknown },
): Artifact {
  if (!user) throw unauthorized("Sign in to fork a capability");
  const source = loadArtifact(db, id);
  if (!source || !canView(source, user)) throw notFound("Artifact not found");

  const teamId = typeof options.teamId === "string" && options.teamId ? options.teamId : user.teamId;
  if (!db.get("SELECT id FROM teams WHERE id = ?", [teamId])) throw badRequest("Unknown teamId");

  const name = typeof options.name === "string" && options.name.trim() ? options.name.trim() : `${source.name} (fork)`;
  const forkId = newId("art");
  const timestamp = nowIso();

  db.run(
    `INSERT INTO artifacts (id, name, type, description, content, inputs, outputs, tags,
                            owner_id, team_id, security_scope, status, certified,
                            parent_id, root_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active', 0, ?, ?, ?, ?)`,
    [
      forkId,
      name,
      source.type,
      source.description,
      source.content,
      JSON.stringify(source.inputs),
      JSON.stringify(source.outputs),
      JSON.stringify(source.tags),
      user.id,
      teamId,
      // A fork never widens exposure beyond the original.
      source.securityScope,
      source.id,
      source.rootId,
      timestamp,
      timestamp,
    ],
  );

  return loadArtifact(db, forkId)!;
}

export function rateArtifact(db: Db, user: User | null, id: string, rating: unknown): Artifact {
  if (!user) throw unauthorized("Sign in to rate a capability");
  const artifact = loadArtifact(db, id);
  if (!artifact || !canView(artifact, user)) throw notFound("Artifact not found");
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw badRequest('"rating" must be an integer between 1 and 5');
  }

  // One rating per person per artifact; re-rating replaces the previous score.
  db.run(
    `INSERT INTO ratings (id, artifact_id, user_id, rating, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT (artifact_id, user_id) DO UPDATE SET rating = excluded.rating, created_at = excluded.created_at`,
    [newId("rat"), id, user.id, rating, nowIso()],
  );
  return loadArtifact(db, id)!;
}

/**
 * Records an execution. The prototype has no LLM gateway attached, so it
 * synthesises a realistic outcome; a real deployment would receive these
 * events from the gateway instead.
 */
export function executeArtifact(
  db: Db,
  user: User | null,
  id: string,
): { event: ExecutionEvent; artifact: Artifact } {
  const artifact = loadArtifact(db, id);
  if (!artifact || !canView(artifact, user)) throw notFound("Artifact not found");
  if (artifact.status === "archived") throw badRequest("Archived capabilities cannot be executed");

  const success = Math.random() < 0.9;
  const tokens = 400 + Math.floor(Math.random() * 3200);
  const event: ExecutionEvent = {
    id: newId("evt"),
    artifactId: id,
    userId: user?.id ?? null,
    success,
    latencyMs: 350 + Math.floor(Math.random() * 3600),
    tokens,
    costUsd: Math.round(tokens * 0.000004 * 10000) / 10000,
    createdAt: nowIso(),
  };

  db.run(
    `INSERT INTO execution_events (id, artifact_id, user_id, success, latency_ms, tokens, cost_usd, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      event.id,
      event.artifactId,
      event.userId,
      event.success ? 1 : 0,
      event.latencyMs,
      event.tokens,
      event.costUsd,
      event.createdAt,
    ],
  );

  return { event, artifact: loadArtifact(db, id)! };
}

/**
 * Builds the lineage tree around an artifact. If an ancestor is invisible to
 * the caller, the tree is rooted at the highest ancestor they can see rather
 * than leaking the existence of the original.
 */
export function buildLineage(db: Db, user: User | null, id: string): LineageNode {
  const artifact = loadArtifact(db, id);
  if (!artifact || !canView(artifact, user)) throw notFound("Artifact not found");

  const family = loadArtifacts(db, "a.root_id = ?", [artifact.rootId]).filter((node) => canView(node, user));
  const byId = new Map(family.map((node) => [node.id, node]));

  let root = artifact;
  while (root.parentId) {
    const parent = byId.get(root.parentId);
    if (!parent) break;
    root = parent;
  }

  const childrenOf = new Map<string, Artifact[]>();
  for (const node of family) {
    if (!node.parentId || !byId.has(node.parentId)) continue;
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const build = (node: Artifact, seen: Set<string>): LineageNode => {
    seen.add(node.id);
    const children = (childrenOf.get(node.id) ?? [])
      .filter((child) => !seen.has(child.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((child) => build(child, seen));
    return { artifact: node, children };
  };

  return build(root, new Set());
}

export function artifactTelemetry(
  db: Db,
  user: User | null,
  id: string,
  days: number,
): Array<{ date: string; executions: number; successes: number; tokens: number }> {
  const artifact = loadArtifact(db, id);
  if (!artifact || !canView(artifact, user)) throw notFound("Artifact not found");

  const window = Math.max(1, Math.min(365, days));
  const rows = db.all<{ date: string; executions: number; successes: number; tokens: number }>(
    `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS executions,
            COALESCE(SUM(success),0) AS successes, COALESCE(SUM(tokens),0) AS tokens
       FROM execution_events WHERE artifact_id = ? AND created_at >= ?
       GROUP BY date`,
    [id, isoDaysAgo(window)],
  );

  // Fill gaps so charts get one point per day rather than a sparse series.
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const out: Array<{ date: string; executions: number; successes: number; tokens: number }> = [];
  for (let offset = window - 1; offset >= 0; offset -= 1) {
    const date = isoDaysAgo(offset).slice(0, 10);
    out.push(byDate.get(date) ?? { date, executions: 0, successes: 0, tokens: 0 });
  }
  return out;
}
