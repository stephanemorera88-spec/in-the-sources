# Build spec: AEO visibility tracker (working name "In the Sources")

Written 2026-10-01 by the orchestrator session (Archer, Fable 5.1). This file is the contract every builder codes against. Read it in full before touching a file. Working folder: `/Users/stephanemorera/Desktop/aeo-tracker` (Next 16.3.8, TypeScript strict, Tailwind 4, `src/` dir, App Router). Product name and price are constants in `src/lib/product.ts` so a rename is a one-file change.

## Product in one paragraph

Bring-your-own-key AI visibility tracker sold as a lifetime deal. A buyer pays once through a Stripe Payment Link, a webhook mints a license key, Resend emails it, the key goes in an httpOnly cookie. In the app the user pastes their own OpenAI, Anthropic and Gemini keys (encrypted at rest, never returned to the browser), creates a project (brand, domain, aliases, competitor domains), adds prompts (manual or suggested from the site text), and runs every prompt on every engine with web search on. Per answer we store whether the brand was mentioned, its position in a numbered list, whether the brand's domain is in the answer's cited sources, the full source list, the search results seen, and the raw text. The dashboard leads with source-set inclusion rate (cited) and mention rate per engine, a trend across runs, a per-prompt table and a competitor domain leaderboard. A Vercel cron runs every project daily.

Not in v1: Perplexity, Google AI Overviews, teams, PDF reports, white label, subscriptions, password login.

## Engines (verified against the installed SDK type definitions, 2026-10-01)

Model IDs are env-overridable constants in `src/lib/engines/models.ts`:
- OpenAI `gpt-5-mini`, Responses API, `tools: [{ type: "web_search" }]`, `reasoning: { effort: "low" }`. Citations: `response.output[]` items with `type === "message"`, their `content[]` items with `type === "output_text"`, each has `annotations[]`; keep `type === "url_citation"` entries `{ url, title }`. Source: `node_modules/openai/resources/responses/responses.d.ts` (`ResponseOutputText.URLCitation`, around line 5436). Text: `response.output_text`.
- Anthropic `claude-haiku-4-5`, `client.messages.create`, tool `{ type: "web_search_20250305", name: "web_search", max_uses: 3 }` (the 20250305 variant is the one Haiku 4.5 supports; do not use the 20260209 variant on Haiku). Citations: `message.content[]` blocks with `type === "text"` carry `citations?: TextCitation[]`; keep `type === "web_search_result_location"` entries `{ url, title, cited_text }`. Search results seen: blocks with `type === "web_search_tool_result"` whose `content` is an ARRAY of `{ type: "web_search_result", url, title, page_age }` (when `content` is an object it is an error, branch on `Array.isArray`). Source: `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` (`CitationsWebSearchResultLocation` line 1165, `WebSearchResultBlock` line 3293).
- Gemini `gemini-2.5-flash`, `ai.models.generateContent` with `config.tools: [{ googleSearch: {} }]`. Grounding: `result.candidates?.[0]?.groundingMetadata?.groundingChunks?.[]` with `.web?.uri` and `.web?.title`. Source: `node_modules/@google/genai/dist/genai.d.ts` (`GroundingMetadata` line 8009, `GroundingChunkWeb` line 7999). KNOWN GOTCHA: on the Gemini API the `uri` is usually a `vertexaisearch.cloud.google.com/grounding-api-redirect/...` redirect, not the real page, and `domain` is not populated. The engine must resolve each redirect (fetch with `redirect: "manual"`, read `location`, 5 s timeout, run in parallel, cap 20) and fall back to `title` as the domain when resolution fails (Gemini sets `title` to the source hostname). Verify live if a key is available.

System prompt, identical for all three engines: "Answer the question using web search. Use current information and cite your sources." Nothing else. We measure what the engine says, we do not steer it.

Per-call timeout 90 s (OpenAI with web search can take 50 s). Concurrency cap 8 calls in flight per run. A failed call is a result row with `error` set and `raw_text` empty; it is excluded from rate denominators.

## Data model (`db/schema.sql`, idempotent, app-generated ids via nanoid)

```sql
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,            -- sha256 hex of the plaintext key; plaintext never stored
  key_hint TEXT NOT NULL,                   -- last 4 chars, for support
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('founder','standard','dev')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  stripe_session_id TEXT UNIQUE,            -- idempotency for the webhook
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS engine_keys (
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('openai','anthropic','gemini')),
  ciphertext TEXT NOT NULL,                 -- base64(iv | tag | ciphertext), AES-256-GCM
  key_hint TEXT NOT NULL,                   -- last 4 chars only
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (license_id, engine)
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  domain TEXT NOT NULL,                     -- normalized: lowercase, no scheme, no www., no path
  aliases TEXT[] NOT NULL DEFAULT '{}',     -- alternate brand spellings for mention matching
  competitor_domains TEXT[] NOT NULL DEFAULT '{}',
  daily_run BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_license_idx ON projects(license_id);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS prompts_project_idx ON prompts(project_id);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual','cron')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','partial','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS runs_project_idx ON runs(project_id, started_at DESC);
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('openai','anthropic','gemini')),
  model TEXT,
  mentioned BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER,
  cited BOOLEAN NOT NULL DEFAULT FALSE,
  sources JSONB NOT NULL DEFAULT '[]',         -- Source[] cited by the answer
  search_results JSONB NOT NULL DEFAULT '[]',  -- Source[] seen by the engine (Anthropic, Gemini), [] for OpenAI
  competitor_domains_cited TEXT[] NOT NULL DEFAULT '{}',
  raw_text TEXT NOT NULL DEFAULT '',
  error TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS results_run_idx ON results(run_id);
```

Every read and write of projects, prompts, runs and results is scoped by `license_id` (projects join). No route ever accepts a license id from the client; it comes only from the cookie.

## Contracts (`src/lib/contracts.ts`, written in phase 1, additive changes only)

```ts
export type EngineId = "openai" | "anthropic" | "gemini";
export const ENGINES: readonly EngineId[];
export interface EngineKeys { openai?: string; anthropic?: string; gemini?: string }
export interface Source { url: string; domain: string; title: string | null }
export interface EngineAnswer { engine: EngineId; model: string; text: string; sources: Source[]; searchResults: Source[]; latencyMs: number; error: string | null }
export interface AnswerAnalysis { mentioned: boolean; position: number | null; cited: boolean; competitorDomainsCited: string[] }
export interface ProjectInput { brandName: string; domain: string; aliases: string[]; competitorDomains: string[]; dailyRun?: boolean }
export interface Project { id: string; licenseId: string; brandName: string; domain: string; aliases: string[]; competitorDomains: string[]; dailyRun: boolean; createdAt: string }
export interface Prompt { id: string; projectId: string; text: string; createdAt: string; archivedAt: string | null }
export type RunStatus = "running" | "complete" | "partial" | "failed";
export interface Run { id: string; projectId: string; trigger: "manual" | "cron"; status: RunStatus; startedAt: string; finishedAt: string | null }
export interface ResultInput { promptId: string; engine: EngineId; model: string | null; mentioned: boolean; position: number | null; cited: boolean; sources: Source[]; searchResults: Source[]; competitorDomainsCited: string[]; rawText: string; error: string | null; latencyMs: number | null }
export interface ResultRow extends ResultInput { id: string; runId: string; createdAt: string }
export interface License { id: string; email: string; plan: "founder" | "standard" | "dev"; status: "active" | "revoked"; createdAt: string }
export interface EngineKeyHint { set: boolean; hint: string | null; updatedAt: string | null }
export interface EngineRate { engine: EngineId; answered: number; mentioned: number; cited: number; mentionRate: number | null; citationRate: number | null }
export interface RunSummary { runId: string; startedAt: string; status: RunStatus; perEngine: EngineRate[]; overall: { answered: number; mentioned: number; cited: number } }
export interface PromptCell { mentioned: boolean; position: number | null; cited: boolean; error: string | null }
export interface PromptRow { promptId: string; text: string; perEngine: Partial<Record<EngineId, PromptCell>> }
export interface CompetitorRow { domain: string; citations: number; isUs: boolean; isNamedCompetitor: boolean }
export interface Dashboard { project: Project; latestRun: RunSummary | null; trend: RunSummary[]; promptTable: PromptRow[]; competitorLeaderboard: CompetitorRow[] }
```

Rates: `mentionRate = mentioned / answered`, `citationRate = cited / answered`, `answered` excludes errored rows; null when answered is 0. `trend` is oldest to newest, at most 30 runs. `promptTable` is from the latest run. `competitorLeaderboard` counts result rows in the latest run whose `sources` contain the domain (one count per result row per domain), top 20, `isUs` when the domain matches the project domain, `isNamedCompetitor` when it is in `competitorDomains`.

Domain matching: normalize both sides to lowercase, strip `www.`; a source domain matches a project domain when equal or when it ends with `"." + domain`.

Mention matching: brand name or any alias, word boundary, case-insensitive, with the "I don't have information" radius check from the existing parser (`src/lib/engines/queries.ts`, keep that logic). Position only from a genuine numbered-list entry.

## Module ownership (phase 2, strict; a builder edits only its own paths)

- **Builder A, engines.** `src/lib/engines/**` (rewrite freely; delete the copied audit files once replaced), `src/lib/runs/**`, tests under those folders. Implements: `askEngine`, `analyzeAnswer`, `fetchSiteText`, `suggestPrompts`, `runProjectPrompts`, `executeRun`.
- **Builder B, data and access.** `db/**`, `src/lib/db/**`, `src/lib/crypto/**`, `src/lib/license/**`, `src/lib/email/**`, `src/lib/stripe/**`, `src/app/api/license/**`, `src/app/api/stripe/**`, `src/app/api/health/route.ts`, `scripts/**`, tests under those folders.
- **Builder C, app UI.** `src/app/app/**`, `src/app/activate/**`, `src/app/api/projects/**`, `src/app/api/settings/**`, `src/components/app/**`.
- **Builder D, landing, cron, pixel.** `src/app/page.tsx`, `src/app/thanks/**`, `src/app/api/cron/**`, `src/components/marketing/**`, `src/components/MetaPixel.tsx`, `vercel.json`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/opengraph-image.tsx` (optional), `public/**` for marketing assets.
- Shared, written in phase 1, frozen in phase 2: `src/lib/contracts.ts`, `src/lib/product.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**`, `vitest.config.ts`, `package.json` (builders may add dependencies only by appending to their final report; the integrator installs them), `README.md`, `.env.example`.

Function signatures (phase 1 writes every one of these as a stub that throws `new Error("not implemented: <name>")`, so the tree type-checks from minute one; each builder replaces the bodies in its own folders):

```ts
// src/lib/engines/index.ts  (A)
askEngine(engine: EngineId, apiKey: string, prompt: string, opts?: { timeoutMs?: number }): Promise<EngineAnswer>
analyzeAnswer(answer: EngineAnswer, project: Pick<Project, "brandName" | "domain" | "aliases" | "competitorDomains">): AnswerAnalysis
fetchSiteText(domain: string): Promise<string>                 // SSRF-guarded, tries /llms.txt then /, <= 8000 chars
suggestPrompts(keys: EngineKeys, project: ProjectInput, siteText: string): Promise<string[]>  // 10 prompts, 8 unbranded + 2 branded
runProjectPrompts(params: { keys: EngineKeys; project: Project; prompts: Prompt[]; onResult: (r: ResultInput) => Promise<void>; concurrency?: number }): Promise<{ total: number; errored: number }>
// src/lib/runs/index.ts  (A)
executeRun(licenseId: string, projectId: string, trigger: "manual" | "cron"): Promise<Run>   // createRun, runProjectPrompts with insertResult, finishRun; never throws after the run row exists (marks failed/partial)
// src/lib/db/index.ts  (B)
createLicense(input: { email: string; plan: License["plan"]; stripeSessionId?: string | null }): Promise<{ license: License; key: string }>
findLicenseByKey(key: string): Promise<License | null>          // active only; bumps last_seen_at
licenseExistsForStripeSession(sessionId: string): Promise<boolean>
setEngineKey(licenseId: string, engine: EngineId, apiKey: string): Promise<void>
deleteEngineKey(licenseId: string, engine: EngineId): Promise<void>
getEngineKeys(licenseId: string): Promise<EngineKeys>           // decrypted; server only; never serialized to a response
getEngineKeyHints(licenseId: string): Promise<Record<EngineId, EngineKeyHint>>
createProject(licenseId: string, input: ProjectInput): Promise<Project>
listProjects(licenseId: string): Promise<Project[]>
getProject(licenseId: string, projectId: string): Promise<Project | null>
updateProject(licenseId: string, projectId: string, input: Partial<ProjectInput>): Promise<Project | null>
deleteProject(licenseId: string, projectId: string): Promise<boolean>
addPrompts(licenseId: string, projectId: string, texts: string[]): Promise<Prompt[]>
listPrompts(licenseId: string, projectId: string, opts?: { includeArchived?: boolean }): Promise<Prompt[]>
archivePrompt(licenseId: string, projectId: string, promptId: string): Promise<boolean>
createRun(licenseId: string, projectId: string, trigger: Run["trigger"]): Promise<Run>
insertResult(runId: string, result: ResultInput): Promise<void>
finishRun(runId: string, status: RunStatus): Promise<void>
listRuns(licenseId: string, projectId: string, limit?: number): Promise<Run[]>
getRun(licenseId: string, projectId: string, runId: string): Promise<Run | null>
listResults(licenseId: string, projectId: string, runId: string): Promise<ResultRow[]>
getDashboard(licenseId: string, projectId: string): Promise<Dashboard | null>
listProjectsForDailyRun(): Promise<Array<{ licenseId: string; projectId: string }>>   // active licenses, daily_run true, >= 1 engine key, >= 1 active prompt
// src/lib/db/client.ts  (B; phase 1 writes the Queryable interface and the pg Pool)
type Queryable = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
getDb(): Queryable            // pg Pool on DATABASE_URL (sslmode handling as in the site's db.ts)
setDbForTests(q: Queryable)   // tests inject a PGlite instance
// src/lib/crypto/index.ts  (B)
encryptSecret(plain: string): string      // AES-256-GCM, key = KEY_ENCRYPTION_SECRET (64 hex chars), base64(iv|tag|ct)
decryptSecret(blob: string): string
hashLicenseKey(key: string): string       // sha256 hex
generateLicenseKey(): string              // "its_" + 32 chars from [A-Za-z0-9] via nanoid customAlphabet
// src/lib/license/index.ts  (B)
LICENSE_COOKIE = "its_license"
getCurrentLicense(): Promise<License | null>     // cookies() from next/headers, then findLicenseByKey
requireLicense(): Promise<License>               // throws UnauthorizedError
class UnauthorizedError extends Error
licenseCookieOptions(): { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number }  // secure = NODE_ENV production, maxAge 365 days
// src/lib/email/index.ts  (B)
sendLicenseKeyEmail(params: { to: string; key: string }): Promise<void>   // Resend, from EMAIL_FROM, link to `${NEXT_PUBLIC_BASE_URL}/activate?k=${key}`
// src/lib/stripe/index.ts  (B)
constructWebhookEvent(rawBody: string, signature: string): Stripe.Event   // STRIPE_WEBHOOK_SECRET; the app needs no Stripe secret key in v1
```

API routes and who owns them:
- B: `POST /api/license/activate` body `{ key }` → 200 and sets the cookie, 401 on unknown or revoked key, rate limited 10 per minute per IP (in-memory, like the site). `POST /api/license/logout` clears the cookie. `POST /api/stripe/webhook` raw body + `stripe-signature`, handles `checkout.session.completed`: idempotent on `session.id`, email from `session.customer_details?.email`, plan from `STRIPE_FOUNDER_PRICE_ID` match if set else `founder`, mints the key, sends the email, returns 200 always after signature passes. `GET /api/health` → `{ ok: true, db: boolean }`.
- C: `GET|POST /api/projects`, `GET|PATCH|DELETE /api/projects/[id]`, `GET|POST /api/projects/[id]/prompts`, `DELETE /api/projects/[id]/prompts/[promptId]` (archive), `POST /api/projects/[id]/suggest` (fetchSiteText + suggestPrompts, returns `{ prompts: string[] }`, does not save), `GET|POST /api/projects/[id]/runs` (POST starts `executeRun(..., "manual")` with `export const maxDuration = 300` and returns the finished run), `GET /api/projects/[id]/runs/[runId]` (run + results), `GET /api/projects/[id]/dashboard`, `GET /api/settings/keys` (hints only), `PUT /api/settings/keys` body `{ engine, apiKey }`, `DELETE /api/settings/keys` body `{ engine }`. Every route: `requireLicense()` first; `UnauthorizedError` → 401 JSON; unknown project → 404; zod-validate bodies.
- D: `GET /api/cron/daily` verifies `Authorization: Bearer ${CRON_SECRET}` (401 otherwise), `listProjectsForDailyRun()`, runs them with `executeRun(..., "cron")` sequentially with a 240 s budget, returns `{ started, finished, skipped }`, `export const maxDuration = 300`. `vercel.json` cron `0 11 * * *` (06:00 EDT, 07:00 EST) on `/api/cron/daily`.

Pages:
- C: `/activate` (paste key; `?k=` pre-fills; POST to the activate route; on success redirect `/app`), `/app` (projects list + create form; redirect to `/activate` when no license), `/app/settings` (three key fields with hints, save per engine, remove), `/app/projects/[id]` (dashboard: headline rates per engine for the latest run, trend, prompt table, competitor leaderboard, prompt management with suggest-10, Run now button with progress state), `/app/projects/[id]/runs/[runId]` (raw answers and sources per prompt per engine).
- D: `/` landing (headline, what it measures, three engines, BYOK explanation, founder lifetime price from `product.ts`, Buy button to `STRIPE_PAYMENT_LINK_URL` or a "Founder keys open soon" state when unset, FAQ, footer with EVOIX disclosure), `/thanks` (after checkout: "check your email for the key").

## Design (from evoix-website DESIGN.md, light paper system)

White paper, ink type. Display and headings Source Serif 4 weight 500 tight tracking; body Schibsted Grotesk 17px line-height 1.6; code and data Geist Mono. Colors: paper #ffffff, warm paper #f5f4f0, ink #111110, ink-70 #4a4946, ink-50 #6f6d68, hairline rgba(17,17,16,0.10), strong hairline rgba(17,17,16,0.32), blue #2856ff for link hover and focus rings only. Hairlines, not cards: lists, tables and columns separated by 1px rules. No kickers above headings, no gradients, no glow, no dark sections except an optional proof bezel (#111110, rounded 18px) holding a real screenshot. Buttons are 44px pills: primary ink on paper, secondary paper with a strong hairline. Tables: strong hairline head, hairline rows, labels 13px uppercase 6% tracking in ink-50. Works at 390px width with a 16px gutter and no horizontal scroll. No em dashes and no rhetorical colons in any copy.

## Environment variables (exact Vercel list, also in `env.example` and README)

Required: `DATABASE_URL`, `KEY_ENCRYPTION_SECRET` (64 hex chars), `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` (default `In the Sources <noreply@evoix.io>`), `NEXT_PUBLIC_BASE_URL`.
Optional: `STRIPE_WEBHOOK_SECRET` (required once the Payment Link exists), `STRIPE_PAYMENT_LINK_URL`, `STRIPE_FOUNDER_PRICE_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `ENGINE_OPENAI_MODEL`, `ENGINE_ANTHROPIC_MODEL`, `ENGINE_GEMINI_MODEL`, `SEED_EMAIL` (seed script).
Never: provider API keys (the user supplies them in Settings). Nobody reads `.env*` files; the app loads them.

## Tests (`npm test` = `vitest run`)

- Engines: one fixture test per engine using a response object shaped exactly like the SDK types (cite the `.d.ts` line in a comment), asserting `sources`, `searchResults` and text extraction; `analyzeAnswer` cases (mentioned with alias, numbered position, cited via subdomain, competitor domain cited, "I couldn't find" near the brand); Gemini redirect resolver with a mocked fetch.
- Data: PGlite (`@electric-sql/pglite`) in memory, `schema.sql` applied, every db function exercised, and two isolation tests: license A cannot read, update, delete or run license B's project or prompts (null/false/404 semantics), and `getDashboard` math on a seeded run.
- Crypto: round trip, tamper detection, key hash stability. License: activate route sets an httpOnly cookie, bad key 401, cookie options. Stripe: `generateTestHeaderString` signed event is accepted, a bad signature is rejected, a replayed session id does not mint a second key.

## Scripts

`npm run migrate` applies `db/schema.sql` (idempotent). `npm run seed` creates a `dev` license for `SEED_EMAIL` (default stephane@evoix.io) and prints the key once. Both load env through `@next/env` `loadEnvConfig(process.cwd())` so `.env.local` works without naming it on the command line.

## Server-only guard

Server modules (db, crypto, license, engines, runs, email, stripe) must never reach a client bundle. They do not import the `server-only` npm package: that package throws at import time unless the bundler resolves the `react-server` export condition, which `tsx` (scripts/migrate.ts, scripts/seed.ts) and vitest do not, so every script and data test would fail. Instead each server module starts with

```ts
import "@/lib/server-only";   // or the relative form, "../server-only"
```

`src/lib/server-only.ts` throws `"server module imported in the browser"` when `window` is defined and is a no-op everywhere else. Phase 1 wrote that line into every stub; builders keep it as the first import of every server module they add.

## Phase 1 notes (2026-10-01, additive)

- `Queryable` (`src/lib/db/client.ts`) gained an optional `exec?(text: string): Promise<unknown>` for multi-statement scripts. `applySchema` uses `exec` when present and falls back to a param-less `query` (pg runs that through the simple protocol, which accepts several statements). A raw PGlite instance satisfies the interface as-is, so tests can pass one straight to `setDbForTests`.
- `client.ts` also exports `closeDb()` (scripts call it before exiting), `readSchemaSql()` and `PGLITE_DATA_DIR`. The local fallback database lives in `.pglite-data` (git-ignored) and the instance is cached on `globalThis` so dev HMR never opens two handles on the same folder.
- `src/lib/db/index.ts` re-exports `getDb`, `setDbForTests`, `applySchema`, `closeDb` and the `Queryable` type.
- The example env file is `env.example` (no leading dot): the local credential guard blocks every `.env*` path for Claude sessions, so the dotted name could not be written. README says the same.
- `@types/node` moved from `^20` to `^24` to satisfy vitest 5's peer range and match the Node 24 runtime.
- `src/lib/engines/models.ts` holds the model ids, `QUERY_TIMEOUT_MS`, `RUN_CONCURRENCY` and `SYSTEM_PROMPT`; `src/lib/engines/index.ts` re-exports them.
- Verified 2026-10-01: `tsx` resolves the `@/` tsconfig alias (`npx tsx --eval 'import("@/lib/product")'` works), so modules imported by the scripts may use `@/` imports. PGlite's `query` rejects a multi-statement string ("cannot insert multiple commands into a prepared statement"); `exec` accepts it, hence the optional `exec` above.
