# Project Prism — API Contract (v1, FROZEN)

Both backend and frontend build against this file. Do not change shapes without updating this doc.

- Base URL: `http://localhost:4100/api` (Vite dev server proxies `/api` → `:4100`).
- Auth simulation: every request may carry `X-User-Id: <userId>`. Missing header = anonymous (sees only `public` scope). All read endpoints are RBAC-filtered by the caller's role/team vs. artifact `securityScope`.
- All responses JSON. Errors: `{ "error": { "code": string, "message": string } }` with appropriate HTTP status.

## Core types

```ts
type ArtifactType = "prompt" | "agent" | "skill" | "workflow";
type ArtifactStatus = "active" | "flagged" | "archived";
type SecurityScope = "public" | "team" | "restricted"; // restricted = owner + admins
type Role = "admin" | "lead" | "member";

interface User {
  id: string; name: string; role: Role; teamId: string; title: string;
}

interface Team { id: string; name: string; objective: string; }

interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  description: string;
  content: string;               // the prompt text / agent config / workflow def
  inputs: string[];              // named inputs
  outputs: string[];
  tags: string[];
  ownerId: string;
  teamId: string;
  securityScope: SecurityScope;
  status: ArtifactStatus;
  certified: boolean;            // executive certification tag
  parentId: string | null;       // fork lineage
  rootId: string;                // top of lineage tree (self if original)
  createdAt: string;             // ISO
  updatedAt: string;
  trustScore: number;            // 0..100
  trust: {                       // score components
    usageCount: number;
    avgRating: number | null;    // 1..5
    ratingCount: number;
    successRate: number | null;  // 0..1
    certified: boolean;
  };
  cost: { totalTokens: number; totalCostUsd: number; avgTokensPerRun: number };
  lastExecutedAt: string | null;
}
```

## Endpoints

### Users / context
- `GET /users` → `User[]` (for the demo user-switcher)
- `GET /me` → `{ user: User | null, team: Team | null }`

### Search
- `GET /search?q=&type=&minTrust=&certifiedOnly=&sort=&limit=`
  - `type`: optional ArtifactType; `sort`: `relevance` (default) | `trust` | `recent` | `usage`; `limit` default 20.
  - → `{ results: SearchResult[], tookMs: number }`
  ```ts
  interface SearchResult {
    artifact: Artifact;
    score: number;               // final blended score 0..1
    breakdown: { semantic: number; graph: number; trust: number }; // each 0..1
    reason: string;              // human-readable, e.g. "High trust; used by your team"
  }
  ```

### Registry
- `GET /artifacts?type=&status=&teamId=&ownerId=` → `Artifact[]`
- `GET /artifacts/:id` → `{ artifact: Artifact, owner: User, team: Team, related: Artifact[] }` (`related` = top-5 similar)
- `POST /artifacts` body `{ name, type, description, content, inputs?, outputs?, tags?, securityScope?, force? }`
  - Dedup intercept: if `force` is not true and a similar artifact exists (cosine ≥ 0.60), responds **409** with
    `{ error: { code: "DUPLICATE_SUSPECTED", message }, similar: { artifact: Artifact, similarity: number }[] }`
  - Otherwise **201** → `Artifact`
- `PATCH /artifacts/:id` (owner/lead/admin) partial update → `Artifact`
- `POST /artifacts/:id/fork` body `{ name?, teamId? }` → **201** `Artifact` (sets `parentId`, inherits `rootId`)
- `POST /artifacts/:id/rate` body `{ rating: 1|2|3|4|5 }` → `{ artifact: Artifact }`
- `POST /artifacts/:id/execute` body `{ simulate?: true }` → `{ event: ExecutionEvent, artifact: Artifact }`
  (prototype: synthesizes a realistic execution event — success ~90%, latency, token cost — and records it)
- `GET /artifacts/:id/lineage` → `{ tree: LineageNode }`
  ```ts
  interface LineageNode { artifact: Artifact; children: LineageNode[]; }
  ```
- `GET /artifacts/:id/telemetry?days=90` → `{ daily: { date: string; executions: number; successes: number; tokens: number }[] }`

### Recommendations (Spread)
- `GET /recommendations` → `{ recommendations: { artifact: Artifact; reason: string }[] }`
  (top capabilities for the caller based on team usage, role match, trust; excludes ones they own)

### Analytics (Prune)
- `GET /analytics/overview` → 
  `{ totals: { artifacts: number; active: number; flagged: number; archived: number; executions30d: number; costUsd30d: number },
     topByUsage: Artifact[], abandoned: Artifact[],  // 0 executions in 60d
     costByArtifact: { artifact: Artifact; costUsd30d: number; tokens30d: number }[] }`

### Governance
- `GET /governance/flags?status=open` → `{ flags: Flag[] }`
  ```ts
  interface Flag {
    id: string;
    artifactId: string;
    artifact: Artifact;
    kind: "stale" | "duplicate" | "unreliable";
    detail: string;                    // e.g. "0 executions in 74 days"
    duplicateOfId: string | null;      // for kind=duplicate
    status: "open" | "resolved";
    createdAt: string;
    resolution: "archived" | "merged" | "dismissed" | null;
  }
  ```
- `POST /governance/scan` → `{ created: number, flags: Flag[] }` (runs the deprecation rule pass now)
- `POST /governance/flags/:id/resolve` body `{ action: "archive" | "merge" | "dismiss" }` → `{ flag: Flag }`
  - `archive`: artifact → `archived` (stays searchable via status filter; lineage intact)
  - `merge` (duplicate flags only): flagged artifact archived, its usage/ratings folded into `duplicateOfId` target

### Graph
- `GET /graph?focus=<artifactId|userId>&depth=2` → `{ nodes: GraphNode[], edges: GraphEdge[] }`
  ```ts
  interface GraphNode { id: string; kind: "user" | "team" | "artifact" | "task"; label: string; meta?: Record<string, unknown>; }
  interface GraphEdge { source: string; target: string; kind: "owns" | "memberOf" | "forkOf" | "executed" | "workingOn" | "relatesTo"; weight: number; }
  ```

## Ports & scripts (root workspace)
- `npm run dev` → runs server (tsx watch, :4100) and web (vite, :5173) concurrently
- `npm run seed` → rebuilds `server/data/prism.db` with demo org + 90 days telemetry, then runs the governance scan once
- `npm test` → backend tests

---

# Implementation notes (v1 backend, shipped)

The backend is built and verified against everything above. No request or response
shape changed. These are behavioural details the frontend needs but the contract
above did not pin down — treat them as part of the contract from here on.

## Authorization

Read access is the RBAC rule stated at the top (public / team / restricted). Writes
are narrower, and the UI should disable actions rather than let them 403:

| Action | Allowed for | Failure |
|---|---|---|
| `POST /artifacts`, `/fork`, `/rate` | any signed-in user (`X-User-Id` present) | 401 if anonymous |
| `POST /artifacts/:id/execute` | anyone who can view the artifact | 400 if the artifact is archived |
| `PATCH /artifacts/:id` | owner, the owning team's **lead**, or an **admin** | 403 |
| `PATCH` with `certified` | **admin** only — certification is an executive signal | 403 |
| `POST /governance/scan` and `/flags/:id/resolve` | **lead** or **admin** only | 403 |

The seeded admin is `u_amara`; leads are `u_dilan`, `u_marco`, `u_tomas`. Selecting a
member in the user switcher and opening Governance is a legitimate demo of RBAC —
show the queue read-only and explain why, rather than surfacing a raw error.

## Behaviour the endpoints commit to

- **Search excludes archived artifacts.** Archiving is how sprawl gets retired, so
  archived items leave discovery but stay reachable through
  `GET /artifacts?status=archived`, which is their audit trail. Flagged artifacts
  *do* still appear in search — a flag is a governance signal, not a removal.
- **Recommendations only ever return `status: "active"` artifacts**, excluding ones
  the caller owns or has run 3+ times. Proactively spreading a capability the
  deprecation engine has flagged would be self-defeating.
- **`related` on the detail endpoint** excludes archived artifacts and the artifact
  itself; it is similarity-ranked and RBAC-filtered.
- **Dedup candidates are RBAC-filtered.** The intercept never names an artifact the
  author cannot open. Similarity is rounded to 3 decimals (`0.962` = 96%).
- **Lineage roots at the highest ancestor the caller can see.** If an ancestor is
  invisible to them, the tree starts below it rather than leaking its existence, so
  `tree.artifact.id` is not always the artifact's `rootId`.
- **Duplicate detection skips pairs inside one lineage.** A fork is a deliberate
  adaptation tracked by the lineage tree, so forks are never flagged as duplicates
  of their own ancestors. Independently recreated artifacts are.
- **Duplicate flags keep the more trusted artifact**; `duplicateOfId` is always the
  survivor, and the flagged artifact is the one to retire.
- **Resolving a flag**: `archive` sets the artifact to `archived` and auto-dismisses
  any other open flags on it (they are moot). `merge` folds the redundant artifact's
  executions, tokens, cost and ratings into `duplicateOfId`, then archives it — the
  survivor's `trust.usageCount` and `cost` visibly jump. Neither ever rewrites
  `parentId`, so children keep resolving and lineage trees stay intact. `dismiss`
  returns the artifact to `active` once no open flags remain.
- **Resolving an already-resolved flag** returns **409 `ALREADY_RESOLVED`**.
- `GET /governance/flags` accepts `status=open` (default), `resolved`, or `all`.
- **`POST /artifacts/:id/execute` synthesises a run** (~90% success, random latency
  and token cost) because no LLM gateway is attached. The response matches the
  contract; call it to make telemetry move during a demo.
- `GET /api/health` → `{ "status": "ok" }` is available for connectivity checks.
- `GET /users` needs no `X-User-Id` — it powers the switcher itself.

## Numbers to expect from a seeded database

3 teams, 8 users, 40 artifacts, ~1,660 executions, 96 ratings, and 8 open flags
(4 stale, 3 duplicate, 1 unreliable). 32 artifacts are `active`, 8 `flagged`, 0
`archived` until someone resolves a flag. Search responses come back in ~10-15ms.

Useful anchors for building screens:
- Deep lineage (3 levels): `art_ticket_triage` → `art_ticket_triage_tier2` → `art_ticket_triage_billing`
- Duplicate flag: `art_cold_email_v2`, 91% similar to `art_outreach_email`
- Unreliable flag: `art_invoice_extract`, 31% success across 26 runs
- Stale flag: `art_legacy_crm_sync`, never executed in 260 days
- Restricted artifacts (RBAC demo): `art_secret_scan`, `art_refund_policy`, `art_pricing_approval`
- **A draft that reliably trips the dedup intercept.** The description alone is not enough —
  similarity is computed over name + description + content together, so a generic or
  unrelated content field can dilute the score below the 0.60 threshold even when the
  description is a near match. Use all three fields verbatim for a demo that works every
  time (confirmed at 70-96% similarity against `art_outreach_email` / `art_cold_email_v2`
  depending on exact wording):
  - name: `Prospect Outreach Email Builder`
  - description: `Generates a personalised cold outreach email to an enterprise prospect using their industry, role, and a recent trigger event.`
  - content: `You are an enterprise sales writer. Draft a short outreach email to a prospect referencing a trigger event, under 120 words, ending with one call to action.`
