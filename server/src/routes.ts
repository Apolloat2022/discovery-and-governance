import type { FastifyInstance, FastifyRequest } from "fastify";
import { buildOverview } from "./analytics.js";
import {
  artifactTelemetry,
  buildLineage,
  createArtifact,
  executeArtifact,
  forkArtifact,
  rateArtifact,
  updateArtifact,
} from "./artifacts.js";
import type { Db } from "./db.js";
import { findRelated } from "./dedup.js";
import { badRequest, forbidden, notFound } from "./errors.js";
import { loadFlags, resolveFlag, runScan, type ResolveAction } from "./governance.js";
import { buildGraphView } from "./graph.js";
import { canGovern, canView } from "./rbac.js";
import { loadArtifact, loadArtifacts, loadTeam, loadUser, loadUsers } from "./repo.js";
import { recommendFor } from "./recommend.js";
import { search } from "./search.js";
import { ARTIFACT_TYPES, type ArtifactType, type User } from "./types.js";

type Query = Record<string, string | undefined>;

function caller(db: Db, request: FastifyRequest): User | null {
  const header = request.headers["x-user-id"];
  const id = Array.isArray(header) ? header[0] : header;
  return id ? loadUser(db, id) ?? null : null;
}

function asString(query: Query, key: string): string | undefined {
  const value = query[key];
  return value === undefined || value === "" ? undefined : String(value);
}

function asNumber(query: Query, key: string): number | undefined {
  const value = asString(query, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw badRequest(`"${key}" must be a number`);
  return parsed;
}

function asBoolean(query: Query, key: string): boolean | undefined {
  const value = asString(query, key);
  return value === undefined ? undefined : value === "true" || value === "1";
}

function asType(query: Query, key: string): ArtifactType | undefined {
  const value = asString(query, key);
  if (value === undefined) return undefined;
  if (!ARTIFACT_TYPES.includes(value as ArtifactType)) throw badRequest(`"${key}" is not a capability type`);
  return value as ArtifactType;
}

export function registerRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/health", async () => ({ status: "ok" }));

  // ---- identity -----------------------------------------------------------

  app.get("/api/users", async () => loadUsers(db));

  app.get("/api/me", async (request) => {
    const user = caller(db, request);
    return { user, team: user ? loadTeam(db, user.teamId) ?? null : null };
  });

  // ---- find ---------------------------------------------------------------

  app.get("/api/search", async (request) => {
    const query = request.query as Query;
    return search(db, caller(db, request), {
      q: asString(query, "q"),
      type: asType(query, "type"),
      minTrust: asNumber(query, "minTrust"),
      certifiedOnly: asBoolean(query, "certifiedOnly"),
      sort: asString(query, "sort") as "relevance" | "trust" | "recent" | "usage" | undefined,
      limit: asNumber(query, "limit"),
    });
  });

  app.get("/api/recommendations", async (request) => ({
    recommendations: recommendFor(db, caller(db, request)),
  }));

  app.get("/api/graph", async (request) => {
    const query = request.query as Query;
    return buildGraphView(db, caller(db, request), asString(query, "focus") ?? null, asNumber(query, "depth") ?? 2);
  });

  // ---- registry -----------------------------------------------------------

  app.get("/api/artifacts", async (request) => {
    const query = request.query as Query;
    const clauses: string[] = [];
    const params: unknown[] = [];
    const type = asType(query, "type");
    if (type) {
      clauses.push("a.type = ?");
      params.push(type);
    }
    for (const [key, column] of [["status", "a.status"], ["teamId", "a.team_id"], ["ownerId", "a.owner_id"]] as const) {
      const value = asString(query, key);
      if (value) {
        clauses.push(`${column} = ?`);
        params.push(value);
      }
    }
    const user = caller(db, request);
    return loadArtifacts(db, clauses.join(" AND "), params).filter((artifact) => canView(artifact, user));
  });

  app.get("/api/artifacts/:id", async (request) => {
    const user = caller(db, request);
    const { id } = request.params as { id: string };
    const artifact = loadArtifact(db, id);
    if (!artifact || !canView(artifact, user)) throw notFound("Artifact not found");
    return {
      artifact,
      owner: loadUser(db, artifact.ownerId) ?? null,
      team: loadTeam(db, artifact.teamId) ?? null,
      related: findRelated(db, user, artifact),
    };
  });

  app.post("/api/artifacts", async (request, reply) => {
    const artifact = createArtifact(db, caller(db, request), (request.body ?? {}) as Record<string, unknown>);
    return reply.code(201).send(artifact);
  });

  app.patch("/api/artifacts/:id", async (request) => {
    const { id } = request.params as { id: string };
    return updateArtifact(db, caller(db, request), id, (request.body ?? {}) as Record<string, unknown>);
  });

  app.post("/api/artifacts/:id/fork", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { name?: unknown; teamId?: unknown };
    return reply.code(201).send(forkArtifact(db, caller(db, request), id, body));
  });

  app.post("/api/artifacts/:id/rate", async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { rating?: unknown };
    return { artifact: rateArtifact(db, caller(db, request), id, body.rating) };
  });

  app.post("/api/artifacts/:id/execute", async (request) => {
    const { id } = request.params as { id: string };
    return executeArtifact(db, caller(db, request), id);
  });

  app.get("/api/artifacts/:id/lineage", async (request) => {
    const { id } = request.params as { id: string };
    return { tree: buildLineage(db, caller(db, request), id) };
  });

  app.get("/api/artifacts/:id/telemetry", async (request) => {
    const { id } = request.params as { id: string };
    const days = asNumber(request.query as Query, "days") ?? 90;
    return { daily: artifactTelemetry(db, caller(db, request), id, days) };
  });

  // ---- prune --------------------------------------------------------------

  app.get("/api/analytics/overview", async (request) => buildOverview(db, caller(db, request)));

  app.get("/api/governance/flags", async (request) => {
    const status = asString(request.query as Query, "status") ?? "open";
    if (!["open", "resolved", "all"].includes(status)) throw badRequest('"status" must be open, resolved or all');
    return { flags: loadFlags(db, status as "open" | "resolved" | "all", caller(db, request)) };
  });

  app.post("/api/governance/scan", async (request) => {
    const user = caller(db, request);
    if (!canGovern(user)) throw forbidden("Only team leads and admins can run a governance scan");
    return runScan(db);
  });

  app.post("/api/governance/flags/:id/resolve", async (request) => {
    const user = caller(db, request);
    if (!canGovern(user)) throw forbidden("Only team leads and admins can resolve flags");
    const { id } = request.params as { id: string };
    const action = ((request.body ?? {}) as { action?: unknown }).action;
    if (action !== "archive" && action !== "merge" && action !== "dismiss") {
      throw badRequest('"action" must be archive, merge or dismiss');
    }
    return { flag: resolveFlag(db, id, action as ResolveAction) };
  });
}
