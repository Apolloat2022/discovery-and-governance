# Project Prism — Complete Guide

*Written for anyone new to this codebase — no prior context assumed.*

This is the one document to read start-to-finish to understand what Prism is, why it
exists, how to use it, and how it's built. For quicker reference material afterward, see
[Where to look things up](#where-to-look-things-up) at the end.

---

## 1. What is this?

**Prism is an internal tool that stops a company from reinventing the same AI prompt five
times.** As teams adopt AI, everyone starts writing their own prompts, agents, and
automated workflows. Without a shared place to find what already exists, the same "draft a
cold outreach email" prompt gets rebuilt independently by three different salespeople, none
of whom know about the other two — and nobody ever finds out which version actually works
best. That's **AI artifact sprawl**, and it's the problem this project solves.

Prism organizes every AI capability an org has — prompts, agents, skills, and multi-step
workflows — into one searchable registry, and actively manages its lifecycle instead of
letting it grow unchecked forever. It does that through three pillars:

| Pillar | What it does | Analogy |
|---|---|---|
| **Find** | Contextual search across everything the org has built, ranked by relevance *and* by what your team already trusts | Like an internal Google, but it also knows who you are and what your team uses |
| **Spread** | A trust score (usage, ratings, success rate, certification) plus the ability to fork a proven capability into your own context | Like GitHub stars + forking, applied to prompts instead of code |
| **Prune** | Automatically flags capabilities that are unused, duplicated, or unreliable, and routes them to a governance queue | Like a linter that runs on your organization's AI sprawl, not your code |

This is a **prototype** — fully working, but built to demonstrate the concept with
realistic seeded data rather than hooked up to a real company's actual LLM usage.

---

## 2. Use cases — who uses this and why

Walking through concrete scenarios is the fastest way to understand the product:

**"I need a prompt to draft a sales email — has someone already built this?"**
Kenji, a Sales Enablement Manager, opens Prism and searches "draft a cold outreach email
for a prospect." Instead of writing one from scratch, he finds an existing, *certified*
prompt his own team already runs 78 times — with a visible trust score and an explanation
of why it ranked first. He uses it instead of creating a fourth near-duplicate.

**"I want to adapt an existing capability for my region."**
Priya needs an EMEA-specific version of that same outreach email (different tone, adds a
compliance footer). Instead of copy-pasting the text into a new prompt (which Prism would
then have no way of connecting back to the original), she **forks** it. The fork keeps a
visible lineage back to the original, so anyone auditing "where did this come from" can
trace it — and two levels deeper, someone later forks *her* version into a German-language
variant. The lineage tree shows all three.

**"Before I build something new, let me check if it already exists."**
Someone starts creating a new capability and describes, in the form, almost exactly what
an existing prompt already does. Prism intercepts creation with **"Did you mean to use
this?"** — showing the existing capability and how similar it is — before a duplicate ever
gets saved. This is the single most important anti-sprawl feature in the product.

**"Which of these AI agents can I actually trust?"**
A team lead is deciding whether to roll out an invoice-processing skill more broadly. They
check its trust panel: 26 runs, only 31% success rate. Not certified. They decide not to
recommend it — and separately, Prism's governance engine has *already* flagged it as
`unreliable` automatically, without anyone having to notice by hand.

**"What's costing us money, and what's dead weight?"**
An admin opens Analytics: total spend over the last 30 days, which capabilities are used
most, and — critically — which ones haven't been touched in 60+ days. Those abandoned
capabilities are exactly what the governance queue also surfaces, so there's no
disagreement between "what analytics shows as unused" and "what governance flags."

**"Is this safe for a member of another team to see?"**
A refund-approval workflow touches financial policy and shouldn't be visible org-wide. It's
marked `restricted`, so it only appears for its owner and admins — everyone else's search
results, registry listing, and even direct link attempts simply don't include it (404, not
"access denied," so its existence isn't even revealed).

---

## 3. How to use it

### The live site

**https://prism-web-65s7.onrender.com**

Backed by **https://prism-api-ixux.onrender.com** (you won't need to hit this directly —
the frontend calls it for you — but it's useful for confirming the API itself is up:
`GET /api/health` returns `{"status":"ok"}`). The `-ixux`/`-65s7` suffixes exist because
`prism-api` and `prism-web` were already taken by other Render accounts; see §7 for why
that matters and how the two services are wired together despite it.

The backend is on Render's free web-service tier, which spins down after 15 minutes of
inactivity — if the site feels slow to load data on first visit after a while, that's a
~30-60s cold start, not a bug. The frontend (a static site) has no such delay.

### Running it yourself

```bash
git clone https://github.com/Apolloat2022/discovery-and-governance.git
cd discovery-and-governance
npm install
npm run seed     # builds the demo organisation from scratch
npm run dev       # API on :4100, dashboard on :5173
```

Then open `http://localhost:5173`.

### Walking through the UI

There's no real login — instead, a **user switcher** in the top-right lets you become any
of the eight seeded people (across three teams, three roles: admin/lead/member). This is
deliberate: it's the easiest way to demonstrate that the same screen shows different data
to different people, without building actual authentication for a prototype.

- **Search** (home page) — type a query, filter by capability type, minimum trust score, or
  certified-only, and sort by relevance/trust/recency/usage. Each result card shows *why*
  it ranked where it did, and can expand to show the semantic/graph/trust score breakdown.
- **Registry** — every capability as a sortable, filterable table, including archived ones
  (search hides archived items; the registry is where they're still reachable).
- **Registry → New capability** — the creation form. Try describing something that already
  exists and watch the duplicate intercept fire.
- **Click into any capability** — full detail: content, trust breakdown, cost, a 90-day
  usage chart, its fork lineage tree, related capabilities, and buttons to Execute
  (simulates a run), Rate, or Fork it.
- **Analytics** — org-wide usage, cost, and an abandoned-capabilities list.
- **Governance** — the queue of automatically-flagged capabilities (stale / duplicate /
  unreliable), with Archive / Merge / Dismiss actions. Only visible as *actionable* to team
  leads and admins — members see it read-only, which is itself demonstrating the
  permission model, not a bug.
- **Recommendations** — capabilities Prism thinks you'd benefit from adopting, based on
  what your team already uses.

---

## 4. Architecture — the big picture

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│   web/  (React + Vite)   │  HTTP   │   server/  (Fastify + node:sqlite) │
│                          │ ──────► │                                    │
│  Search · Registry ·     │  JSON   │  search · dedup · governance ·     │
│  Create · Detail ·       │ ◄────── │  trust · rbac · analytics ·        │
│  Analytics · Governance  │         │  recommend · artifacts             │
└─────────────────────────┘         └──────────────┬─────────────────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │   SQLite database    │
                                          │  (seeded demo data)  │
                                          └───────────────────────┘
```

It's a conventional two-tier web app: a React single-page app talks to a REST API over
JSON, backed by a single SQLite file. What makes it interesting isn't the shape — it's what
each backend module actually does, covered in §5.

**The contract.** `docs/API.md` is the single source of truth for every endpoint and every
JSON shape both sides agree on. If you're trying to understand what a page can *do*, read
that file — it's shorter than reading all the code, and it's guaranteed accurate (the
implementation was built and verified against it, not the other way around).

**Why these specific technology choices:**

| Choice | Why, not the "obvious" alternative |
|---|---|
| TF-IDF search, not a hosted embedding API | Runs fully offline, deterministically, sub-second, with zero API keys or cost — appropriate for a prototype. Sits behind an `Embedder` interface so a real embedding model is a one-file swap later. |
| `node:sqlite` (Node's built-in driver), not `better-sqlite3` | `better-sqlite3` needs a native binary compiled for your exact Node version; there wasn't a pre-built one for the Node version this was developed on. The built-in driver needs zero compilation and installs anywhere. |
| Fastify, not Express | Faster, has built-in schema-free JSON handling, and its plugin/hook model made the error-envelope and CORS handling in `app.ts` simple. |
| Hand-rolled CSS, not a UI library (MUI, Chakra, etc.) | Keeps the bundle small (~212KB total) and avoids fighting a component library's opinions for a UI this custom (lineage trees, score-breakdown bars). One design-token stylesheet, reused via utility classes. |
| No Redux/Zustand/etc. | The app's state is "whatever the current page fetched, plus which user is selected." A single `useAsync` hook and a `UserContext` cover that completely — a state library would be solving a problem this app doesn't have. |

---

## 5. How it's built — backend (`server/`)

~3,200 lines of TypeScript, one process, one SQLite file. Every module is small and does
one job:

| Module | What it actually does |
|---|---|
| `db.ts` | Thin wrapper around `node:sqlite`; owns the schema (teams, users, artifacts, ratings, execution_events, flags, tasks, edges) |
| `embedder.ts` | Turns text into TF-IDF vectors: tokenize → stem → weight by term frequency × inverse document frequency. Also does cosine similarity. |
| `corpus.ts` | Builds the vector index for the current set of visible artifacts, on every request (cheap at this scale — no caching needed) |
| `search.ts` | The ranking algorithm — see below |
| `trust.ts` | The trust score formula — see below |
| `graph.ts` | Models "how connected is this artifact to this person" — team ownership, past usage, lineage proximity, role/objective keyword overlap |
| `dedup.ts` | The "did you mean X?" check on creation, and the "related capabilities" list on the detail page — same similarity math, two different UIs |
| `governance.ts` | The three deprecation rules, and what happens when a flag gets resolved |
| `rbac.ts` | Three small functions — `canView`, `canEdit`, `canGovern` — called on every single read and write path |
| `artifacts.ts` | Create / update / fork / rate / execute / lineage / telemetry — the CRUD-ish core |
| `analytics.ts`, `recommend.ts` | The Prune dashboard and the Spread recommendation feed |
| `routes.ts` / `app.ts` / `index.ts` | HTTP layer: route wiring, CORS, the error-response envelope, server boot |
| `seed-data.ts` / `seed.ts` | The entire demo organization — see §5.6 |

### 5.1 How search ranking actually works

Every search result gets a score from 0 to 1, built from three components:

```
score = 0.55 × semantic  +  0.20 × graph  +  0.25 × trust     (when there's a query)
score = 0.45 × graph  +  0.55 × trust                          (browsing with no query)
```

- **semantic** — cosine similarity between your query's TF-IDF vector and the artifact's,
  blended with a small bonus for literal keyword overlap in the name/tags.
- **graph** — how connected the artifact is to *you*: does your team own it, has your team
  run it recently, have *you* personally used it, does it share lineage with something your
  team already relies on, does it match your job title or your team's stated objective.
- **trust** — the artifact's own trust score (below), normalized to 0–1.

The `reason` string shown on every card is generated from whichever of these signals
actually contributed — it's not a canned sentence, it's built from what was true for that
specific result.

### 5.2 How the trust score works

A single 0–100 number, computed fresh on every read (never stored, so it's always current):

```
trust = 30% × usage (log-scaled, saturates at ~50 runs)
      + 25% × average peer rating
      + 30% × execution success rate
      + 15% × certified bonus (all-or-nothing)
```

Log-scaling usage means going from 1 run to 10 matters a lot more than going from 100 to
110 — an artifact doesn't need to be run thousands of times to be considered "used."

### 5.3 How the duplicate-detection ("dedup") intercept works

When you try to create a new capability, its draft (name + description + content combined)
gets embedded the same way search queries do, and compared against every existing artifact
you're allowed to see. **Any match at cosine similarity ≥ 0.60 blocks creation** with a 409
response listing what it found, unless you explicitly pass `force: true`. This threshold
was tuned against the seeded data so genuinely different capabilities never intercept, but
near-rewordings of the same thing reliably do.

The same similarity math powers the "related capabilities" list on every artifact's detail
page — just with a much lower threshold (0.08) and no blocking, since that's a suggestion,
not a guardrail.

### 5.4 How the governance ("prune") engine works

Three independent rules, run as a batch scan (`POST /governance/scan`, and once at the end
of every seed):

| Rule | Trigger | What happens |
|---|---|---|
| **Stale** | Zero executions in 60+ days, and the artifact itself is older than 60 days | Flagged `stale` |
| **Duplicate** | Two *unrelated* artifacts (not in the same fork lineage) are ≥ 0.85 cosine similar | The lower-trust one is flagged, pointing at the higher-trust survivor |
| **Unreliable** | ≥ 10 runs with a success rate under 50% | Flagged `unreliable` |

The scan is **idempotent** — running it twice in a row never creates duplicate flags for
the same problem. Resolving a flag has three outcomes:

- **Archive** — the artifact is retired (removed from search, still visible in the
  registry). Nothing that forked from it breaks; lineage trees never get rewritten.
- **Merge** (duplicates only) — the redundant artifact's usage, cost, and ratings get added
  onto the survivor's totals (visibly — the survivor's numbers actually go up), then it's
  archived. This preserves the *history* of usage even though the artifact itself retires.
- **Dismiss** — false positive, the artifact goes back to `active`.

**Why forks are never flagged as duplicates of their own ancestors:** a fork is a
*deliberate* adaptation (the EMEA email variant, the billing-specific triage agent) — that's
the Spread pillar working as intended, not sprawl. Only artifacts built *independently* that
happen to converge on the same thing get flagged.

### 5.5 How permissions (RBAC) work

Every artifact has a `securityScope`: `public` (everyone), `team` (owner's team + admins),
or `restricted` (owner + admins only). This is checked on **every** read path — search,
detail, related, recommendations, analytics, lineage — not just the obvious ones. There's
no real login system; the caller's identity comes from an `X-User-Id` header the frontend
sends based on whoever's selected in the user switcher.

Writes are narrower than reads: editing needs to be the owner, their team's lead, or an
admin; granting `certified` status is admin-only; resolving a governance flag needs a lead
or admin. The frontend enforces this visibly (the Governance page goes read-only for
members with an explanation) rather than just letting the button 403 with no context.

### 5.6 The seed data

`seed-data.ts` hand-writes a full fictional org: 3 teams (Revenue Ops, Customer Support,
Platform Engineering), 8 people across admin/lead/member roles, and 40 realistic
capabilities — deliberately including fork chains 2-3 levels deep, a few pairs of
independently-recreated near-duplicates, some genuinely abandoned workflows, and one
artifact planted to fail most of the time. `seed.ts` then generates ~90 days of synthetic
execution history and ratings using a seeded random number generator, so the dataset is
*realistic* but *exactly reproducible* — running `npm run seed` twice produces identical
data both times, which is what makes the numbers throughout this guide and the README
verifiable rather than approximate.

---

## 6. How it's built — frontend (`web/`)

~2,350 lines of TypeScript/TSX, React 18 + Vite, no UI or charting library.

| Piece | Role |
|---|---|
| `src/api/types.ts` | Every type from `docs/API.md`, transcribed exactly — this file has no logic, it exists so the compiler catches contract mismatches |
| `src/api/client.ts` | One typed `fetch` wrapper. Attaches the `X-User-Id` header, parses the `{error:{code,message}}` envelope, and (as of the Render deploy) resolves against `VITE_API_BASE_URL` in production or a relative URL locally |
| `src/context/UserContext.tsx` | Holds the current user + the full user list; this is what the user switcher reads from and what drives the whole RBAC demo |
| `src/hooks/useAsync.ts` | The one data-fetching hook every page uses — handles loading/error/"API is down" states consistently everywhere instead of each page reinventing it |
| `src/pages/*.tsx` | One file per screen — Search, ArtifactDetail, Create, Registry, Analytics, Governance, Recommendations |
| `src/components/*.tsx` | Shared pieces: `PreviewCard`, `LineageTree` (recursive, renders the fork tree), `TelemetryChart`/`CostBarChart` (inline SVG, no chart library), `TrustMeter`, badges/pills, the user switcher |
| `src/styles/index.css` | One stylesheet: CSS custom properties for color/spacing/radius, then reusable utility classes (`.card`, `.btn`, `.badge`, `.pill`, …) that every component composes from |

**The one non-obvious design decision worth knowing:** the top bar's search box and the
Search page's own search box are two different inputs on purpose. The top bar box is a
quick-entry field that deep-links to `/?q=...` from *any* page; the Search page's box is
what actually drives the live, debounced query, seeded from that same `?q=` parameter on
load. Two boxes, one flow.

---

## 7. Deployment (Render)

`render.yaml` at the repo root is a Render **Blueprint** — infrastructure defined as a
committed file, not clicked together by hand in a dashboard. It defines two services:

- **`prism-api`** — the backend, a real (billable-by-default) Render web service, forced
  onto the free plan explicitly. It **reseeds its database on every boot**
  (`npm run seed && npm run start`) — deliberate, not a workaround: the free tier has no
  persistent disk, so every restart would lose local data anyway, and starting from a
  known-good demo dataset every time is actually the correct behavior for a public demo.
- **`prism-web`** — the frontend, a static site (Render serves these from a CDN, always-on,
  free by default with no plan field to set — see the gotcha below).

**Two real problems hit and fixed while setting this up — worth knowing since they're easy
to hit again:**

1. **Render Blueprints default to the paid tier.** Every service needs `plan: free`
   explicit, or you silently get billed. Caught this before the first deploy.
2. **Static sites don't support a `plan` field at all** — including one (even `plan: free`)
   fails Blueprint validation, because static sites have no paid/free distinction to select
   in the first place. This is the opposite problem from #1 and is why `prism-api` has
   `plan: free` but `prism-web` doesn't — that's correct, not an inconsistency.
3. **The two services are different origins in production.** Locally, Vite's dev server
   proxies `/api` to the backend, so the frontend code can just say `fetch("/api/...")`.
   On Render, `prism-web` and `prism-api` are on entirely different domains, so the
   frontend needs the backend's actual URL baked in — that's what `VITE_API_BASE_URL` is
   for, set as a build-time env var on `prism-web` and consumed in `client.ts`. Because
   Vite bakes env vars in at *build* time, changing this value requires a rebuild, not
   just a restart.

**Auto-deploy:** the GitHub repo is connected via Render's GitHub App (not just a pasted
public URL), so every push to `main` triggers an automatic redeploy of both services — no
manual "Deploy" click needed for future changes.

---

## 8. Running the test suite

```bash
npm test
```

35 backend tests (Vitest), covering: ranked search with its score breakdown and RBAC
filtering, the dedup intercept and its `force` bypass, fork lineage correctness, and the
full governance lifecycle — all three flag kinds, idempotent scanning, and
archive/merge/dismiss behaving exactly as described in §5.4. There is no frontend test
suite; frontend correctness was verified by direct API inspection and a clean production
build (see `PLAN.md` §4.3–4.4 for exactly what that covered).

---

## 9. Known issues / current status

**Live and fully verified end-to-end** as of this writing: both services deployed
successfully, `prism-api-ixux` responds correctly to search, analytics, and governance
requests with the real seeded dataset (40 artifacts, 8 open flags, exactly as `npm run
seed` produces locally), CORS is confirmed working for `prism-web`'s cross-origin calls to
it, and `prism-web` serves the correct production bundle — confirmed by checking that its
built-in API URL actually points at `prism-api-ixux`, not a stale or wrong one.

Two things worth knowing, both already handled but easy to re-trip if this gets rebuilt
under different service names later:

- **Both services briefly showed as "suspended"** (`x-render-routing: suspend-by-user`,
  HTTP 503) shortly after the first deploy — not a cold start (cold starts respond slowly
  but eventually succeed; a suspended service responds instantly with an explicit
  suspension page). This was resolved via the Render dashboard; if it recurs, check there
  for a banner explaining why and a resume action, rather than assuming it's transient.
- **The `-ixux`/`-65s7` suffixes** exist because `prism-api` and `prism-web` were already
  taken by other Render accounts — `render.yaml` and this guide both reflect the actual
  assigned names. If either service is ever deleted and recreated, it may get a *different*
  suffix, which would require updating `VITE_API_BASE_URL` in `render.yaml` (§7) and this
  section again.

**Out of scope for this prototype** (see `PLAN.md` §7 for the full list): real SSO/login
(the user switcher stands in for it), a hosted embedding model (TF-IDF stands in for it), a
real LLM gateway (Execute synthesizes a plausible result instead of calling a real model),
and Slack/Teams notifications (the Recommendations endpoint is the hook a real notification
system would read from).

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Artifact** | The generic name for any capability in the registry — a prompt, agent, skill, or workflow |
| **Lineage** | The fork history of an artifact — its parent, its parent's parent, and so on back to the original |
| **Trust score** | The 0–100 number blending usage, ratings, success rate, and certification (§5.2) |
| **Dedup intercept** | The "did you mean to use X?" block on creating a near-duplicate artifact (§5.3) |
| **Flag** | A governance-engine-raised issue against an artifact: stale, duplicate, or unreliable (§5.4) |
| **Security scope** | Who can see an artifact: `public`, `team`, or `restricted` (§5.5) |
| **RBAC** | Role-based access control — the permission system described in §5.5 |
| **Certified** | An executive/admin-granted trust signal, separate from the organic usage-based trust score |

---

## Where to look things up

This guide is the narrative walkthrough. For quick reference afterward:

- **`README.md`** — shorter product pitch, quickstart commands, and the deploy section
- **`docs/API.md`** — the exact contract: every endpoint, every JSON shape, plus an
  addendum of behavioral details (what's RBAC-filtered, what the dedup/merge/archive rules
  actually guarantee) that isn't obvious from the endpoint list alone
- **`PLAN.md`** — the full build history: how this was built in stages, every design
  decision and *why*, and what's intentionally out of scope for a prototype
- **`render.yaml`** — the deployment definition itself, commented inline
