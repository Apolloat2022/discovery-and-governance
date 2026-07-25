import "./quiet.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Loaded through require rather than a static import: ES modules link the whole
// graph before any body runs, so a static import would emit node:sqlite's
// experimental warning before ./quiet could silence it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/**
 * Storage adapter. Node's built-in `node:sqlite` driver is used instead of
 * better-sqlite3 because this project targets Node 25, which has no prebuilt
 * better-sqlite3 binaries. The surface below (exec/get/all/run/tx) is the only
 * thing the rest of the server touches, so swapping drivers is a one-file change.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = resolve(HERE, "..", "data", "prism.db");

export type Row = Record<string, unknown>;

export class Db {
  private readonly handle: InstanceType<typeof DatabaseSync>;

  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.handle = new DatabaseSync(path);
    this.handle.exec("PRAGMA journal_mode = WAL");
    this.handle.exec("PRAGMA foreign_keys = ON");
  }

  exec(sql: string): void {
    this.handle.exec(sql);
  }

  all<T = Row>(sql: string, params: unknown[] = []): T[] {
    return this.handle.prepare(sql).all(...(params as never[])) as T[];
  }

  get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
    return this.handle.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  run(sql: string, params: unknown[] = []): void {
    this.handle.prepare(sql).run(...(params as never[]));
  }

  /** Runs `fn` inside a transaction, rolling back if it throws. */
  tx<T>(fn: () => T): T {
    this.exec("BEGIN");
    try {
      const out = fn();
      this.exec("COMMIT");
      return out;
    } catch (err) {
      this.exec("ROLLBACK");
      throw err;
    }
  }

  close(): void {
    this.handle.close();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  objective  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  role     TEXT NOT NULL CHECK (role IN ('admin','lead','member')),
  team_id  TEXT NOT NULL REFERENCES teams(id),
  title    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('prompt','agent','skill','workflow')),
  description    TEXT NOT NULL,
  content        TEXT NOT NULL,
  inputs         TEXT NOT NULL DEFAULT '[]',
  outputs        TEXT NOT NULL DEFAULT '[]',
  tags           TEXT NOT NULL DEFAULT '[]',
  owner_id       TEXT NOT NULL REFERENCES users(id),
  team_id        TEXT NOT NULL REFERENCES teams(id),
  security_scope TEXT NOT NULL CHECK (security_scope IN ('public','team','restricted')),
  status         TEXT NOT NULL CHECK (status IN ('active','flagged','archived')),
  certified      INTEGER NOT NULL DEFAULT 0,
  parent_id      TEXT REFERENCES artifacts(id),
  root_id        TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  -- Telemetry absorbed from artifacts merged into this one. Kept as additive
  -- counters so the merged artifact's own history stays intact and auditable.
  merged_usage        INTEGER NOT NULL DEFAULT 0,
  merged_successes    INTEGER NOT NULL DEFAULT 0,
  merged_tokens       INTEGER NOT NULL DEFAULT 0,
  merged_cost_usd     REAL    NOT NULL DEFAULT 0,
  merged_rating_sum   INTEGER NOT NULL DEFAULT 0,
  merged_rating_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_artifacts_root   ON artifacts(root_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_parent ON artifacts(parent_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_team   ON artifacts(team_id);

CREATE TABLE IF NOT EXISTS ratings (
  id          TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  TEXT NOT NULL,
  UNIQUE (artifact_id, user_id)
);

CREATE TABLE IF NOT EXISTS execution_events (
  id          TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  user_id     TEXT REFERENCES users(id),
  success     INTEGER NOT NULL,
  latency_ms  INTEGER NOT NULL,
  tokens      INTEGER NOT NULL,
  cost_usd    REAL NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exec_artifact ON execution_events(artifact_id);
CREATE INDEX IF NOT EXISTS idx_exec_created  ON execution_events(created_at);
CREATE INDEX IF NOT EXISTS idx_exec_user     ON execution_events(user_id);

CREATE TABLE IF NOT EXISTS flags (
  id              TEXT PRIMARY KEY,
  artifact_id     TEXT NOT NULL REFERENCES artifacts(id),
  kind            TEXT NOT NULL CHECK (kind IN ('stale','duplicate','unreliable')),
  detail          TEXT NOT NULL,
  duplicate_of_id TEXT REFERENCES artifacts(id),
  status          TEXT NOT NULL CHECK (status IN ('open','resolved')),
  created_at      TEXT NOT NULL,
  resolution      TEXT,
  resolved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_flags_status ON flags(status);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  team_id     TEXT NOT NULL REFERENCES teams(id),
  created_at  TEXT NOT NULL
);

-- Graph edges that are not derivable from the base tables. Ownership,
-- membership, forks and executions are derived at query time instead.
CREATE TABLE IF NOT EXISTS edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  kind   TEXT NOT NULL CHECK (kind IN ('workingOn','relatesTo')),
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (source, target, kind)
);
`;

export function openDb(path = process.env.PRISM_DB ?? DEFAULT_DB_PATH): Db {
  const db = new Db(path);
  db.exec(SCHEMA);
  return db;
}

/** Deletes any existing database file (and WAL sidecars) before recreating it. */
export function resetDbFile(path: string): void {
  if (path === ":memory:") return;
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = path + suffix;
    if (existsSync(target)) rmSync(target, { force: true });
  }
}
