import "../server-only";
import { nanoid } from "nanoid";
import {
  ENGINES,
  type CompetitorRow,
  type Dashboard,
  type EngineId,
  type EngineKeyHint,
  type EngineKeys,
  type EngineRate,
  type License,
  type Project,
  type ProjectInput,
  type Prompt,
  type PromptCell,
  type PromptRow,
  type ResultInput,
  type ResultRow,
  type Run,
  type RunStatus,
  type RunSummary,
  type Source,
} from "../contracts";
import { decryptSecret, encryptSecret, generateLicenseKey, hashLicenseKey } from "../crypto";
import { getDb } from "./client";
import { InvalidInputError, NotFoundError } from "./errors";

export { applySchema, closeDb, getDb, setDbForTests } from "./client";
export type { Queryable } from "./client";
export { InvalidInputError, NotFoundError } from "./errors";

/*
 * Data layer (builder B). Parameterized SQL only. Every read and write of
 * projects, prompts, runs and results is scoped by licenseId through a join
 * or an EXISTS on projects: a wrong license gets null, false or an empty
 * list, never another license's row. No function trusts a license id that
 * came from the client; callers get it from the cookie via requireLicense().
 *
 * Portability notes (verified 2026-10-01 against PGlite 0.5.8, see the
 * builder B report for the probe): JS arrays bind to TEXT[] parameters in
 * both pg and PGlite; JSONB is always sent as a JSON string with a ::jsonb
 * cast because pg would turn a JS array into a Postgres array literal;
 * TIMESTAMPTZ comes back as a Date in both drivers; counts are cast to int
 * because pg returns bigint as a string.
 */

/* ------------------------------------------------------------------ */
/* Row mapping: the only place snake_case meets camelCase.             */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error(`expected a timestamp, got ${typeof value}`);
}

function toIsoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function toSources(value: unknown): Source[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      url: typeof s.url === "string" ? s.url : "",
      domain: typeof s.domain === "string" ? s.domain : "",
      title: typeof s.title === "string" ? s.title : null,
    }));
}

function mapLicense(r: Row): License {
  return {
    id: String(r.id),
    email: String(r.email),
    plan: r.plan as License["plan"],
    status: r.status as License["status"],
    createdAt: toIso(r.created_at),
  };
}

function mapProject(r: Row): Project {
  return {
    id: String(r.id),
    licenseId: String(r.license_id),
    brandName: String(r.brand_name),
    domain: String(r.domain),
    aliases: toStringArray(r.aliases),
    competitorDomains: toStringArray(r.competitor_domains),
    dailyRun: Boolean(r.daily_run),
    createdAt: toIso(r.created_at),
  };
}

function mapPrompt(r: Row): Prompt {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    text: String(r.text),
    createdAt: toIso(r.created_at),
    archivedAt: toIsoOrNull(r.archived_at),
  };
}

function mapRun(r: Row): Run {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    trigger: r.trigger as Run["trigger"],
    status: r.status as RunStatus,
    startedAt: toIso(r.started_at),
    finishedAt: toIsoOrNull(r.finished_at),
  };
}

function mapResult(r: Row): ResultRow {
  return {
    id: String(r.id),
    runId: String(r.run_id),
    promptId: String(r.prompt_id),
    engine: r.engine as EngineId,
    model: r.model === null || r.model === undefined ? null : String(r.model),
    mentioned: Boolean(r.mentioned),
    position: r.position === null || r.position === undefined ? null : Number(r.position),
    cited: Boolean(r.cited),
    sources: toSources(r.sources),
    searchResults: toSources(r.search_results),
    competitorDomainsCited: toStringArray(r.competitor_domains_cited),
    rawText: String(r.raw_text ?? ""),
    error: r.error === null || r.error === undefined ? null : String(r.error),
    latencyMs: r.latency_ms === null || r.latency_ms === undefined ? null : Number(r.latency_ms),
    createdAt: toIso(r.created_at),
  };
}

/* ------------------------------------------------------------------ */
/* Input normalization                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lowercase, strip scheme, credentials, www., port, path, query, hash and
 * trailing dots. Throws InvalidInputError when nothing usable is left.
 */
export function normalizeDomain(input: string): string {
  let s = (input ?? "").trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.replace(/^\/\//, ""); // protocol-relative
  s = s.split(/[/?#]/)[0] ?? ""; // path, query, hash
  s = s.replace(/^[^@]*@/, ""); // user:pass@
  s = s.replace(/:\d+$/, ""); // port
  s = s.replace(/^www\./, "");
  s = s.replace(/\.+$/, ""); // trailing dots
  if (!s) throw new InvalidInputError("domain is required");
  if (/\s/.test(s) || !s.includes(".")) {
    throw new InvalidInputError(`"${input.trim()}" is not a domain name like example.com`);
  }
  return s;
}

/** Trim, drop blanks, dedupe case-insensitively keeping the first spelling. */
function cleanAliases(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Normalize each competitor domain; blanks are skipped, invalid ones throw. */
function cleanCompetitorDomains(values: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of values ?? []) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    const d = normalizeDomain(v);
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

function cleanBrandName(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) throw new InvalidInputError("brandName is required");
  return v;
}

/* ------------------------------------------------------------------ */
/* Licenses                                                             */
/* ------------------------------------------------------------------ */

const LICENSE_COLUMNS = "id, email, plan, status, created_at";

export async function createLicense(input: {
  email: string;
  plan: License["plan"];
  stripeSessionId?: string | null;
}): Promise<{ license: License; key: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new InvalidInputError("email is required");
  // The plaintext key exists only here and in the return value. Never log it.
  const key = generateLicenseKey();
  const { rows } = await getDb().query(
    `INSERT INTO licenses (id, key_hash, key_hint, email, plan, stripe_session_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${LICENSE_COLUMNS}`,
    [nanoid(21), hashLicenseKey(key), key.slice(-4), email, input.plan, input.stripeSessionId ?? null]
  );
  return { license: mapLicense(rows[0]), key };
}

/** Active licenses only; bumps last_seen_at. */
export async function findLicenseByKey(key: string): Promise<License | null> {
  const trimmed = (key ?? "").trim();
  if (!trimmed) return null;
  const { rows } = await getDb().query(
    `UPDATE licenses SET last_seen_at = NOW()
     WHERE key_hash = $1 AND status = 'active'
     RETURNING ${LICENSE_COLUMNS}`,
    [hashLicenseKey(trimmed)]
  );
  return rows.length ? mapLicense(rows[0]) : null;
}

export async function licenseExistsForStripeSession(sessionId: string): Promise<boolean> {
  const { rows } = await getDb().query(`SELECT 1 AS one FROM licenses WHERE stripe_session_id = $1 LIMIT 1`, [
    sessionId,
  ]);
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Engine keys                                                          */
/* ------------------------------------------------------------------ */

function assertEngine(engine: string): asserts engine is EngineId {
  if (!(ENGINES as readonly string[]).includes(engine)) {
    throw new InvalidInputError(`unknown engine "${engine}"`);
  }
}

export async function setEngineKey(licenseId: string, engine: EngineId, apiKey: string): Promise<void> {
  assertEngine(engine);
  const plain = (apiKey ?? "").trim();
  if (!plain) throw new InvalidInputError("apiKey is required");
  await getDb().query(
    `INSERT INTO engine_keys (license_id, engine, ciphertext, key_hint, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (license_id, engine)
     DO UPDATE SET ciphertext = EXCLUDED.ciphertext, key_hint = EXCLUDED.key_hint, updated_at = NOW()`,
    [licenseId, engine, encryptSecret(plain), plain.slice(-4)]
  );
}

export async function deleteEngineKey(licenseId: string, engine: EngineId): Promise<void> {
  assertEngine(engine);
  await getDb().query(`DELETE FROM engine_keys WHERE license_id = $1 AND engine = $2`, [licenseId, engine]);
}

/** Decrypted; server only; never serialized to a response. */
export async function getEngineKeys(licenseId: string): Promise<EngineKeys> {
  const { rows } = await getDb().query(`SELECT engine, ciphertext FROM engine_keys WHERE license_id = $1`, [
    licenseId,
  ]);
  const keys: EngineKeys = {};
  for (const r of rows) {
    const engine = String(r.engine);
    assertEngine(engine);
    keys[engine] = decryptSecret(String(r.ciphertext));
  }
  return keys;
}

/** Hints only: whether a key is set, its last 4 chars and when it changed. Ciphertext is never read. */
export async function getEngineKeyHints(licenseId: string): Promise<Record<EngineId, EngineKeyHint>> {
  const { rows } = await getDb().query(`SELECT engine, key_hint, updated_at FROM engine_keys WHERE license_id = $1`, [
    licenseId,
  ]);
  const hints = {} as Record<EngineId, EngineKeyHint>;
  for (const engine of ENGINES) hints[engine] = { set: false, hint: null, updatedAt: null };
  for (const r of rows) {
    const engine = String(r.engine);
    assertEngine(engine);
    hints[engine] = { set: true, hint: String(r.key_hint), updatedAt: toIso(r.updated_at) };
  }
  return hints;
}

/* ------------------------------------------------------------------ */
/* Projects                                                             */
/* ------------------------------------------------------------------ */

const PROJECT_COLUMNS = "id, license_id, brand_name, domain, aliases, competitor_domains, daily_run, created_at";

export async function createProject(licenseId: string, input: ProjectInput): Promise<Project> {
  const brandName = cleanBrandName(input.brandName);
  const domain = normalizeDomain(input.domain);
  const aliases = cleanAliases(input.aliases);
  const competitorDomains = cleanCompetitorDomains(input.competitorDomains);
  const dailyRun = input.dailyRun ?? true;
  const { rows } = await getDb().query(
    `INSERT INTO projects (id, license_id, brand_name, domain, aliases, competitor_domains, daily_run)
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7)
     RETURNING ${PROJECT_COLUMNS}`,
    [nanoid(21), licenseId, brandName, domain, aliases, competitorDomains, dailyRun]
  );
  return mapProject(rows[0]);
}

export async function listProjects(licenseId: string): Promise<Project[]> {
  const { rows } = await getDb().query(
    `SELECT ${PROJECT_COLUMNS} FROM projects WHERE license_id = $1 ORDER BY created_at ASC, id ASC`,
    [licenseId]
  );
  return rows.map(mapProject);
}

export async function getProject(licenseId: string, projectId: string): Promise<Project | null> {
  const { rows } = await getDb().query(
    `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1 AND license_id = $2`,
    [projectId, licenseId]
  );
  return rows.length ? mapProject(rows[0]) : null;
}

export async function updateProject(
  licenseId: string,
  projectId: string,
  input: Partial<ProjectInput>
): Promise<Project | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (fragment: string, value: unknown) => {
    params.push(value);
    sets.push(fragment.replace("?", `$${params.length}`));
  };
  if (input.brandName !== undefined) push("brand_name = ?", cleanBrandName(input.brandName));
  if (input.domain !== undefined) push("domain = ?", normalizeDomain(input.domain));
  if (input.aliases !== undefined) push("aliases = ?::text[]", cleanAliases(input.aliases));
  if (input.competitorDomains !== undefined) {
    push("competitor_domains = ?::text[]", cleanCompetitorDomains(input.competitorDomains));
  }
  if (input.dailyRun !== undefined) push("daily_run = ?", Boolean(input.dailyRun));
  if (sets.length === 0) return getProject(licenseId, projectId);

  params.push(projectId, licenseId);
  const { rows } = await getDb().query(
    `UPDATE projects SET ${sets.join(", ")}
     WHERE id = $${params.length - 1} AND license_id = $${params.length}
     RETURNING ${PROJECT_COLUMNS}`,
    params
  );
  return rows.length ? mapProject(rows[0]) : null;
}

export async function deleteProject(licenseId: string, projectId: string): Promise<boolean> {
  const { rows } = await getDb().query(`DELETE FROM projects WHERE id = $1 AND license_id = $2 RETURNING id`, [
    projectId,
    licenseId,
  ]);
  return rows.length > 0;
}

/** True when the project belongs to the license. Used by prompt and run writes. */
async function projectBelongsToLicense(licenseId: string, projectId: string): Promise<boolean> {
  const { rows } = await getDb().query(`SELECT 1 AS one FROM projects WHERE id = $1 AND license_id = $2`, [
    projectId,
    licenseId,
  ]);
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Prompts                                                              */
/* ------------------------------------------------------------------ */

const PROMPT_COLUMNS = "id, project_id, text, created_at, archived_at";

export async function addPrompts(licenseId: string, projectId: string, texts: string[]): Promise<Prompt[]> {
  if (!(await projectBelongsToLicense(licenseId, projectId))) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of texts ?? []) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(t);
  }
  if (clean.length === 0) return [];

  const ids = clean.map(() => nanoid(21));
  // One INSERT with unnest keeps the batch atomic. NOW() is the same for the
  // whole statement, so each row gets its ordinal added in microseconds:
  // listPrompts orders by created_at and the batch must keep its input order.
  const { rows } = await getDb().query(
    `INSERT INTO prompts (id, project_id, text, created_at)
     SELECT u.i, $1, u.t, NOW() + ((u.ord - 1) * INTERVAL '1 microsecond')
     FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS u(i, t, ord)
     RETURNING ${PROMPT_COLUMNS}`,
    [projectId, ids, clean]
  );
  // unnest preserves input order, but sort by the id list to be safe.
  const byId = new Map(rows.map((r) => [String(r.id), mapPrompt(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is Prompt => p !== undefined);
}

export async function listPrompts(
  licenseId: string,
  projectId: string,
  opts?: { includeArchived?: boolean }
): Promise<Prompt[]> {
  const archivedFilter = opts?.includeArchived ? "" : "AND p.archived_at IS NULL";
  const { rows } = await getDb().query(
    `SELECT p.id, p.project_id, p.text, p.created_at, p.archived_at
     FROM prompts p
     JOIN projects pr ON pr.id = p.project_id
     WHERE p.project_id = $1 AND pr.license_id = $2 ${archivedFilter}
     ORDER BY p.created_at ASC, p.id ASC`,
    [projectId, licenseId]
  );
  return rows.map(mapPrompt);
}

/** Idempotent: an already archived prompt that belongs to the license still returns true. */
export async function archivePrompt(licenseId: string, projectId: string, promptId: string): Promise<boolean> {
  const { rows } = await getDb().query(
    `UPDATE prompts SET archived_at = COALESCE(archived_at, NOW())
     WHERE id = $1 AND project_id = $2
       AND EXISTS (SELECT 1 FROM projects WHERE id = $2 AND license_id = $3)
     RETURNING id`,
    [promptId, projectId, licenseId]
  );
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Runs and results                                                     */
/* ------------------------------------------------------------------ */

const RUN_COLUMNS = "id, project_id, trigger, status, started_at, finished_at";

/** Throws NotFoundError when the project is not this license's (a run row must never exist for a foreign project). */
export async function createRun(licenseId: string, projectId: string, trigger: Run["trigger"]): Promise<Run> {
  if (!(await projectBelongsToLicense(licenseId, projectId))) throw new NotFoundError("project not found");
  const { rows } = await getDb().query(
    `INSERT INTO runs (id, project_id, trigger) VALUES ($1, $2, $3) RETURNING ${RUN_COLUMNS}`,
    [nanoid(21), projectId, trigger]
  );
  return mapRun(rows[0]);
}

export async function insertResult(runId: string, result: ResultInput): Promise<void> {
  assertEngine(result.engine);
  await getDb().query(
    `INSERT INTO results
       (id, run_id, prompt_id, engine, model, mentioned, position, cited, sources, search_results,
        competitor_domains_cited, raw_text, error, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::text[], $12, $13, $14)`,
    [
      nanoid(21),
      runId,
      result.promptId,
      result.engine,
      result.model ?? null,
      Boolean(result.mentioned),
      result.position ?? null,
      Boolean(result.cited),
      JSON.stringify(result.sources ?? []),
      JSON.stringify(result.searchResults ?? []),
      result.competitorDomainsCited ?? [],
      result.rawText ?? "",
      result.error ?? null,
      result.latencyMs ?? null,
    ]
  );
}

export async function finishRun(runId: string, status: RunStatus): Promise<void> {
  await getDb().query(`UPDATE runs SET status = $2, finished_at = NOW() WHERE id = $1`, [runId, status]);
}

export async function listRuns(licenseId: string, projectId: string, limit = 30): Promise<Run[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const { rows } = await getDb().query(
    `SELECT r.id, r.project_id, r.trigger, r.status, r.started_at, r.finished_at
     FROM runs r
     JOIN projects p ON p.id = r.project_id
     WHERE r.project_id = $1 AND p.license_id = $2
     ORDER BY r.started_at DESC, r.id DESC
     LIMIT $3`,
    [projectId, licenseId, n]
  );
  return rows.map(mapRun);
}

export async function getRun(licenseId: string, projectId: string, runId: string): Promise<Run | null> {
  const { rows } = await getDb().query(
    `SELECT r.id, r.project_id, r.trigger, r.status, r.started_at, r.finished_at
     FROM runs r
     JOIN projects p ON p.id = r.project_id
     WHERE r.id = $1 AND r.project_id = $2 AND p.license_id = $3`,
    [runId, projectId, licenseId]
  );
  return rows.length ? mapRun(rows[0]) : null;
}

export async function listResults(licenseId: string, projectId: string, runId: string): Promise<ResultRow[]> {
  const { rows } = await getDb().query(
    `SELECT res.id, res.run_id, res.prompt_id, res.engine, res.model, res.mentioned, res.position, res.cited,
            res.sources, res.search_results, res.competitor_domains_cited, res.raw_text, res.error,
            res.latency_ms, res.created_at
     FROM results res
     JOIN runs r ON r.id = res.run_id
     JOIN projects p ON p.id = r.project_id
     WHERE res.run_id = $1 AND r.project_id = $2 AND p.license_id = $3
     ORDER BY res.created_at ASC, res.id ASC`,
    [runId, projectId, licenseId]
  );
  return rows.map(mapResult);
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

/** Lowercase, strip www. (SPEC "Domain matching"). */
function normalizeForMatch(domain: string): string {
  return (domain ?? "").trim().toLowerCase().replace(/^www\./, "");
}

/** A source domain matches a project domain when equal or a subdomain of it. */
export function domainMatches(sourceDomain: string, projectDomain: string): boolean {
  const s = normalizeForMatch(sourceDomain);
  const p = normalizeForMatch(projectDomain);
  if (!s || !p) return false;
  return s === p || s.endsWith(`.${p}`);
}

type DashboardResultRow = {
  runId: string;
  promptId: string;
  engine: EngineId;
  mentioned: boolean;
  position: number | null;
  cited: boolean;
  error: string | null;
  sources: Source[];
};

function rate(numerator: number, answered: number): number | null {
  return answered === 0 ? null : numerator / answered;
}

/** Per-engine and overall counts for one run. Errored rows are excluded from `answered`. */
function summarizeRun(run: { id: string; startedAt: string; status: RunStatus }, rows: DashboardResultRow[]): RunSummary {
  const perEngine: EngineRate[] = ENGINES.map((engine) => {
    let answered = 0;
    let mentioned = 0;
    let cited = 0;
    for (const r of rows) {
      if (r.engine !== engine || r.error !== null) continue;
      answered += 1;
      if (r.mentioned) mentioned += 1;
      if (r.cited) cited += 1;
    }
    return { engine, answered, mentioned, cited, mentionRate: rate(mentioned, answered), citationRate: rate(cited, answered) };
  });
  const overall = perEngine.reduce(
    (acc, e) => ({ answered: acc.answered + e.answered, mentioned: acc.mentioned + e.mentioned, cited: acc.cited + e.cited }),
    { answered: 0, mentioned: 0, cited: 0 }
  );
  return { runId: run.id, startedAt: run.startedAt, status: run.status, perEngine, overall };
}

function buildLeaderboard(rows: DashboardResultRow[], project: Project): CompetitorRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    // One count per result row per domain, however many times the row cites it.
    const seen = new Set<string>();
    for (const s of r.sources) {
      const d = normalizeForMatch(s.domain);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([domain, citations]) => ({
      domain,
      citations,
      isUs: domainMatches(domain, project.domain),
      isNamedCompetitor: project.competitorDomains.some((c) => domainMatches(domain, c)),
    }));
}

export async function getDashboard(licenseId: string, projectId: string): Promise<Dashboard | null> {
  const project = await getProject(licenseId, projectId);
  if (!project) return null;

  // Latest 30 runs, newest first; the trend wants oldest to newest.
  const runs = await listRuns(licenseId, projectId, 30);
  if (runs.length === 0) {
    return { project, latestRun: null, trend: [], promptTable: [], competitorLeaderboard: [] };
  }
  const latest = runs[0];
  const runIds = runs.map((r) => r.id);

  // Sources are only needed for the latest run (leaderboard); skip the JSON for the rest.
  const { rows } = await getDb().query(
    `SELECT run_id, prompt_id, engine, mentioned, position, cited, error,
            CASE WHEN run_id = $2 THEN sources ELSE '[]'::jsonb END AS sources
     FROM results
     WHERE run_id = ANY($1::text[])
     ORDER BY created_at ASC, id ASC`,
    [runIds, latest.id]
  );
  const results: DashboardResultRow[] = rows.map((r) => ({
    runId: String(r.run_id),
    promptId: String(r.prompt_id),
    engine: r.engine as EngineId,
    mentioned: Boolean(r.mentioned),
    position: r.position === null || r.position === undefined ? null : Number(r.position),
    cited: Boolean(r.cited),
    error: r.error === null || r.error === undefined ? null : String(r.error),
    sources: toSources(r.sources),
  }));

  const byRun = new Map<string, DashboardResultRow[]>();
  for (const r of results) {
    const list = byRun.get(r.runId);
    if (list) list.push(r);
    else byRun.set(r.runId, [r]);
  }

  const trend = [...runs].reverse().map((run) => summarizeRun(run, byRun.get(run.id) ?? []));
  const latestRows = byRun.get(latest.id) ?? [];
  const latestRun = trend[trend.length - 1];

  // Prompt table from the latest run, ordered by prompt creation (archived prompts with results still show).
  const promptIds = [...new Set(latestRows.map((r) => r.promptId))];
  const promptTable: PromptRow[] = [];
  if (promptIds.length > 0) {
    const { rows: promptRows } = await getDb().query(
      `SELECT id, text FROM prompts WHERE id = ANY($1::text[]) AND project_id = $2 ORDER BY created_at ASC, id ASC`,
      [promptIds, projectId]
    );
    for (const p of promptRows) {
      const id = String(p.id);
      const perEngine: Partial<Record<EngineId, PromptCell>> = {};
      for (const r of latestRows) {
        if (r.promptId !== id) continue;
        perEngine[r.engine] = { mentioned: r.mentioned, position: r.position, cited: r.cited, error: r.error };
      }
      promptTable.push({ promptId: id, text: String(p.text), perEngine });
    }
  }

  return {
    project,
    latestRun,
    trend,
    promptTable,
    competitorLeaderboard: buildLeaderboard(latestRows, project),
  };
}

/* ------------------------------------------------------------------ */
/* Cron                                                                 */
/* ------------------------------------------------------------------ */

/** Active licenses, daily_run true, at least one engine key and one active prompt. Oldest project first. */
export async function listProjectsForDailyRun(): Promise<Array<{ licenseId: string; projectId: string }>> {
  const { rows } = await getDb().query(
    `SELECT p.license_id, p.id AS project_id
     FROM projects p
     JOIN licenses l ON l.id = p.license_id
     WHERE l.status = 'active'
       AND p.daily_run = TRUE
       AND EXISTS (SELECT 1 FROM engine_keys k WHERE k.license_id = l.id)
       AND EXISTS (SELECT 1 FROM prompts pr WHERE pr.project_id = p.id AND pr.archived_at IS NULL)
     ORDER BY p.created_at ASC, p.id ASC`
  );
  return rows.map((r) => ({ licenseId: String(r.license_id), projectId: String(r.project_id) }));
}
