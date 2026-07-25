# Project Prism — Build & Handoff Plan

Enterprise AI Discovery, Search & Governance Platform. Solves "AI Artifact Sprawl" via three pillars: **Find** (context-aware capability search), **Spread** (trust-scored viral propagation with fork lineage), **Prune** (telemetry-driven autonomous deprecation).

**Status: all four workstreams complete. The prototype is fully built, tested, and documented — see `README.md` for the quickstart and demo walkthrough.**

| Workstream | State |
|---|---|
| 0 — Scaffold & contract | done |
| 1 — Backend core | **done, 35/35 tests passing, verified over HTTP** (§4.1) |
| 2 — Frontend dashboard | **done, clean build, verified against the live API** (§4.3) |
| 3 — Integration & README | **done — full acceptance checklist run end-to-end, `README.md` written, one contract inaccuracy found and fixed** (§4.4) |

Running it today:

```
npm install            # already done
npm run seed           # rebuild the demo org (3 teams, 40 artifacts, 90d telemetry, 8 flags)
npm run dev             # boots server on :4100 and web on :5173 together
npm test                # 35 backend tests
npm run build -w web   # typecheck + production build
```

## 1. Target of this build

A fully working, offline-runnable prototype (no external API keys or databases):

- **Monorepo** (npm workspaces): `server/` (Node + TypeScript + Fastify + better-sqlite3) and `web/` (React + Vite + TypeScript).
- **Vector search**: deterministic local TF-IDF embeddings + cosine similarity — sub-second, no external embedding service. Swappable `Embedder` interface so a real provider (OpenAI/Anthropic/Bedrock) can be dropped in later.
- **Knowledge & Capability Graph**: SQLite node/edge tables (users, teams, artifacts, tasks) with TS traversal; graph signals boost retrieval ranking (team affinity, role match, lineage proximity, prior executions).
- **Capability Registry**: standardized metadata schema — id, name, type (prompt|agent|skill|workflow), description, inputs/outputs, owner, team, security scope, lineage (parent/root), trust components, cost stats, status (active|flagged|archived). See `Artifact` in `docs/API.md`.
- **Trust score** (0–100): weighted blend of log-scaled usage count, avg peer rating, execution success rate, executive-certification bonus.
- **Dedup engine**: on artifact creation, cosine similarity ≥ 0.60 against existing artifacts triggers a "Did you mean to use X?" 409 intercept (creation proceeds only with `force: true`).
- **Deprecation engine**: rule pass over telemetry — 0 executions in 60 days → `stale`; pairwise similarity ≥ 0.85 → `duplicate` (lower-trust one flagged, pointing at the higher-trust survivor); success rate < 50% with ≥ 10 runs → `unreliable`. Governance endpoints resolve flags (archive / merge / dismiss) without breaking lineage; merge folds usage + ratings into the surviving artifact.
- **RBAC**: simulated auth via `X-User-Id` header; roles (admin, lead, member) × artifact security scope (public, team, restricted) enforced on every read path — search, detail, related, recommendations, analytics, graph, lineage.
- **Telemetry**: execution events (success, latency, token cost) per artifact; daily aggregates for the dashboard.
- **Seed data** (deterministic RNG): ~3 teams, ~8 users, ~40 realistic artifacts with fork lineage chains 2–3 deep, planted near-duplicates, stale and unreliable artifacts, ~90 days of executions + ratings; governance scan runs at the end of seeding so flags exist on first boot.
- **Frontend dashboard**: unified search with type/trust/certified filters and preview cards showing score breakdown; artifact detail with visual lineage tree, telemetry sparkline, execute/rate/fork actions; create flow with the dedup intercept panel; registry table; analytics (stat tiles, abandoned list, cost-by-artifact chart); governance queue with one-click resolve; recommendations; user switcher to demo RBAC.

## 2. Frozen API contract

`docs/API.md` is the single interface between the two workstreams. Backend implements it exactly; frontend transcribes its types and codes strictly against it. Neither side may edit it — contract changes go through the orchestrator/owner.

## 3. Workstreams & model assignment

| # | Workstream | Contents | Complexity | Assign to | Depends on |
|---|-----------|----------|------------|-----------|------------|
| 0 | Scaffold & contract | Root workspace `package.json`, `docs/API.md` | low | — | **done** |
| 1 | Backend core | Registry, embeddings/search ranking, graph, dedup, deprecation, RBAC, telemetry, seed, REST API, vitest tests | **high** — ranking/clustering algorithms, rule engine, RBAC on every path | **Opus** — *done* | 0 |
| 2 | Frontend dashboard | Search UX, preview cards, lineage tree, analytics, governance queue, recommendations, dedup-intercept panel | medium — conventional React against a fixed contract | **Sonnet** — *done* | 0 |
| 3 | Integration & verification | Boot both, exercise the checklist in §6, fix seams, write README | low–medium | **Sonnet** | 1 + 2 |

Rationale: workstream 1 concentrated all the judgment-heavy algorithmic work (blended ranking with explainable breakdowns, similarity clustering, idempotent governance rules, security filtering on every read path) — worth Opus. Workstream 2 is well-specified view work against a now-live contract — Sonnet is sufficient. Workstream 3 is mechanical verification.

## 4.1 What workstream 1 delivered

`server/` — TypeScript, Fastify on :4100, ~2,600 lines across small modules. Verified:
`npm install`, `npm run seed`, `npm test` (35/35), `npm run build -w server` (clean tsc),
plus live HTTP checks of search, dedup intercept, lineage, analytics, governance queue,
merge resolution, recommendations, and RBAC filtering.

**Storage decision:** Node 25 has no prebuilt better-sqlite3 binaries, so the build uses
the **built-in `node:sqlite`** driver — the fallback the original brief authorised. It sits
behind a five-method adapter in `src/db.ts`, so swapping drivers is a one-file change.
The upside is that the whole backend installs with zero native compilation.

| Module | Role |
|---|---|
| `db.ts` | SQLite adapter + schema (teams, users, artifacts, ratings, execution_events, flags, tasks, edges) |
| `embedder.ts` | `Embedder` interface + TF-IDF implementation, cosine, tokenizer/stemmer |
| `corpus.ts` | Builds the IDF table and artifact vectors per request |
| `search.ts` | Blended ranking: 0.55 semantic / 0.20 graph / 0.25 trust, with breakdown + reason |
| `graph.ts` | Capability graph: affinity model for ranking, plus the `/graph` node/edge view |
| `trust.ts` | 0-100 score: log-scaled usage, peer rating, success rate, certification |
| `dedup.ts` | Creation intercept (cosine ≥ 0.60) and the related-capabilities list |
| `governance.ts` | Deprecation rules (stale / duplicate / unreliable) + flag resolution |
| `rbac.ts` | `canView` / `canEdit` / `canGovern`, applied on every path |
| `artifacts.ts` | Create, patch, fork, rate, execute, lineage, telemetry |
| `analytics.ts`, `recommend.ts` | Prune dashboard and Spread suggestions |
| `routes.ts`, `app.ts`, `index.ts` | HTTP surface, error envelope, boot |
| `seed-data.ts`, `seed.ts` | The demo organisation and its telemetry generator |

**Decisions worth knowing** (all written up in the addendum at the bottom of `docs/API.md`,
which is now part of the contract):

- Search hides archived artifacts but still shows flagged ones; recommendations show
  neither. Spreading a capability the deprecation engine flagged would be self-defeating.
- Duplicate detection skips pairs within one lineage — a fork is a deliberate adaptation,
  not uncoordinated recreation. Without this rule every fork would be flagged and the
  fork feature would look broken.
- `merge` folds the redundant artifact's telemetry into the survivor via additive
  `merged_*` columns, so the source's own history stays intact and auditable.
- Neither archive nor merge rewrites `parentId`, so lineage trees never break.
- Writes are narrower than reads: certification is admin-only, governance actions are
  lead-or-admin. **The frontend must handle this** — see §5.2.

## 4.2 Repo layout

```
/package.json          # workspaces: server, web; dev/seed/test scripts          [built]
/docs/API.md           # contract + implementation addendum                      [built]
/PLAN.md               # this file
/server/               # Fastify API :4100, node:sqlite at server/data/prism.db  [built]
  src/{index,app,routes,db,quiet,errors,util,types}.ts
  src/{embedder,corpus,search,graph,trust,dedup,governance,rbac}.ts
  src/{artifacts,analytics,recommend,repo}.ts
  src/{seed,seed-data}.ts
  test/{helpers,search,rbac,registry,governance}.test.ts   # 35 tests
/web/                  # React+Vite :5173, /api proxied to :4100                 [built]
  src/api/{types,client}.ts
  src/context/UserContext.tsx
  src/pages/{Search,ArtifactDetail,Registry,Create,Analytics,Governance,Recommendations}Page.tsx
  src/components/...   # PreviewCard, LineageTree, TelemetryChart, CostBarChart, TrustMeter,
                        # Badges, StarRating, UserSwitcher, Layout, Modal, StateBlock
  src/hooks/useAsync.ts
  src/lib/format.ts
```

## 4.3 What workstream 2 delivered

`web/` — React 18 + Vite 6 + TypeScript strict, ~2,300 lines. No UI or charting library —
hand-rolled CSS (one `src/styles/index.css` design-token stylesheet) and inline SVG for the
lineage tree, telemetry bars and cost chart. Verified: `npm install`, `npm run build -w web`
(clean `tsc` + `vite build`), then booted the full stack with `npm run dev` from the root
and exercised every route and API call the pages make directly against the live, seeded
backend with curl — every field each component reads is present in the real responses.

A Chrome browser-automation extension was not available in this environment, so the UI was
not visually clicked through in a live browser. Everything short of that was verified:
clean type-check, clean production build, correct HMR compilation of every edit, all SPA
routes resolving under Vite's history fallback, and live data-shape checks (search,
artifact detail, lineage, telemetry, governance flags, analytics overview, recommendations,
and the 409 dedup-intercept payload) against the real API. **A human should still open
`http://localhost:5173` once and click through the flows below before calling this
launch-ready.**

| Page | Route | Notes |
|---|---|---|
| Search | `/` | Debounced query synced to `?q=`, type chips, min-trust slider, certified toggle, sort; preview cards with expandable score breakdown |
| Artifact detail | `/artifacts/:id` | Content block, trust/cost panels, lineage tree, 90-day telemetry bars, related artifacts, Execute/Rate/Fork actions |
| Create | `/registry/new` | Form → on 409 `DUPLICATE_SUSPECTED` shows the "Did you mean to use X?" panel with similarity %, Use existing / Create anyway |
| Registry | `/registry` | Type/status/team filters, sortable by trust/usage/updated, status pills; only place `status=archived` is reachable |
| Analytics | `/analytics` | Stat tiles, top-by-usage, abandoned list, cost-by-artifact bar chart |
| Governance | `/governance` | Open-flag queue, Archive/Merge/Dismiss, Run scan; **read-only with an explanatory banner** for members (non-lead/admin) |
| Recommendations | `/recommendations` | Cards with the reason string |

**Decisions worth knowing:**

- The topbar search box is a separate quick-entry field that deep-links to `/?q=...`; the
  Search page's own input is what actually drives the debounced live query, seeded from the
  `?q=` param on load. Two boxes, one flow — avoids fighting over focus/state.
- RBAC is enforced in the UI, not just left to 403s: the Governance page checks
  `currentUser.role` (via `UserContext.canGovern`) and renders the queue read-only with a
  banner for members, per the contract addendum's instruction.
- `useAsync` (in `src/hooks/`) is the one shared data-fetching hook every page uses; it
  distinguishes "the API is down" (`ApiUnreachableError`) from ordinary errors so pages can
  show a "start the server" message instead of a generic failure.
- Found and fixed one real bug during review: in the create flow, if "Create anyway"
  failed for a reason *other* than a duplicate, the error was being set on state that only
  renders inside the form view — but the duplicate-intercept view was still showing, so the
  error was silently invisible. Fixed by clearing the intercept state on any non-duplicate
  error so the form (and its error banner) reappears.

## 4.4 What workstream 3 delivered

A clean rebuild from scratch (`npm install` → `npm run seed` → `npm test` → `npm run build`
across both workspaces) followed by an end-to-end run of every row in the §6 acceptance
checklist against the live stack — not just spot checks, the actual flows a demo would
walk through:

- **Find**: searched as `u_kenji`, confirmed the certified `Enterprise Outreach Email
  Writer` outranks its untrusted near-copy with a visible score breakdown (14ms).
- **RBAC**: confirmed `art_secret_scan` (restricted) 404s for a same-team non-owner and an
  outsider, 200s for the owner and admin; confirmed analytics totals differ by caller
  (40 artifacts for the admin, 29 for a support member); confirmed governance write
  actions 403 for a member and succeed for a lead.
- **Spread**: triggered the dedup 409 and confirmed `force:true` creates anyway; forked
  `art_lead_scoring` and confirmed the fork's `securityScope` stays `team` (never widens);
  confirmed the three-level `art_ticket_triage` → `…tier2` → `…billing` lineage tree
  resolves correctly.
- **Prune**: confirmed all three flag kinds are present (4 stale, 3 duplicate, 1
  unreliable) with the exact detail strings the seed data implies; resolved a duplicate
  flag via merge and confirmed the survivor's usage count rose by exactly the redundant
  artifact's run count (118 → 127) while the redundant one archived; confirmed a second
  scan raises zero new flags (idempotent).

**One real integration bug found and fixed.** The contract addendum's dedup-demo guidance
("any prompt describing…") was tested literally and did *not* reliably trigger the
intercept — similarity is computed over name + description + content together, and a
generic or mismatched content field dilutes the score below the 0.60 threshold even when
the description matches closely. This is exactly the kind of seam workstream 3 exists to
catch: each half was individually correct against the contract, but the contract's own
usage guidance was incomplete. Fixed by replacing the vague phrasing in both
`docs/API.md`'s addendum and `README.md`'s walkthrough with a verified, copy-pasteable
name/description/content triplet, re-confirmed against a freshly seeded database
immediately before finishing (409 at 75%/72% similarity).

As with workstream 2, no Chrome browser-automation extension was available in this
environment, so verification is build + live API, not a literal visual click-through.
Everything else in the acceptance checklist below is now confirmed end-to-end rather than
inferred from separately-verified halves.

## 5. Hand-off briefs (paste to the assigned model as-is)

### 5.1 Workstream 1 — Backend (Opus) — ✅ COMPLETE

*Kept for the record; see §4.1 for what actually shipped and where it diverged.*

> You are building the backend for Project Prism. Working directory: `C:\Workspace\Projects\discovery-and-governance` (Windows, Node.js installed). First read `PLAN.md` and `docs/API.md` — the contract is FROZEN; implement it exactly, do not edit it. Your scope is `server/` only; a frontend is built in parallel under `web/` — never touch it or the root `package.json` beyond adding nothing (root already delegates `dev`/`seed`/`test` to `-w server`). You may run `npm install` from the root.
>
> Build `server/` as a TypeScript-strict Fastify API on port 4100, better-sqlite3 at `server/data/prism.db` (scripts: `dev` = `tsx watch src/index.ts`, `seed` = `tsx src/seed.ts`, `test` = `vitest run`, `build` = `tsc`):
> 1. **Schema**: users, teams, artifacts, ratings, execution_events, flags, tasks, graph edges — whatever is needed to implement every endpoint and type in the contract.
> 2. **Search**: deterministic TF-IDF embeddings (name+description+tags+content) behind an `Embedder` interface; final score blends semantic similarity, graph affinity (same team, caller's team has executed it, lineage proximity, role/tag match), and normalized trust. Return per-result `breakdown` and human-readable `reason`, plus `tookMs`. Sub-second on the seed dataset.
> 3. **Trust score** 0–100: log-scaled usage, avg rating, success rate, certification bonus; consistent recompute strategy.
> 4. **Dedup intercept**: POST /artifacts without `force` → 409 `DUPLICATE_SUSPECTED` with similar artifacts (cosine ≥ 0.60), per contract.
> 5. **Deprecation engine** (POST /governance/scan; also runs at end of seed): stale = 0 executions in 60 days (artifact older than 60 days); duplicate = pairwise cosine ≥ 0.85 among active artifacts (flag the lower-trust one, `duplicateOfId` = the higher-trust one); unreliable = success rate < 0.5 with ≥ 10 runs. Idempotent — no duplicate open flags per artifact+kind. Resolve actions per contract (archive preserves lineage; merge folds usage+ratings into target, then archives).
> 6. **RBAC**: `X-User-Id` → context. public = everyone; team = same team + admins; restricted = owner + admins. Enforce on every read path (search, related, recommendations, analytics, graph, lineage — filter invisible nodes). PATCH allowed for owner, their team lead, or admin.
> 7. **Seed** (deterministic RNG): ~3 teams with objectives, ~8 users across roles, ~40 realistic AI artifacts (sales-email drafting, support triage, code review, ETL, meeting summarization…), fork chains 2–3 deep, near-duplicate pairs, stale artifacts, one unreliable, ~90 days of executions with tokens/cost + ratings; rebuild DB from scratch each run; end with a governance scan.
> 8. **Tests** (vitest, temp DB): RBAC-filtered ranked search with breakdown; dedup intercept fires and `force` bypasses; fork sets parentId/rootId and lineage tree is correct; scan produces all three flag kinds and archive/merge behave per contract; restricted artifact invisible to a non-owner member.
> 9. **Verify before finishing**: root `npm install`, `npm run seed`, `npm test` pass; boot the server and hit search (with `X-User-Id`), artifact detail, lineage, analytics/overview, governance/flags — confirm shapes match the contract.
>
> Note: if better-sqlite3 fails to install on Windows, fall back to `node:sqlite` (Node 22+) or sql.js behind the same DB module interface. Small modules: db, embedder, search, trust, dedup, governance, rbac, routes, seed. Report: what was built, test results, endpoints exercised, contract ambiguities resolved.

### 5.2 Workstream 2 — Frontend (Sonnet) — ✅ COMPLETE

*Kept for the record; see §4.3 for what actually shipped, including one bug found and fixed
during review, and the one verification step (a live visual click-through) not possible in
this environment.*

> You are building the frontend for Project Prism, an AI capability discovery and governance platform. Working directory: `C:\Workspace\Projects\discovery-and-governance` (Windows, Node 25, npm workspaces, deps already installed at the root).
>
> **The backend is already built, seeded and working.** Read `docs/API.md` in full — including the "Implementation notes (v1 backend, shipped)" addendum at the bottom, which pins down behaviour the endpoint list alone does not. Read `PLAN.md` §4.1 for the architecture. Do not edit `docs/API.md`, `server/`, or the root `package.json`; your scope is `web/` only.
>
> Start the API and keep it running while you work — you can and should call it for real:
> ```
> npm run seed          # rebuilds the demo org; safe to re-run any time
> npm run dev -w server # API on http://localhost:4100/api
> curl -H "X-User-Id: u_kenji" "http://localhost:4100/api/search?q=outreach+email"
> ```
>
> Build `web/` as React + Vite + TypeScript strict (react-router-dom; no heavy UI or chart libraries — hand-rolled CSS and inline SVG). Scripts: `dev` (vite on 5173), `build` (`tsc -b && vite build`), `preview`. Vite must proxy `/api` → `http://localhost:4100`.
>
> 1. **API layer**: `src/api/types.ts` transcribing the contract's interfaces exactly; `src/api/client.ts`, a typed fetch wrapper that always sends `X-User-Id` for the selected user (persist the selection in localStorage) and surfaces the `{ error: { code, message } }` envelope — including the extra `similar` array on a 409.
> 2. **Layout**: clean, scannable enterprise dashboard. Left nav (Search, Registry, Analytics, Governance, Recommendations), top bar with "Prism", a global search box, and a **user switcher** built from `GET /users` showing name, role and team. Switching users is the RBAC demo — visible artifacts and analytics totals change. Light theme, system fonts, subtle borders, generous whitespace.
> 3. **Search (home)**: debounced instant search; capability-type filter chips; min-trust slider; certified-only toggle; sort dropdown. Results as **preview cards**: type badge, name, description, owner and team, trust meter, usage count, and the `reason` string; an expandable breakdown showing the semantic / graph / trust bars; display `tookMs`. Try `q=draft a cold outreach email for a prospect` as `u_kenji` — the certified original should outrank its untrusted near-copy, and the card should say why.
> 4. **Artifact detail**: full metadata (inputs, outputs, tags, scope, status, certified, cost), content in a code block, trust components, **visual lineage tree** from `GET /artifacts/:id/lineage` (indented CSS/SVG tree, current node highlighted, nodes clickable), related artifacts, a 90-day telemetry bar chart from `GET /artifacts/:id/telemetry`, and actions: Execute (simulate), Rate 1-5, Fork (dialog with optional name → navigate to the new artifact). `art_ticket_triage_billing` has a three-level lineage to build against.
> 5. **Create flow** (from Registry): form for name / type / description / content / tags / scope. On a 409 `DUPLICATE_SUSPECTED`, render the **"Did you mean to use X?"** intercept panel listing each similar artifact with its similarity as a percentage, and two paths: "Use existing" (navigate to it) and "Create anyway" (resubmit with `force: true`). This is the headline feature — make it the most polished screen in the app. The addendum names a draft that reliably triggers it.
> 6. **Registry**: table of artifacts with type / status / team filters, sortable by trust, usage and updated date; status as a coloured pill. This is also where archived artifacts are reachable (`status=archived`), since search hides them.
> 7. **Analytics**: stat tiles (total / active / flagged / archived, executions 30d, cost 30d), top-by-usage list, **abandoned artifacts** list, and a cost-by-artifact horizontal SVG bar chart.
> 8. **Governance**: the open-flag queue — kind badge (stale / duplicate / unreliable), artifact, detail string, and for duplicates a link to the survivor. Per-flag actions Archive / Merge (duplicates only) / Dismiss, plus a "Run scan" button. Refresh after each action; a merge visibly raises the survivor's usage count.
> 9. **Recommendations**: cards from `GET /recommendations` with their reason strings.
> 10. **RBAC in the UI, not in error toasts**: `POST /governance/scan` and `/flags/:id/resolve` are lead/admin only, and certification is admin-only. When the selected user is a member (`u_kenji`, `u_priya`, `u_hana`, `u_selin`), render the governance queue read-only with a short explanation instead of buttons that 403. Treat this as a feature of the demo.
> 11. Every page handles loading, empty, and API-unreachable states gracefully.
>
> Verify before finishing: `npm run build -w web` is clean, then run `npm run dev` from the root (boots API and web together) and click through every page against the seeded data. Report: pages and components built, build status, and anything in the contract that turned out to be ambiguous.

### 5.3 Workstream 3 — Integration (Sonnet) — ✅ COMPLETE

*Kept for the record; see §4.4 for what actually shipped, including the one contract
inaccuracy found and fixed.*

> `server/` and `web/` both exist and their briefs report success. From the repo root: `npm install`, `npm run seed`, `npm test`, then `npm run dev`. Exercise the acceptance checklist in `PLAN.md` §6 end to end, through the browser and against the API directly. Fix integration seams only — do not redesign either side; if the contract itself is wrong, stop and report rather than patching around it. Finish by writing `README.md`: what Prism is, quickstart, an architecture sketch, and a demo walkthrough of the three pillars (find → spread → prune) naming the exact users, queries and artifacts to click.

## 6. Acceptance checklist

Every row below was run end-to-end against the live stack (not inferred from the two
halves being separately verified) as part of workstream 3 — see §4.4 for the specifics.

| Criterion | Result |
|---|---|
| `npm install && npm run seed && npm run dev` boots :4100 and :5173 together | ✅ confirmed on a from-scratch reinstall |
| Ranked, RBAC-filtered search under 1s with score breakdown and reason | ✅ 14ms, certified original outranks its untrusted near-copy |
| Switching the demo user changes what is visible (team + restricted scoping) | ✅ 40 vs 29 visible artifacts; restricted artifact 404s for non-owner/admin |
| Near-duplicate creation triggers "Did you mean to use X?"; `force` creates anyway | ✅ 409 with similar[]; force:true creates; see the exact demo triplet in `README.md` |
| Forking produces a correct lineage tree | ✅ 3-level chain confirmed; fork never widens `securityScope` |
| Queue shows stale / duplicate / unreliable flags; archive keeps children's lineage; merge folds usage into the survivor | ✅ 4 stale + 3 duplicate + 1 unreliable; merge 118 → 127 runs; re-scan raises 0 new flags |
| Analytics shows usage, abandoned artifacts and cost per artifact | ✅ 618 runs / $7.26 in 30d, abandoned list matches the stale flags |
| RBAC on governance writes | ✅ member 403s, lead 200s on scan and resolve |

**Still open:** an actual visual click-through in a browser — no Chrome automation was
available in this environment for either workstream 2 or 3. Everything else that a human
would check by clicking has been verified by driving the same API calls the UI makes and
confirming the responses match what each component renders.

## 7. Out of scope for the prototype (noted for v2)

Real SSO/RBAC provider, real embedding models + ANN index, Neo4j-backed graph at scale, Slack/Teams/email proactive notifications (the recommendations endpoint is the hook), LLM-gateway connectors (OpenAI/Anthropic/Bedrock) for live execution, and background schedulers for the governance scan (exposed as an endpoint instead).
