import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Artifact, Flag, LineageNode } from "../src/types.js";
import { api, createHarness, type Harness } from "./helpers.js";

let harness: Harness;

// Governance tests mutate artifact state, so each gets a fresh organisation.
beforeEach(async () => {
  harness = await createHarness();
});
afterEach(async () => {
  await harness.dispose();
});

async function openFlags(as = "u_amara"): Promise<Flag[]> {
  const { body } = await api<{ flags: Flag[] }>(harness.app, "GET", "/api/governance/flags?status=open", { as });
  return body.flags;
}

describe("deprecation engine", () => {
  it("raises every rule against the seeded organisation", async () => {
    const scan = await api<{ created: number; flags: Flag[] }>(harness.app, "POST", "/api/governance/scan", {
      as: "u_amara",
      body: {},
    });
    expect(scan.status).toBe(200);

    const flags = await openFlags();
    const kinds = new Set(flags.map((flag) => flag.kind));
    expect(kinds).toContain("stale");
    expect(kinds).toContain("duplicate");
    expect(kinds).toContain("unreliable");
  });

  it("flags the abandoned workflows and explains the gap", async () => {
    const stale = (await openFlags()).filter((flag) => flag.kind === "stale");
    const ids = stale.map((flag) => flag.artifactId);

    expect(ids).toContain("art_legacy_crm_sync");
    expect(ids).toContain("art_nps_digest");
    const neverRun = stale.find((flag) => flag.artifactId === "art_legacy_crm_sync")!;
    expect(neverRun.detail).toMatch(/never executed/i);
  });

  it("keeps the more trusted artifact when two are redundant", async () => {
    const duplicates = (await openFlags()).filter((flag) => flag.kind === "duplicate");
    expect(duplicates.length).toBeGreaterThan(0);

    const coldEmail = duplicates.find((flag) => flag.artifactId === "art_cold_email_v2");
    expect(coldEmail).toBeDefined();
    expect(coldEmail!.duplicateOfId).toBe("art_outreach_email");
    expect(coldEmail!.detail).toMatch(/% similar to/);
  });

  it("does not treat a fork as a duplicate of its own lineage", async () => {
    const duplicates = (await openFlags()).filter((flag) => flag.kind === "duplicate");
    const forkFlagged = duplicates.some((flag) =>
      ["art_outreach_email_emea", "art_ticket_triage_tier2", "art_code_review_python"].includes(flag.artifactId),
    );
    expect(forkFlagged).toBe(false);
  });

  it("flags the agent that fails more often than it succeeds", async () => {
    const unreliable = (await openFlags()).filter((flag) => flag.kind === "unreliable");
    expect(unreliable.map((flag) => flag.artifactId)).toContain("art_invoice_extract");
    expect(unreliable[0]!.detail).toMatch(/success rate/i);
  });

  it("is idempotent across repeated scans", async () => {
    const before = (await openFlags()).length;
    const rerun = await api<{ created: number }>(harness.app, "POST", "/api/governance/scan", {
      as: "u_amara",
      body: {},
    });

    expect(rerun.body.created).toBe(0);
    expect((await openFlags()).length).toBe(before);
  });
});

describe("resolving flags", () => {
  it("archives without breaking the lineage below it", async () => {
    // Fork the artifact that is about to be archived so it has a dependant.
    const fork = await api<Artifact>(harness.app, "POST", "/api/artifacts/art_cold_email_v2/fork", {
      as: "u_priya",
      body: { name: "Cold Outreach Email Generator (Nordics)" },
    });
    expect(fork.status).toBe(201);

    const flag = (await openFlags()).find((candidate) => candidate.artifactId === "art_cold_email_v2")!;
    const resolved = await api<{ flag: Flag }>(harness.app, "POST", `/api/governance/flags/${flag.id}/resolve`, {
      as: "u_amara",
      body: { action: "archive" },
    });

    expect(resolved.status).toBe(200);
    expect(resolved.body.flag.status).toBe("resolved");
    expect(resolved.body.flag.resolution).toBe("archived");

    const archived = await api<{ artifact: Artifact }>(harness.app, "GET", "/api/artifacts/art_cold_email_v2", {
      as: "u_amara",
    });
    expect(archived.body.artifact.status).toBe("archived");

    // The child still resolves, and still points at its parent.
    const child = await api<{ artifact: Artifact }>(harness.app, "GET", `/api/artifacts/${fork.body.id}`, {
      as: "u_priya",
    });
    expect(child.status).toBe(200);
    expect(child.body.artifact.parentId).toBe("art_cold_email_v2");

    const lineage = await api<{ tree: LineageNode }>(harness.app, "GET", `/api/artifacts/${fork.body.id}/lineage`, {
      as: "u_priya",
    });
    expect(lineage.body.tree.artifact.id).toBe("art_cold_email_v2");
    expect(lineage.body.tree.children.some((node) => node.artifact.id === fork.body.id)).toBe(true);
  });

  it("folds usage into the survivor when duplicates are merged", async () => {
    const flag = (await openFlags()).find(
      (candidate) => candidate.kind === "duplicate" && candidate.artifactId === "art_ticket_router",
    )!;
    expect(flag.duplicateOfId).toBe("art_ticket_triage");

    const survivorBefore = await api<{ artifact: Artifact }>(harness.app, "GET", `/api/artifacts/${flag.duplicateOfId}`, {
      as: "u_amara",
    });
    const redundant = await api<{ artifact: Artifact }>(harness.app, "GET", "/api/artifacts/art_ticket_router", {
      as: "u_amara",
    });

    const resolved = await api<{ flag: Flag }>(harness.app, "POST", `/api/governance/flags/${flag.id}/resolve`, {
      as: "u_amara",
      body: { action: "merge" },
    });
    expect(resolved.body.flag.resolution).toBe("merged");

    const survivorAfter = await api<{ artifact: Artifact }>(harness.app, "GET", `/api/artifacts/${flag.duplicateOfId}`, {
      as: "u_amara",
    });
    expect(survivorAfter.body.artifact.trust.usageCount).toBe(
      survivorBefore.body.artifact.trust.usageCount + redundant.body.artifact.trust.usageCount,
    );
    expect(survivorAfter.body.artifact.cost.totalTokens).toBeGreaterThan(
      survivorBefore.body.artifact.cost.totalTokens,
    );

    const archived = await api<{ artifact: Artifact }>(harness.app, "GET", "/api/artifacts/art_ticket_router", {
      as: "u_amara",
    });
    expect(archived.body.artifact.status).toBe("archived");
  });

  it("returns a dismissed artifact to active", async () => {
    const flag = (await openFlags()).find((candidate) => candidate.artifactId === "art_invoice_extract")!;
    await api(harness.app, "POST", `/api/governance/flags/${flag.id}/resolve`, {
      as: "u_amara",
      body: { action: "dismiss" },
    });

    const artifact = await api<{ artifact: Artifact }>(harness.app, "GET", "/api/artifacts/art_invoice_extract", {
      as: "u_amara",
    });
    expect(artifact.body.artifact.status).toBe("active");
  });

  it("refuses to merge anything but a duplicate", async () => {
    const stale = (await openFlags()).find((candidate) => candidate.kind === "stale")!;
    const { status } = await api(harness.app, "POST", `/api/governance/flags/${stale.id}/resolve`, {
      as: "u_amara",
      body: { action: "merge" },
    });
    expect(status).toBe(400);
  });

  it("refuses to resolve the same flag twice", async () => {
    const flag = (await openFlags())[0]!;
    await api(harness.app, "POST", `/api/governance/flags/${flag.id}/resolve`, {
      as: "u_amara",
      body: { action: "dismiss" },
    });
    const second = await api(harness.app, "POST", `/api/governance/flags/${flag.id}/resolve`, {
      as: "u_amara",
      body: { action: "dismiss" },
    });
    expect(second.status).toBe(409);
  });
});

describe("analytics", () => {
  it("summarises usage, abandonment and cost", async () => {
    const { body } = await api<{
      totals: { artifacts: number; flagged: number; executions30d: number; costUsd30d: number };
      topByUsage: Artifact[];
      abandoned: Artifact[];
      costByArtifact: Array<{ artifact: Artifact; costUsd30d: number }>;
    }>(harness.app, "GET", "/api/analytics/overview", { as: "u_amara" });

    expect(body.totals.artifacts).toBeGreaterThanOrEqual(40);
    expect(body.totals.flagged).toBeGreaterThan(0);
    expect(body.totals.executions30d).toBeGreaterThan(0);
    expect(body.totals.costUsd30d).toBeGreaterThan(0);
    expect(body.topByUsage[0]!.trust.usageCount).toBeGreaterThan(0);
    expect(body.abandoned.map((artifact) => artifact.id)).toContain("art_legacy_crm_sync");
    expect(body.costByArtifact[0]!.costUsd30d).toBeGreaterThan(0);
  });

  it("counts only what the caller can see", async () => {
    const admin = await api<{ totals: { artifacts: number } }>(harness.app, "GET", "/api/analytics/overview", {
      as: "u_amara",
    });
    const member = await api<{ totals: { artifacts: number } }>(harness.app, "GET", "/api/analytics/overview", {
      as: "u_hana",
    });
    expect(member.body.totals.artifacts).toBeLessThan(admin.body.totals.artifacts);
  });
});

describe("recommendations", () => {
  it("suggests capabilities the caller neither owns nor already runs", async () => {
    const { body } = await api<{ recommendations: Array<{ artifact: Artifact; reason: string }> }>(
      harness.app,
      "GET",
      "/api/recommendations",
      { as: "u_priya" },
    );

    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.recommendations.every((entry) => entry.artifact.ownerId !== "u_priya")).toBe(true);
    expect(body.recommendations.every((entry) => entry.reason.length > 0)).toBe(true);
  });
});
