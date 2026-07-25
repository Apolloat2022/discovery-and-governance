import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Artifact, SearchResult } from "../src/types.js";
import { api, createHarness, type Harness } from "./helpers.js";

interface SearchResponse {
  results: SearchResult[];
  tookMs: number;
}

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.dispose();
});

describe("contextual capability search", () => {
  it("ranks the relevant capability first and explains why", async () => {
    const { status, body } = await api<SearchResponse>(
      harness.app,
      "GET",
      "/api/search?q=write%20a%20cold%20outreach%20email%20to%20a%20prospect",
      { as: "u_kenji" },
    );

    expect(status).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);

    const names = body.results.map((result) => result.artifact.name);
    expect(names[0]).toContain("Outreach Email");
    expect(body.results[0]!.reason.length).toBeGreaterThan(0);
    expect(body.tookMs).toBeLessThan(1000);
  });

  it("reports a score breakdown for every result", async () => {
    const { body } = await api<SearchResponse>(harness.app, "GET", "/api/search?q=review%20pull%20request", {
      as: "u_tomas",
    });

    for (const result of body.results) {
      const { semantic, graph, trust } = result.breakdown;
      for (const component of [semantic, graph, trust]) {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(1);
      }
      expect(result.score).toBeGreaterThan(0);
    }
  });

  it("weights the caller's graph position", async () => {
    const query = "/api/search?q=summarise%20a%20meeting%20transcript";
    const forPlatform = await api<SearchResponse>(harness.app, "GET", query, { as: "u_amara" });
    const forSupport = await api<SearchResponse>(harness.app, "GET", query, { as: "u_hana" });

    const platformGraph = forPlatform.body.results[0]!.breakdown.graph;
    const supportSame = forSupport.body.results.find(
      (result) => result.artifact.id === forPlatform.body.results[0]!.artifact.id,
    );
    // The owning team is closer to the artifact in the graph than another team.
    expect(platformGraph).toBeGreaterThan(supportSame?.breakdown.graph ?? 0);
  });

  it("applies type, trust and certification filters", async () => {
    const byType = await api<SearchResponse>(harness.app, "GET", "/api/search?type=workflow&limit=50", {
      as: "u_dilan",
    });
    expect(byType.body.results.length).toBeGreaterThan(0);
    expect(byType.body.results.every((result) => result.artifact.type === "workflow")).toBe(true);

    const certified = await api<SearchResponse>(harness.app, "GET", "/api/search?certifiedOnly=true&limit=50", {
      as: "u_dilan",
    });
    expect(certified.body.results.every((result) => result.artifact.certified)).toBe(true);

    const trusted = await api<SearchResponse>(harness.app, "GET", "/api/search?minTrust=70&limit=50", {
      as: "u_dilan",
    });
    expect(trusted.body.results.every((result) => result.artifact.trustScore >= 70)).toBe(true);
  });

  it("never returns archived capabilities", async () => {
    const artifacts = await api<Artifact[]>(harness.app, "GET", "/api/artifacts", { as: "u_amara" });
    const victim = artifacts.body.find((artifact) => artifact.status !== "archived")!;
    await api(harness.app, "PATCH", `/api/artifacts/${victim.id}`, {
      as: "u_amara",
      body: { status: "archived" },
    });

    const { body } = await api<SearchResponse>(harness.app, "GET", "/api/search?limit=100", { as: "u_amara" });
    expect(body.results.some((result) => result.artifact.id === victim.id)).toBe(false);

    await api(harness.app, "PATCH", `/api/artifacts/${victim.id}`, { as: "u_amara", body: { status: "active" } });
  });
});
