import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { seed } from "../src/seed.js";

export interface Harness {
  db: Db;
  app: FastifyInstance;
  dispose(): Promise<void>;
}

/** Builds a throwaway, fully seeded Prism instance backed by a temp database. */
export async function createHarness(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "prism-test-"));
  const db = openDb(join(dir, "test.db"));
  seed(db);
  const app = buildApp(db);
  await app.ready();

  return {
    db,
    app,
    async dispose() {
      await app.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function api<T = unknown>(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH",
  url: string,
  options: { as?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const response = await app.inject({
    method,
    url,
    headers: options.as ? { "x-user-id": options.as } : {},
    ...(options.body === undefined ? {} : { payload: options.body as object }),
  });
  return { status: response.statusCode, body: response.json() as T };
}
