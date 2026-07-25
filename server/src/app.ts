import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db.js";
import { ApiError } from "./errors.js";
import { registerRoutes } from "./routes.js";

export function buildApp(db: Db, options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  // The web app talks to the API through Vite's dev proxy, but permissive CORS
  // keeps direct calls (curl, another origin) working without extra plugins.
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-headers", "content-type, x-user-id");
    reply.header("access-control-allow-methods", "GET, POST, PATCH, OPTIONS");
  });

  app.options("/api/*", async (_request, reply) => reply.code(204).send());

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.status).send({
        error: { code: error.code, message: error.message },
        ...(error.extra ?? {}),
      });
    }
    if ((error as { statusCode?: number }).statusCode === 404) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
    }
    app.log.error(error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return reply.code(500).send({ error: { code: "INTERNAL", message } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } }),
  );

  registerRoutes(app, db);
  return app;
}
