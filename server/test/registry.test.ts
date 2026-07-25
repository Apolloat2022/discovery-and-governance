import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Artifact, LineageNode } from "../src/types.js";
import { api, createHarness, type Harness } from "./helpers.js";

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.dispose();
});

interface DuplicateResponse {
  error: { code: string; message: string };
  similar: Array<{ artifact: Artifact; similarity: number }>;
}

const NEAR_DUPLICATE_DRAFT = {
  name: "Prospect Outreach Email Builder",
  type: "prompt",
  description:
    "Generates a personalised cold outreach email to an enterprise prospect using their industry, role, and a recent trigger event.",
  content:
    "You are an enterprise sales writer. Draft a short outreach email to {{prospect_name}}, a {{role}} at {{company}} in the {{industry}} industry.\nReference the trigger event {{trigger}} in the opening line.\nKeep it under 120 words, lead with the business outcome, avoid superlatives, and end with a single specific call to action.",
  tags: ["sales", "outreach", "email"],
};

describe("deduplication intercept", () => {
  it("interrupts creation when an equivalent capability already exists", async () => {
    const { status, body } = await api<DuplicateResponse>(harness.app, "POST", "/api/artifacts", {
      as: "u_priya",
      body: NEAR_DUPLICATE_DRAFT,
    });

    expect(status).toBe(409);
    expect(body.error.code).toBe("DUPLICATE_SUSPECTED");
    expect(body.similar.length).toBeGreaterThan(0);
    expect(body.similar[0]!.similarity).toBeGreaterThanOrEqual(0.6);
    expect(body.similar.map((match) => match.artifact.name).join(" ")).toContain("Outreach Email");
  });

  it("creates anyway when the author forces it", async () => {
    const { status, body } = await api<Artifact>(harness.app, "POST", "/api/artifacts", {
      as: "u_priya",
      body: { ...NEAR_DUPLICATE_DRAFT, force: true },
    });

    expect(status).toBe(201);
    expect(body.name).toBe(NEAR_DUPLICATE_DRAFT.name);
    expect(body.ownerId).toBe("u_priya");
    expect(body.teamId).toBe("team_revops");
    expect(body.parentId).toBeNull();
    // A brand new artifact is the root of its own lineage.
    expect(body.rootId).toBe(body.id);
    expect(body.status).toBe("active");
  });

  it("lets a genuinely new capability through untouched", async () => {
    const { status, body } = await api<Artifact>(harness.app, "POST", "/api/artifacts", {
      as: "u_selin",
      body: {
        name: "Kafka Consumer Lag Explainer",
        type: "skill",
        description: "Explains why a Kafka consumer group is lagging and which partition rebalance caused it.",
        content:
          "Given consumer group {{group}}, correlate lag per partition with recent rebalances, broker restarts, and producer throughput spikes. Name the single most likely cause.",
        tags: ["kafka", "streaming", "operations"],
      },
    });

    expect(status).toBe(201);
    expect(body.trustScore).toBeGreaterThan(0);
    expect(body.trust.usageCount).toBe(0);
  });
});

describe("fork lineage", () => {
  it("records the parent and inherits the lineage root", async () => {
    const fork = await api<Artifact>(harness.app, "POST", "/api/artifacts/art_ticket_triage/fork", {
      as: "u_hana",
      body: { name: "Support Ticket Triage Agent (Trial accounts)" },
    });

    expect(fork.status).toBe(201);
    expect(fork.body.parentId).toBe("art_ticket_triage");
    expect(fork.body.rootId).toBe("art_ticket_triage");
    expect(fork.body.ownerId).toBe("u_hana");
    expect(fork.body.certified).toBe(false);
  });

  it("builds the full tree, three levels deep, from any member of the lineage", async () => {
    const { body } = await api<{ tree: LineageNode }>(harness.app, "GET", "/api/artifacts/art_ticket_triage_billing/lineage", {
      as: "u_marco",
    });

    expect(body.tree.artifact.id).toBe("art_ticket_triage");
    const tier2 = body.tree.children.find((child) => child.artifact.id === "art_ticket_triage_tier2");
    expect(tier2).toBeDefined();
    expect(tier2!.children.some((child) => child.artifact.id === "art_ticket_triage_billing")).toBe(true);
  });

  it("never widens exposure through a fork", async () => {
    const fork = await api<Artifact>(harness.app, "POST", "/api/artifacts/art_lead_scoring/fork", {
      as: "u_dilan",
      body: {},
    });
    expect(fork.status).toBe(201);
    expect(fork.body.securityScope).toBe("team");
  });
});

describe("ratings and executions", () => {
  it("moves the trust score when a capability is used and rated", async () => {
    const before = await api<{ artifact: Artifact }>(harness.app, "GET", "/api/artifacts/art_kb_gap", { as: "u_hana" });

    await api(harness.app, "POST", "/api/artifacts/art_kb_gap/execute", { as: "u_hana", body: {} });
    const rated = await api<{ artifact: Artifact }>(harness.app, "POST", "/api/artifacts/art_kb_gap/rate", {
      as: "u_marco",
      body: { rating: 5 },
    });

    expect(rated.status).toBe(200);
    expect(rated.body.artifact.trust.usageCount).toBe(before.body.artifact.trust.usageCount + 1);
    expect(rated.body.artifact.trust.ratingCount).toBeGreaterThan(before.body.artifact.trust.ratingCount);
  });

  it("rejects an out-of-range rating", async () => {
    const { status } = await api(harness.app, "POST", "/api/artifacts/art_kb_gap/rate", {
      as: "u_marco",
      body: { rating: 9 },
    });
    expect(status).toBe(400);
  });

  it("returns one telemetry point per day", async () => {
    const { body } = await api<{ daily: Array<{ date: string; executions: number }> }>(
      harness.app,
      "GET",
      "/api/artifacts/art_code_review/telemetry?days=30",
      { as: "u_tomas" },
    );
    expect(body.daily).toHaveLength(30);
    expect(body.daily.some((day) => day.executions > 0)).toBe(true);
  });
});
