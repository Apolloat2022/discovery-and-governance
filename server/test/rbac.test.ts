import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Artifact, SearchResult } from "../src/types.js";
import { api, createHarness, type Harness } from "./helpers.js";

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness.dispose();
});

/** art_secret_scan is restricted and owned by the admin, Amara. */
const RESTRICTED = "art_secret_scan";
/** art_lead_scoring is team-scoped inside Revenue Operations. */
const TEAM_SCOPED = "art_lead_scoring";

describe("role-based access control", () => {
  it("hides a restricted artifact from everyone but its owner and admins", async () => {
    const owner = await api(harness.app, "GET", `/api/artifacts/${RESTRICTED}`, { as: "u_amara" });
    expect(owner.status).toBe(200);

    // A teammate on the same team still cannot open a restricted artifact.
    const teammate = await api(harness.app, "GET", `/api/artifacts/${RESTRICTED}`, { as: "u_selin" });
    expect(teammate.status).toBe(404);

    const outsider = await api(harness.app, "GET", `/api/artifacts/${RESTRICTED}`, { as: "u_hana" });
    expect(outsider.status).toBe(404);

    const anonymous = await api(harness.app, "GET", `/api/artifacts/${RESTRICTED}`);
    expect(anonymous.status).toBe(404);
  });

  it("keeps invisible artifacts out of search results", async () => {
    const { body } = await api<{ results: SearchResult[] }>(
      harness.app,
      "GET",
      "/api/search?q=scan%20repository%20for%20leaked%20secrets%20and%20api%20keys&limit=50",
      { as: "u_hana" },
    );
    expect(body.results.some((result) => result.artifact.id === RESTRICTED)).toBe(false);

    const asAdmin = await api<{ results: SearchResult[] }>(
      harness.app,
      "GET",
      "/api/search?q=scan%20repository%20for%20leaked%20secrets%20and%20api%20keys&limit=50",
      { as: "u_amara" },
    );
    expect(asAdmin.body.results.some((result) => result.artifact.id === RESTRICTED)).toBe(true);
  });

  it("scopes team artifacts to the owning team", async () => {
    const insider = await api(harness.app, "GET", `/api/artifacts/${TEAM_SCOPED}`, { as: "u_kenji" });
    expect(insider.status).toBe(200);

    const outsider = await api(harness.app, "GET", `/api/artifacts/${TEAM_SCOPED}`, { as: "u_hana" });
    expect(outsider.status).toBe(404);

    const admin = await api(harness.app, "GET", `/api/artifacts/${TEAM_SCOPED}`, { as: "u_amara" });
    expect(admin.status).toBe(200);
  });

  it("shows anonymous callers public artifacts only", async () => {
    const { body } = await api<Artifact[]>(harness.app, "GET", "/api/artifacts");
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((artifact) => artifact.securityScope === "public")).toBe(true);
  });

  it("limits edits to the owner, their team lead, and admins", async () => {
    const stranger = await api(harness.app, "PATCH", "/api/artifacts/art_macro_reply", {
      as: "u_kenji",
      body: { description: "hijacked" },
    });
    expect(stranger.status).toBe(403);

    const lead = await api<Artifact>(harness.app, "PATCH", "/api/artifacts/art_macro_reply", {
      as: "u_marco",
      body: { description: "Drafts a first response, reviewed by the support lead." },
    });
    expect(lead.status).toBe(200);
    expect(lead.body.description).toContain("support lead");
  });

  it("reserves certification for admins", async () => {
    const lead = await api(harness.app, "PATCH", "/api/artifacts/art_macro_reply", {
      as: "u_marco",
      body: { certified: true },
    });
    expect(lead.status).toBe(403);

    const admin = await api<Artifact>(harness.app, "PATCH", "/api/artifacts/art_macro_reply", {
      as: "u_amara",
      body: { certified: true },
    });
    expect(admin.status).toBe(200);
    expect(admin.body.certified).toBe(true);
  });

  it("reserves governance actions for leads and admins", async () => {
    const member = await api(harness.app, "POST", "/api/governance/scan", { as: "u_kenji", body: {} });
    expect(member.status).toBe(403);

    const lead = await api(harness.app, "POST", "/api/governance/scan", { as: "u_marco", body: {} });
    expect(lead.status).toBe(200);
  });
});
