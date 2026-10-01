import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/contracts";
import { ctx, denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../../_lib/test-support";

const db = vi.hoisted(() => ({
  getProject: vi.fn(),
  getEngineKeys: vi.fn(),
}));

const engines = vi.hoisted(() => ({
  fetchSiteText: vi.fn(),
  suggestPrompts: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);
vi.mock("@/lib/engines", () => engines);

import { SITE_FETCH_TIMEOUT_MS } from "@/lib/engines/site-text";
import { SUGGEST_TIMEOUT_MS } from "@/lib/engines/suggest";
import { POST, maxDuration } from "./route";

const project: Project = {
  id: "prj_1",
  licenseId: testLicense.id,
  brandName: "Acme",
  domain: "acme.com",
  aliases: ["Acme Dental"],
  competitorDomains: ["rival.com"],
  dailyRun: true,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const SECRET = "sk-proj-SECRETSECRETSECRETSECRET1234";

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
  db.getProject.mockResolvedValue(project);
});

describe("POST /api/projects/[id]/suggest", () => {
  it("declares a budget that covers the whole site read plus two model attempts", () => {
    expect(maxDuration).toBe(120);
    expect(SUGGEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    expect(SITE_FETCH_TIMEOUT_MS + 2 * SUGGEST_TIMEOUT_MS + 10_000).toBeLessThanOrEqual(maxDuration * 1000);
  });

  it("returns 400 with a plain message when no engine key is set, without reading the site", async () => {
    db.getEngineKeys.mockResolvedValue({});
    const res = await POST(jsonRequest("/api/projects/prj_1/suggest", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("Settings");
    expect(engines.fetchSiteText).not.toHaveBeenCalled();
    expect(engines.suggestPrompts).not.toHaveBeenCalled();
  });

  it("reads the site, asks for suggestions with the keys, and returns prompts without saving", async () => {
    db.getEngineKeys.mockResolvedValue({ openai: SECRET });
    engines.fetchSiteText.mockResolvedValue("Acme is a dental practice in DeLand.");
    engines.suggestPrompts.mockResolvedValue(["best dentist in DeLand", "Acme Dental reviews"]);

    const res = await POST(jsonRequest("/api/projects/prj_1/suggest", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ prompts: ["best dentist in DeLand", "Acme Dental reviews"] });
    expect(engines.fetchSiteText).toHaveBeenCalledWith("acme.com");
    expect(engines.suggestPrompts).toHaveBeenCalledWith(
      { openai: SECRET },
      { brandName: "Acme", domain: "acme.com", aliases: ["Acme Dental"], competitorDomains: ["rival.com"], dailyRun: true },
      "Acme is a dental practice in DeLand."
    );
  });

  it("never lets a key into the response, even when an engine error quotes it", async () => {
    db.getEngineKeys.mockResolvedValue({ openai: SECRET });
    engines.fetchSiteText.mockResolvedValue("text");
    engines.suggestPrompts.mockRejectedValue(new Error(`401 invalid key ${SECRET}`));

    const res = await POST(jsonRequest("/api/projects/prj_1/suggest", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("SECRETSECRET");
    expect(text).toContain("Could not generate suggestions");
  });

  it("returns 400 with a plain message when the site cannot be read", async () => {
    db.getEngineKeys.mockResolvedValue({ gemini: "AIzaSyExampleExampleExample" });
    engines.fetchSiteText.mockRejectedValue(new Error("fetch failed"));

    const res = await POST(jsonRequest("/api/projects/prj_1/suggest", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(400);
    expect((await readBody<{ error: string }>(res)).error).toContain("Could not read acme.com");
    expect(engines.suggestPrompts).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown project before touching keys", async () => {
    db.getProject.mockResolvedValue(null);
    const res = await POST(jsonRequest("/api/projects/prj_x/suggest", "POST"), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
    expect(db.getEngineKeys).not.toHaveBeenCalled();
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await POST(jsonRequest("/api/projects/prj_1/suggest", "POST"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(401);
  });
});
