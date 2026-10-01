import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard } from "@/lib/contracts";
import { ctx, denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../../_lib/test-support";

const db = vi.hoisted(() => ({
  getDashboard: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);

import { GET } from "./route";

const dashboard: Dashboard = {
  project: {
    id: "prj_1",
    licenseId: testLicense.id,
    brandName: "Acme",
    domain: "acme.com",
    aliases: [],
    competitorDomains: [],
    dailyRun: true,
    createdAt: "2026-10-01T00:00:00.000Z",
  },
  latestRun: null,
  trend: [],
  promptTable: [],
  competitorLeaderboard: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
});

describe("GET /api/projects/[id]/dashboard", () => {
  it("returns the dashboard object", async () => {
    db.getDashboard.mockResolvedValue(dashboard);
    const res = await GET(jsonRequest("/api/projects/prj_1/dashboard", "GET"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual(dashboard);
    expect(db.getDashboard).toHaveBeenCalledWith(testLicense.id, "prj_1");
  });

  it("returns 404 for an unknown project", async () => {
    db.getDashboard.mockResolvedValue(null);
    const res = await GET(jsonRequest("/api/projects/prj_x/dashboard", "GET"), ctx({ id: "prj_x" }));
    expect(res.status).toBe(404);
    expect(await readBody(res)).toEqual({ error: "not found" });
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await GET(jsonRequest("/api/projects/prj_1/dashboard", "GET"), ctx({ id: "prj_1" }));
    expect(res.status).toBe(401);
    expect(db.getDashboard).not.toHaveBeenCalled();
  });
});
