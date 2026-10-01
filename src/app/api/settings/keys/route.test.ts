import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineKeyHint } from "@/lib/contracts";
import { denyLicense, grantLicense, jsonRequest, readBody, testLicense } from "../../_lib/test-support";

const db = vi.hoisted(() => ({
  getEngineKeyHints: vi.fn(),
  setEngineKey: vi.fn(),
  deleteEngineKey: vi.fn(),
}));

vi.mock("@/lib/license", async () => (await import("../../_lib/test-support")).licenseModuleMock());
vi.mock("@/lib/db", () => db);

import { DELETE, GET, PUT } from "./route";

const noParams = { params: Promise.resolve({}) };
const unset: EngineKeyHint = { set: false, hint: null, updatedAt: null };

/* A data-layer row that leaks more than it should. The route must strip every extra field. */
const poisoned = {
  openai: {
    set: true,
    hint: "sk-proj-LONGERTHANFOURabcd",
    updatedAt: "2026-10-01T00:00:00.000Z",
    apiKey: "sk-proj-PLAINTEXTKEY0000000000",
    ciphertext: "AAAAbase64ciphertextAAAA",
  },
  anthropic: { ...unset, ciphertext: "BBBB" },
  gemini: { set: true, hint: "wxyz", updatedAt: "2026-09-30T00:00:00.000Z", apiKey: "AIzaPLAINTEXT" },
};

beforeEach(() => {
  vi.resetAllMocks();
  grantLicense();
  db.getEngineKeyHints.mockResolvedValue({ openai: unset, anthropic: unset, gemini: unset });
});

describe("GET /api/settings/keys", () => {
  it("returns hints for the three engines and nothing else, even from a poisoned row", async () => {
    db.getEngineKeyHints.mockResolvedValue(poisoned);
    const res = await GET(jsonRequest("/api/settings/keys", "GET"), noParams);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("ciphertext");
    expect(text).not.toContain("PLAINTEXT");
    expect(text).not.toContain("base64");
    expect(text).not.toContain("LONGERTHANFOUR");

    const body = JSON.parse(text) as { keys: Record<string, EngineKeyHint> };
    expect(Object.keys(body)).toEqual(["keys"]);
    expect(Object.keys(body.keys).sort()).toEqual(["anthropic", "gemini", "openai"]);
    expect(body.keys.openai).toEqual({ set: true, hint: "abcd", updatedAt: "2026-10-01T00:00:00.000Z" });
    expect(body.keys.anthropic).toEqual({ set: false, hint: null, updatedAt: null });
    expect(body.keys.gemini).toEqual({ set: true, hint: "wxyz", updatedAt: "2026-09-30T00:00:00.000Z" });
    for (const hint of Object.values(body.keys)) {
      expect(Object.keys(hint).sort()).toEqual(["hint", "set", "updatedAt"]);
    }
  });

  it("fills in engines the data layer left out", async () => {
    db.getEngineKeyHints.mockResolvedValue({ openai: { set: true, hint: "abcd", updatedAt: null } });
    const res = await GET(jsonRequest("/api/settings/keys", "GET"), noParams);
    const body = await readBody<{ keys: Record<string, EngineKeyHint> }>(res);
    expect(body.keys.anthropic).toEqual(unset);
    expect(body.keys.gemini).toEqual(unset);
  });

  it("returns 401 without a license", async () => {
    denyLicense();
    const res = await GET(jsonRequest("/api/settings/keys", "GET"), noParams);
    expect(res.status).toBe(401);
    expect(db.getEngineKeyHints).not.toHaveBeenCalled();
  });
});

describe("PUT /api/settings/keys", () => {
  it("stores the trimmed key and answers with the hint only", async () => {
    db.setEngineKey.mockResolvedValue(undefined);
    db.getEngineKeyHints.mockResolvedValue({
      openai: { set: true, hint: "7890", updatedAt: "2026-10-01T12:00:00.000Z", apiKey: "leak" },
      anthropic: unset,
      gemini: unset,
    });
    const apiKey = "sk-proj-abcdefghijklmnopqrstuvwxyz7890";
    const res = await PUT(jsonRequest("/api/settings/keys", "PUT", { engine: "openai", apiKey: `  ${apiKey}  ` }), noParams);
    expect(res.status).toBe(200);
    expect(db.setEngineKey).toHaveBeenCalledWith(testLicense.id, "openai", apiKey);

    const text = await res.text();
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain("leak");
    expect(JSON.parse(text)).toEqual({ ok: true, engine: "openai", key: { set: true, hint: "7890", updatedAt: "2026-10-01T12:00:00.000Z" } });
  });

  it("rejects a short key, an unknown engine and a missing body with 400", async () => {
    expect((await PUT(jsonRequest("/api/settings/keys", "PUT", { engine: "openai", apiKey: "short" }), noParams)).status).toBe(400);
    expect((await PUT(jsonRequest("/api/settings/keys", "PUT", { engine: "perplexity", apiKey: "x".repeat(20) }), noParams)).status).toBe(400);
    expect((await PUT(jsonRequest("/api/settings/keys", "PUT"), noParams)).status).toBe(400);
    expect((await PUT(jsonRequest("/api/settings/keys", "PUT", { engine: "openai", apiKey: "x".repeat(401) }), noParams)).status).toBe(400);
    expect(db.setEngineKey).not.toHaveBeenCalled();
  });

  it("returns 401 without a license and never stores the key", async () => {
    denyLicense();
    const res = await PUT(jsonRequest("/api/settings/keys", "PUT", { engine: "openai", apiKey: "x".repeat(20) }), noParams);
    expect(res.status).toBe(401);
    expect(db.setEngineKey).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/settings/keys", () => {
  it("removes the key for the engine", async () => {
    db.deleteEngineKey.mockResolvedValue(undefined);
    const res = await DELETE(jsonRequest("/api/settings/keys", "DELETE", { engine: "gemini" }), noParams);
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ ok: true, engine: "gemini" });
    expect(db.deleteEngineKey).toHaveBeenCalledWith(testLicense.id, "gemini");
  });

  it("rejects an unknown engine with 400", async () => {
    const res = await DELETE(jsonRequest("/api/settings/keys", "DELETE", { engine: "bing" }), noParams);
    expect(res.status).toBe(400);
    expect(db.deleteEngineKey).not.toHaveBeenCalled();
  });
});
