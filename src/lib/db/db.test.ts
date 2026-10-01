import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { ResultInput, Source } from "../contracts";
import { ENGINES } from "../contracts";
import {
  InvalidInputError,
  NotFoundError,
  addPrompts,
  archivePrompt,
  createLicense,
  createProject,
  createRun,
  deleteEngineKey,
  deleteProject,
  domainMatches,
  findLicenseByKey,
  finishRun,
  getDashboard,
  getEngineKeyHints,
  getEngineKeys,
  getProject,
  getRun,
  insertResult,
  licenseExistsForStripeSession,
  listProjects,
  listProjectsForDailyRun,
  listPrompts,
  listResults,
  listRuns,
  normalizeDomain,
  setEngineKey,
  updateProject,
} from "./index";
import { TEST_KEY_ENCRYPTION_SECRET, createTestDb } from "./test-db";

let db: PGlite;
beforeAll(async () => {
  process.env.KEY_ENCRYPTION_SECRET = TEST_KEY_ENCRYPTION_SECRET;
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const src = (url: string, domain: string, title: string | null = null): Source => ({ url, domain, title });

function result(partial: Partial<ResultInput> & Pick<ResultInput, "promptId" | "engine">): ResultInput {
  return {
    model: "test-model",
    mentioned: false,
    position: null,
    cited: false,
    sources: [],
    searchResults: [],
    competitorDomainsCited: [],
    rawText: "answer",
    error: null,
    latencyMs: 100,
    ...partial,
  };
}

describe("normalizeDomain", () => {
  it("strips scheme, www, path, port, credentials and case", () => {
    expect(normalizeDomain("https://www.EVOIX.io/path?q=1#x")).toBe("evoix.io");
    expect(normalizeDomain("http://user:pw@Sub.Example.com:8080/")).toBe("sub.example.com");
    expect(normalizeDomain("  example.com.  ")).toBe("example.com");
    expect(normalizeDomain("//www.example.com")).toBe("example.com");
  });
  it("rejects empty and non-domain input", () => {
    expect(() => normalizeDomain("")).toThrow(InvalidInputError);
    expect(() => normalizeDomain("https://")).toThrow(InvalidInputError);
    expect(() => normalizeDomain("not a domain")).toThrow(InvalidInputError);
    expect(() => normalizeDomain("localhost")).toThrow(InvalidInputError);
  });
});

describe("domainMatches", () => {
  it("matches equal domains and subdomains only", () => {
    expect(domainMatches("evoix.io", "evoix.io")).toBe(true);
    expect(domainMatches("www.evoix.io", "evoix.io")).toBe(true);
    expect(domainMatches("blog.evoix.io", "EVOIX.io")).toBe(true);
    expect(domainMatches("notevoix.io", "evoix.io")).toBe(false);
    expect(domainMatches("evoix.io", "blog.evoix.io")).toBe(false);
    expect(domainMatches("", "evoix.io")).toBe(false);
  });
});

describe("licenses", () => {
  it("creates a license, returns the key once and finds it by key (active only, bumps last_seen_at)", async () => {
    const { license, key } = await createLicense({ email: "  Buyer@Example.com ", plan: "founder" });
    expect(key).toMatch(/^its_[A-Za-z0-9]{32}$/);
    expect(license).toMatchObject({ email: "buyer@example.com", plan: "founder", status: "active" });
    expect(new Date(license.createdAt).toString()).not.toBe("Invalid Date");

    const stored = (await db.query<{ key_hash: string; key_hint: string; last_seen_at: Date | null }>(
      "SELECT key_hash, key_hint, last_seen_at FROM licenses WHERE id = $1",
      [license.id]
    )).rows[0];
    expect(stored.key_hash).not.toContain(key);
    expect(stored.key_hint).toBe(key.slice(-4));
    expect(stored.last_seen_at).toBeNull();

    const found = await findLicenseByKey(`  ${key}  `);
    expect(found?.id).toBe(license.id);
    const after = (await db.query<{ last_seen_at: Date | null }>("SELECT last_seen_at FROM licenses WHERE id = $1", [license.id])).rows[0];
    expect(after.last_seen_at).not.toBeNull();

    expect(await findLicenseByKey("its_doesnotexist")).toBeNull();
    expect(await findLicenseByKey("")).toBeNull();

    await db.query("UPDATE licenses SET status = 'revoked' WHERE id = $1", [license.id]);
    expect(await findLicenseByKey(key)).toBeNull();
  });

  it("tracks the Stripe session id for idempotency", async () => {
    expect(await licenseExistsForStripeSession("cs_test_none")).toBe(false);
    await createLicense({ email: "s@example.com", plan: "founder", stripeSessionId: "cs_test_1" });
    expect(await licenseExistsForStripeSession("cs_test_1")).toBe(true);
    await expect(createLicense({ email: "s@example.com", plan: "founder", stripeSessionId: "cs_test_1" })).rejects.toThrow();
  });

  it("rejects an empty email", async () => {
    await expect(createLicense({ email: " ", plan: "dev" })).rejects.toThrow(InvalidInputError);
  });
});

describe("engine keys", () => {
  it("stores keys encrypted, returns decrypted keys server side and hints only otherwise", async () => {
    const { license } = await createLicense({ email: "k@example.com", plan: "dev" });
    expect(await getEngineKeys(license.id)).toEqual({});
    const hints0 = await getEngineKeyHints(license.id);
    for (const e of ENGINES) expect(hints0[e]).toEqual({ set: false, hint: null, updatedAt: null });

    await setEngineKey(license.id, "openai", "  sk-openai-1234  ");
    await setEngineKey(license.id, "gemini", "AIza-gemini-9999");
    const row = (await db.query<{ ciphertext: string; key_hint: string }>(
      "SELECT ciphertext, key_hint FROM engine_keys WHERE license_id = $1 AND engine = 'openai'",
      [license.id]
    )).rows[0];
    expect(row.ciphertext).not.toContain("sk-openai");
    expect(row.key_hint).toBe("1234");

    expect(await getEngineKeys(license.id)).toEqual({ openai: "sk-openai-1234", gemini: "AIza-gemini-9999" });
    const hints = await getEngineKeyHints(license.id);
    expect(hints.openai).toMatchObject({ set: true, hint: "1234" });
    expect(hints.openai.updatedAt).not.toBeNull();
    expect(hints.anthropic).toEqual({ set: false, hint: null, updatedAt: null });
    expect(hints.gemini).toMatchObject({ set: true, hint: "9999" });

    await setEngineKey(license.id, "openai", "sk-openai-5678"); // upsert
    expect((await getEngineKeys(license.id)).openai).toBe("sk-openai-5678");
    await deleteEngineKey(license.id, "openai");
    expect(await getEngineKeys(license.id)).toEqual({ gemini: "AIza-gemini-9999" });

    await expect(setEngineKey(license.id, "openai", "   ")).rejects.toThrow(InvalidInputError);
    await expect(setEngineKey(license.id, "bing" as never, "x")).rejects.toThrow(InvalidInputError);
  });
});

describe("projects", () => {
  it("creates with normalized domain, cleaned aliases and competitors; lists, gets, updates, deletes", async () => {
    const { license } = await createLicense({ email: "p@example.com", plan: "dev" });
    const project = await createProject(license.id, {
      brandName: "  EVOIX ",
      domain: "https://www.Evoix.io/about",
      aliases: [" Evoix.io ", "EVOIX", "evoix", "", "Evoix LLC"],
      competitorDomains: ["https://Competitor.com/", "competitor.com", " ", "www.other.co"],
    });
    expect(project).toMatchObject({
      licenseId: license.id,
      brandName: "EVOIX",
      domain: "evoix.io",
      aliases: ["Evoix.io", "EVOIX", "Evoix LLC"],
      competitorDomains: ["competitor.com", "other.co"],
      dailyRun: true,
    });

    expect(await listProjects(license.id)).toHaveLength(1);
    expect((await getProject(license.id, project.id))?.id).toBe(project.id);
    expect(await getProject(license.id, "nope")).toBeNull();

    const updated = await updateProject(license.id, project.id, { domain: "NEW.example.com", dailyRun: false, aliases: ["a", "a", "A"] });
    expect(updated).toMatchObject({ domain: "new.example.com", dailyRun: false, aliases: ["a"], brandName: "EVOIX" });
    expect(await updateProject(license.id, project.id, {})).toMatchObject({ domain: "new.example.com" });
    await expect(createProject(license.id, { brandName: "x", domain: "", aliases: [], competitorDomains: [] })).rejects.toThrow(InvalidInputError);
    await expect(createProject(license.id, { brandName: " ", domain: "a.com", aliases: [], competitorDomains: [] })).rejects.toThrow(InvalidInputError);
    await expect(updateProject(license.id, project.id, { competitorDomains: ["bad domain"] })).rejects.toThrow(InvalidInputError);

    expect(await deleteProject(license.id, project.id)).toBe(true);
    expect(await deleteProject(license.id, project.id)).toBe(false);
    expect(await listProjects(license.id)).toEqual([]);
  });
});

describe("prompts, runs and results", () => {
  it("adds (trimmed, deduped), lists (archived filter), archives, runs and stores results", async () => {
    const { license } = await createLicense({ email: "r@example.com", plan: "dev" });
    const project = await createProject(license.id, { brandName: "Acme", domain: "acme.com", aliases: [], competitorDomains: ["rival.com"] });

    const prompts = await addPrompts(license.id, project.id, [" best widgets ", "best widgets", "", "cheap widgets"]);
    expect(prompts.map((p) => p.text)).toEqual(["best widgets", "cheap widgets"]);
    expect(prompts[0].projectId).toBe(project.id);
    expect(prompts[0].archivedAt).toBeNull();
    expect(await addPrompts(license.id, project.id, [" ", ""])).toEqual([]);

    expect(await archivePrompt(license.id, project.id, prompts[1].id)).toBe(true);
    expect(await archivePrompt(license.id, project.id, prompts[1].id)).toBe(true); // idempotent
    expect(await archivePrompt(license.id, project.id, "nope")).toBe(false);
    expect((await listPrompts(license.id, project.id)).map((p) => p.id)).toEqual([prompts[0].id]);
    const all = await listPrompts(license.id, project.id, { includeArchived: true });
    expect(all).toHaveLength(2);
    expect(all[1].archivedAt).not.toBeNull();

    const run = await createRun(license.id, project.id, "manual");
    expect(run).toMatchObject({ projectId: project.id, trigger: "manual", status: "running", finishedAt: null });
    await insertResult(run.id, result({
      promptId: prompts[0].id,
      engine: "openai",
      mentioned: true,
      position: 2,
      cited: true,
      sources: [src("https://www.acme.com/x", "www.acme.com", "Acme"), src("https://rival.com/y", "rival.com")],
      searchResults: [src("https://acme.com", "acme.com")],
      competitorDomainsCited: ["rival.com"],
      rawText: "1. Foo\n2. Acme",
      latencyMs: 1234,
    }));
    await insertResult(run.id, result({ promptId: prompts[0].id, engine: "gemini", error: "timeout", rawText: "", model: null, latencyMs: null }));
    await finishRun(run.id, "partial");

    const got = await getRun(license.id, project.id, run.id);
    expect(got).toMatchObject({ id: run.id, status: "partial" });
    expect(got?.finishedAt).not.toBeNull();
    expect(await getRun(license.id, project.id, "nope")).toBeNull();
    expect((await listRuns(license.id, project.id)).map((r) => r.id)).toEqual([run.id]);

    const resultRows = await listResults(license.id, project.id, run.id);
    expect(resultRows).toHaveLength(2);
    // Pick rows by engine so a same-microsecond created_at tie cannot flip the assertions.
    const results = [resultRows.find((r) => r.engine === "openai")!, resultRows.find((r) => r.engine === "gemini")!];
    expect(results[0]).toMatchObject({
      runId: run.id,
      promptId: prompts[0].id,
      engine: "openai",
      model: "test-model",
      mentioned: true,
      position: 2,
      cited: true,
      competitorDomainsCited: ["rival.com"],
      rawText: "1. Foo\n2. Acme",
      error: null,
      latencyMs: 1234,
    });
    expect(results[0].sources).toEqual([
      { url: "https://www.acme.com/x", domain: "www.acme.com", title: "Acme" },
      { url: "https://rival.com/y", domain: "rival.com", title: null },
    ]);
    expect(results[0].searchResults).toEqual([{ url: "https://acme.com", domain: "acme.com", title: null }]);
    expect(results[1]).toMatchObject({ engine: "gemini", error: "timeout", rawText: "", model: null, latencyMs: null, position: null });

    await expect(insertResult(run.id, result({ promptId: prompts[0].id, engine: "bing" as never }))).rejects.toThrow(InvalidInputError);
  });
});

describe("listProjectsForDailyRun", () => {
  it("returns only active licenses with daily_run, a key and an active prompt", async () => {
    const { license } = await createLicense({ email: "cron@example.com", plan: "founder" });
    const ready = await createProject(license.id, { brandName: "A", domain: "a.com", aliases: [], competitorDomains: [] });
    const noPrompts = await createProject(license.id, { brandName: "B", domain: "b.com", aliases: [], competitorDomains: [] });
    const paused = await createProject(license.id, { brandName: "C", domain: "c.com", aliases: [], competitorDomains: [], dailyRun: false });
    const archivedOnly = await createProject(license.id, { brandName: "D", domain: "d.com", aliases: [], competitorDomains: [] });
    await addPrompts(license.id, ready.id, ["q"]);
    await addPrompts(license.id, paused.id, ["q"]);
    const [ap] = await addPrompts(license.id, archivedOnly.id, ["q"]);
    await archivePrompt(license.id, archivedOnly.id, ap.id);
    void noPrompts;

    // No key yet: nothing qualifies for this license.
    let due = await listProjectsForDailyRun();
    expect(due.filter((d) => d.licenseId === license.id)).toEqual([]);

    await setEngineKey(license.id, "anthropic", "sk-ant-1");
    due = await listProjectsForDailyRun();
    expect(due.filter((d) => d.licenseId === license.id)).toEqual([{ licenseId: license.id, projectId: ready.id }]);

    // Revoked license drops out.
    await db.query("UPDATE licenses SET status = 'revoked' WHERE id = $1", [license.id]);
    due = await listProjectsForDailyRun();
    expect(due.filter((d) => d.licenseId === license.id)).toEqual([]);
  });
});

describe("license isolation", () => {
  it("license B can never read, change, delete or run license A's project, prompts, runs or results", async () => {
    const a = (await createLicense({ email: "a@example.com", plan: "dev" })).license;
    const b = (await createLicense({ email: "b@example.com", plan: "dev" })).license;
    const project = await createProject(a.id, { brandName: "A", domain: "a-brand.com", aliases: [], competitorDomains: [] });
    const [prompt] = await addPrompts(a.id, project.id, ["who is best"]);
    const run = await createRun(a.id, project.id, "manual");
    await insertResult(run.id, result({ promptId: prompt.id, engine: "openai", mentioned: true, cited: true }));
    await finishRun(run.id, "complete");

    expect(await listProjects(b.id)).toEqual([]);
    expect(await getProject(b.id, project.id)).toBeNull();
    expect(await updateProject(b.id, project.id, { brandName: "Hijacked" })).toBeNull();
    expect((await getProject(a.id, project.id))?.brandName).toBe("A");
    expect(await deleteProject(b.id, project.id)).toBe(false);
    expect(await getProject(a.id, project.id)).not.toBeNull();

    expect(await listPrompts(b.id, project.id)).toEqual([]);
    expect(await listPrompts(b.id, project.id, { includeArchived: true })).toEqual([]);
    expect(await addPrompts(b.id, project.id, ["injected"])).toEqual([]);
    expect(await listPrompts(a.id, project.id)).toHaveLength(1);
    expect(await archivePrompt(b.id, project.id, prompt.id)).toBe(false);
    expect((await listPrompts(a.id, project.id))[0].archivedAt).toBeNull();

    await expect(createRun(b.id, project.id, "manual")).rejects.toThrow(NotFoundError);
    expect(await listRuns(a.id, project.id)).toHaveLength(1);
    expect(await listRuns(b.id, project.id)).toEqual([]);
    expect(await getRun(b.id, project.id, run.id)).toBeNull();
    expect(await listResults(b.id, project.id, run.id)).toEqual([]);
    expect(await getDashboard(b.id, project.id)).toBeNull();

    // And A still sees everything.
    expect(await getRun(a.id, project.id, run.id)).not.toBeNull();
    expect(await listResults(a.id, project.id, run.id)).toHaveLength(1);
    expect((await getDashboard(a.id, project.id))?.latestRun?.overall).toEqual({ answered: 1, mentioned: 1, cited: 1 });

    // Engine keys are per license too.
    await setEngineKey(a.id, "openai", "sk-a");
    expect(await getEngineKeys(b.id)).toEqual({});
    expect((await getEngineKeyHints(b.id)).openai.set).toBe(false);
  });
});

describe("getDashboard", () => {
  it("returns an empty dashboard for a project without runs", async () => {
    const { license } = await createLicense({ email: "d0@example.com", plan: "dev" });
    const project = await createProject(license.id, { brandName: "Zero", domain: "zero.com", aliases: [], competitorDomains: [] });
    expect(await getDashboard(license.id, project.id)).toEqual({
      project,
      latestRun: null,
      trend: [],
      promptTable: [],
      competitorLeaderboard: [],
    });
  });

  it("computes rates, the prompt table and the competitor leaderboard from the latest run", async () => {
    const { license } = await createLicense({ email: "d@example.com", plan: "dev" });
    const project = await createProject(license.id, {
      brandName: "Acme",
      domain: "acme.com",
      aliases: ["Acme Inc"],
      competitorDomains: ["rival.com", "www.Other.io"],
    });
    const [p1, p2] = await addPrompts(license.id, project.id, ["best widgets", "widget pricing"]);

    // An older run so the trend has two points and the prompt table is proven to come from the latest.
    const older = await createRun(license.id, project.id, "cron");
    await insertResult(older.id, result({ promptId: p1.id, engine: "openai", mentioned: false, cited: false, sources: [src("https://old.com", "old.com")] }));
    await finishRun(older.id, "complete");
    await db.query("UPDATE runs SET started_at = NOW() - INTERVAL '1 day' WHERE id = $1", [older.id]);

    const latest = await createRun(license.id, project.id, "manual");
    // p1: openai mentioned+cited (acme + rival), anthropic mentioned not cited (rival), gemini errored
    await insertResult(latest.id, result({
      promptId: p1.id, engine: "openai", mentioned: true, position: 1, cited: true,
      sources: [src("https://www.acme.com/a", "www.acme.com"), src("https://rival.com/1", "rival.com"), src("https://rival.com/2", "rival.com")],
    }));
    await insertResult(latest.id, result({
      promptId: p1.id, engine: "anthropic", mentioned: true, position: 3, cited: false,
      sources: [src("https://rival.com/3", "rival.com"), src("https://news.example.org/x", "news.example.org")],
    }));
    await insertResult(latest.id, result({ promptId: p1.id, engine: "gemini", error: "boom", rawText: "", sources: [src("https://ignored.com", "ignored.com")] }));
    // p2: openai not mentioned, cited via subdomain; anthropic errored; gemini mentioned not cited (other.io)
    await insertResult(latest.id, result({
      promptId: p2.id, engine: "openai", mentioned: false, cited: true,
      sources: [src("https://blog.acme.com/p", "blog.acme.com")],
    }));
    await insertResult(latest.id, result({ promptId: p2.id, engine: "anthropic", error: "429", rawText: "" }));
    await insertResult(latest.id, result({
      promptId: p2.id, engine: "gemini", mentioned: true, position: null, cited: false,
      sources: [src("https://other.io/z", "other.io"), src("https://rival.com/4", "rival.com")],
    }));
    await finishRun(latest.id, "partial");

    const dash = await getDashboard(license.id, project.id);
    expect(dash).not.toBeNull();
    if (!dash) return;

    expect(dash.project.id).toBe(project.id);
    expect(dash.trend.map((t) => t.runId)).toEqual([older.id, latest.id]); // oldest to newest
    expect(dash.latestRun?.runId).toBe(latest.id);
    expect(dash.latestRun?.status).toBe("partial");

    const byEngine = Object.fromEntries(dash.latestRun!.perEngine.map((e) => [e.engine, e]));
    expect(dash.latestRun!.perEngine.map((e) => e.engine)).toEqual(["openai", "anthropic", "gemini"]);
    expect(byEngine.openai).toEqual({ engine: "openai", answered: 2, mentioned: 1, cited: 2, mentionRate: 0.5, citationRate: 1 });
    expect(byEngine.anthropic).toEqual({ engine: "anthropic", answered: 1, mentioned: 1, cited: 0, mentionRate: 1, citationRate: 0 });
    expect(byEngine.gemini).toEqual({ engine: "gemini", answered: 1, mentioned: 1, cited: 0, mentionRate: 1, citationRate: 0 });
    expect(dash.latestRun!.overall).toEqual({ answered: 4, mentioned: 3, cited: 2 });

    // Older run: one answered row, nothing mentioned; engines without rows have null rates.
    const olderSummary = dash.trend[0];
    expect(olderSummary.overall).toEqual({ answered: 1, mentioned: 0, cited: 0 });
    expect(olderSummary.perEngine.find((e) => e.engine === "anthropic")).toEqual({
      engine: "anthropic", answered: 0, mentioned: 0, cited: 0, mentionRate: null, citationRate: null,
    });
    expect(olderSummary.perEngine.find((e) => e.engine === "openai")?.mentionRate).toBe(0);

    expect(dash.promptTable).toEqual([
      {
        promptId: p1.id,
        text: "best widgets",
        perEngine: {
          openai: { mentioned: true, position: 1, cited: true, error: null },
          anthropic: { mentioned: true, position: 3, cited: false, error: null },
          gemini: { mentioned: false, position: null, cited: false, error: "boom" },
        },
      },
      {
        promptId: p2.id,
        text: "widget pricing",
        perEngine: {
          openai: { mentioned: false, position: null, cited: true, error: null },
          anthropic: { mentioned: false, position: null, cited: false, error: "429" },
          gemini: { mentioned: true, position: null, cited: false, error: null },
        },
      },
    ]);

    // Leaderboard: one count per result row per domain; rival.com cited twice in one row counts once.
    expect(dash.competitorLeaderboard).toEqual([
      { domain: "rival.com", citations: 3, isUs: false, isNamedCompetitor: true },
      { domain: "acme.com", citations: 1, isUs: true, isNamedCompetitor: false },
      { domain: "blog.acme.com", citations: 1, isUs: true, isNamedCompetitor: false },
      { domain: "ignored.com", citations: 1, isUs: false, isNamedCompetitor: false },
      { domain: "news.example.org", citations: 1, isUs: false, isNamedCompetitor: false },
      { domain: "other.io", citations: 1, isUs: false, isNamedCompetitor: true },
    ]);
  });

  it("caps the trend at the latest 30 runs and the leaderboard at 20 domains", async () => {
    const { license } = await createLicense({ email: "d30@example.com", plan: "dev" });
    const project = await createProject(license.id, { brandName: "Cap", domain: "cap.com", aliases: [], competitorDomains: [] });
    const [p] = await addPrompts(license.id, project.id, ["q"]);
    const runIds: string[] = [];
    for (let i = 0; i < 32; i += 1) {
      const run = await createRun(license.id, project.id, "cron");
      runIds.push(run.id);
      await finishRun(run.id, "complete");
      await db.query("UPDATE runs SET started_at = NOW() - ($2::int * INTERVAL '1 hour') WHERE id = $1", [run.id, 40 - i]);
    }
    const last = runIds[runIds.length - 1];
    const sources = Array.from({ length: 25 }, (_, i) => src(`https://d${i}.com`, `d${i}.com`));
    await insertResult(last, result({ promptId: p.id, engine: "openai", sources }));

    const dash = await getDashboard(license.id, project.id);
    expect(dash?.trend).toHaveLength(30);
    expect(dash?.trend[29].runId).toBe(last);
    expect(dash?.trend[0].runId).toBe(runIds[2]);
    expect(dash?.competitorLeaderboard).toHaveLength(20);
  });
});
