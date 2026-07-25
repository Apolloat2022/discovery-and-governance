# Project Prism

**An AI capability discovery and governance platform.** Prism exists to solve *AI artifact
sprawl* — the rapid, unmanaged proliferation of prompts, agents, skills and workflows across
an organization. Instead of letting every team quietly rebuild what another team already
has, Prism gives everyone one place to **find** what already exists, **spread** what works,
and **prune** what doesn't.

This is a fully working, offline-runnable prototype — no external API keys, no hosted
database, no LLM gateway. It runs entirely on your machine.

## The three pillars

- **Find** — a unified search across prompts, agents, skills and workflows that blends
  semantic relevance, your position in the org (team, role, what you're already using)
  and each capability's trust score, and explains *why* each result ranked where it did.
- **Spread** — a 0–100 trust score built from usage, peer ratings, execution success rate
  and executive certification; forking that preserves a full lineage tree back to the
  original; and proactive recommendations of high-performing capabilities you haven't
  adopted yet.
- **Prune** — an automated deprecation engine that flags capabilities as stale (unused
  60+ days), duplicate (near-identical to something more trusted), or unreliable (failing
  more often than not) — and a governance queue to archive, merge or dismiss each flag
  without ever breaking a lineage tree.

## Quickstart

Requires Node.js 22+ (built and tested on Node 25).

```bash
npm install          # installs both workspaces
npm run seed          # builds a demo organisation: 3 teams, 8 users, 40 capabilities,
                       # ~90 days of synthetic usage, and runs the governance scan once
npm run dev            # boots the API on :4100 and the dashboard on :5173 together
```

Open **http://localhost:5173**. Use the user switcher in the top-right to change who
you're logged in as — visibility and permissions change with it (see [RBAC](#rbac--the-user-switcher)
below).

Other useful commands:

```bash
npm test               # 35 backend tests (vitest)
npm run build          # typecheck + production build of both workspaces
```

## Deployment (Render)

`render.yaml` at the repo root is a [Render Blueprint](https://render.com/docs/infrastructure-as-code)
defining two free services:

- **`prism-api`** — the Fastify backend, as a Node web service. It reseeds its demo
  database on every boot (`npm run seed && npm run start`), so the free tier's lack of a
  persistent disk is a non-issue — a fresh, known-good dataset on every restart is exactly
  what a public demo wants. It spins down after 15 minutes of inactivity and cold-starts
  (~30-60s) on the next request, which is normal for Render's free web service tier.
- **`prism-web`** — the React dashboard, as a static site served from Render's CDN.
  Always-on, no cold start. Built with `VITE_API_BASE_URL` pointing at the backend, since
  the two are separate origins in production (locally, Vite's dev proxy handles this
  instead — see `web/src/api/client.ts`).

**To deploy:** in the Render dashboard, **New +** → **Blueprint** → connect this repo →
**Apply**. Render provisions both services from `render.yaml` automatically.

**One manual step after the first deploy.** `onrender.com` service names are shared across
all Render users — if `prism-api` is already taken, Render suffixes it (e.g.
`prism-api-a1b2`), and `render.yaml`'s hardcoded `VITE_API_BASE_URL` won't match. Check
`prism-api`'s actual URL in the Render dashboard; if it differs from
`https://prism-api.onrender.com`, update `VITE_API_BASE_URL` on the `prism-web` service
(dashboard → Environment) and trigger a manual redeploy of `prism-web` — Vite bakes env
vars in at build time, so this doesn't take effect until the next build.

The backend's CORS is already wide open (`access-control-allow-origin: *`), so no
configuration is needed there regardless of what domains either service ends up on.

## Architecture

```
project-prism/
├── docs/API.md          # the contract both halves are built against
├── PLAN.md               # build plan, workstream history, design decisions
├── server/               # Fastify API, :4100
│   └── src/
│       ├── db.ts              # node:sqlite adapter + schema
│       ├── embedder.ts        # TF-IDF vectors, cosine similarity, tokenizer
│       ├── corpus.ts          # builds the per-request vector index
│       ├── search.ts          # blended ranking: semantic + graph + trust
│       ├── graph.ts           # capability graph + affinity scoring
│       ├── trust.ts           # 0–100 trust score
│       ├── dedup.ts           # "did you mean X?" creation intercept
│       ├── governance.ts      # deprecation rules + flag resolution
│       ├── rbac.ts            # visibility and edit permissions
│       ├── artifacts.ts       # create / fork / rate / execute / lineage
│       ├── analytics.ts, recommend.ts
│       ├── routes.ts, app.ts, index.ts
│       └── seed-data.ts, seed.ts
└── web/                  # React + Vite dashboard, :5173
    └── src/
        ├── api/{types,client}.ts   # typed fetch layer against the contract
        ├── context/UserContext.tsx # drives the RBAC demo
        ├── pages/                  # Search, ArtifactDetail, Create, Registry,
        │                           # Analytics, Governance, Recommendations
        └── components/             # PreviewCard, LineageTree, TelemetryChart, …
```

**Storage.** SQLite via Node's built-in `node:sqlite` driver (no native compilation, no
external database to run). Sits behind a five-method adapter, so swapping in Postgres or a
managed database later is a one-file change.

**Search.** Deterministic local TF-IDF embeddings, not a hosted embedding model — this
keeps the whole thing offline and sub-second. It's implemented behind an `Embedder`
interface, so plugging in a real provider (OpenAI, Anthropic, Bedrock) later doesn't
touch any calling code. A search result's final score blends three signals, each visible
in the UI as a breakdown bar:

| Signal | What it captures |
|---|---|
| Semantic | Cosine similarity between your query and the capability's text |
| Graph | Whether your team owns or runs it, whether you've used it, lineage proximity, role/objective match |
| Trust | The capability's own trust score |

**Trust score.** A weighted blend of log-scaled usage count, average peer rating,
execution success rate, and an executive-certification bonus.

**The capability graph.** Users, teams, tasks and artifacts, connected by ownership,
team membership, fork lineage, and execution history. It's what lets recommendations say
*"your team already runs this"* instead of just *"this is popular."*

**RBAC.** Every artifact has a `securityScope` — `public` (everyone), `team` (owner's
team + admins), or `restricted` (owner + admins only) — enforced on every read path:
search, artifact detail, related capabilities, recommendations, analytics, lineage.
Writes are narrower still: editing needs to be the owner, their team lead, or an admin;
certification is admin-only; resolving a governance flag needs a lead or admin.

## Demo walkthrough

The seeded organisation has three teams — **Revenue Operations**, **Customer Support**,
**Platform Engineering** — eight people across admin/lead/member roles, and forty
capabilities with real usage history. Everything below refers to that seeded data.

### 1. Find — contextual search

Switch to **Kenji Watanabe** (Sales Enablement Manager, Revenue Ops) in the user switcher,
then search:

> `draft a cold outreach email for a prospect`

The certified **Enterprise Outreach Email Writer** should outrank its untrusted near-copy,
**Cold Outreach Email Generator** — expand the score breakdown on each card to see why:
the certified original wins on trust and on "owned by your team," not just text match.

Switch to **Selin Aydin** (Data Engineer, Platform) and run the same search — the ranking
shifts, because graph affinity (your team, your usage) is part of the score, not just text
similarity.

### 2. Spread — trust, lineage, and the dedup intercept

Open **Support Ticket Triage Agent** from the registry and look at its lineage tree: it's
been forked twice — once for Tier 2 support (adds a reproduction check), once again from
there for Billing (adds an invoice check). Fork it yourself and note the new capability
never widens beyond the original's visibility.

Now go to **Registry → New capability** and enter, verbatim:

| Field | Value |
|---|---|
| Name | `Prospect Outreach Email Builder` |
| Description | `Generates a personalised cold outreach email to an enterprise prospect using their industry, role, and a recent trigger event.` |
| Content | `You are an enterprise sales writer. Draft a short outreach email to a prospect referencing a trigger event, under 120 words, ending with one call to action.` |

Prism intercepts creation with **"Did you mean to use X?"**, showing the existing
capability with its similarity score. This is the headline anti-sprawl feature — it's what
stops a fourth near-identical prompt from ever being created. You can navigate to the
existing one, or click "Create anyway" to force it through (Prism still flags it as a
likely duplicate on the next governance scan). Similarity is computed over the name,
description *and* content together — a close description paired with unrelated content
won't reliably trip the intercept, which is why the exact wording above matters for the
demo.

Visit **Recommendations** as **Priya Raman** (Enterprise AE, Revenue Ops) — every card is
something she doesn't already run regularly, ranked by trust and team relevance.

### 3. Prune — the governance queue

Switch to **Amara Osei** (admin) or **Marco Bianchi** (Support lead) and open
**Governance**. The seeded org already has 8 open flags: 4 stale (no runs in 60+ days,
including one workflow never executed since it was created 260 days ago), 3 duplicate
(independently recreated near-copies of an existing prompt or agent), and 1 unreliable
(an invoice extractor succeeding only 31% of the time across 26 runs).

Resolve the **Inbound Ticket Classification Agent** duplicate flag with **Merge** — watch
its usage and cost fold into the survivor, **Support Ticket Triage Agent**, and the
redundant one archive. Click "Run scan" to re-run the deprecation rules on demand; running
it twice in a row raises zero new flags, since the rules are idempotent.

Switch to a member — **Kenji**, **Priya**, **Hana**, or **Selin** — and the same page
becomes read-only with an explanation: resolving flags is a team-lead/admin action, and
Prism enforces that in the UI, not just as a 403 you'd have to guess at.

Finally, open **Analytics** to see the aggregate picture: usage and cost over the last 30
days, the top capabilities by adoption, and the same abandoned-capability list that feeds
the governance queue.

## RBAC & the user switcher

The user switcher in the top bar is the whole RBAC demo. Every request carries the
selected user's ID; the backend filters every response — search results, registry rows,
analytics totals, the governance queue — to what that specific person is allowed to see.
Switching from an admin to a member of another team is the fastest way to see the access
model working: `art_secret_scan`, `art_refund_policy` and `art_pricing_approval` are
`restricted` and will 404 for anyone but their owner and admins.

## Testing

The backend has 35 tests covering contextual search and its score breakdown, RBAC
filtering on every read path, the dedup intercept and its `force` bypass, fork lineage
integrity, and the full governance lifecycle (all three flag kinds, idempotent scanning,
archive/merge/dismiss resolution). Run them with `npm test`.

The frontend has no browser-automation test suite in this environment — verification was
a clean TypeScript build plus direct API checks confirming every field each page reads is
present in the real, live responses. See `PLAN.md` §4.3 for what that covered and what it
didn't (an actual visual click-through, which a human should still do once).

## Further reading

- `docs/API.md` — the frozen API contract, plus an implementation addendum covering
  behaviour the endpoint list alone doesn't pin down (authorization matrix, why search
  hides archived but not flagged artifacts, why forks are never flagged as duplicates of
  their own lineage, seeded IDs for testing).
- `PLAN.md` — the full build history: workstream breakdown, what shipped in each phase,
  design decisions and why, and what's explicitly out of scope for this prototype
  (real SSO, a hosted embedding model, Slack/Teams notifications, live LLM execution).
