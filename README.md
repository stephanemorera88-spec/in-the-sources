# In the Sources

Bring-your-own-key AI visibility tracker, sold as a lifetime deal by EVOIX LLC. It tells you whether ChatGPT, Claude and Gemini mention your brand and cite your site when they answer the questions your customers ask.

How it works. A buyer pays once through a Stripe Payment Link, a webhook mints a license key, Resend emails it (the activation link carries the key in the URL fragment, `/activate#k=...`, so it never reaches a server log or an analytics script), and the key goes in an httpOnly cookie. In the app the user pastes their own OpenAI, Anthropic and Gemini API keys (encrypted at rest, never sent back to the browser), creates a project (brand, domain, aliases, competitor domains), adds prompts (typed, or ten suggested from the site text), and runs every prompt on every engine that has a key, with web search on. Per answer the app stores whether the brand was mentioned, its position in a numbered list, whether the brand's domain is in the cited sources, the full source list, the search results the engine saw, and the raw text. The dashboard leads with the source-set inclusion rate and the mention rate per engine, a trend across runs, a per-prompt table and a competitor domain leaderboard. A Vercel cron runs every project daily.

Maintained by Stephane Morera, EVOIX LLC. Source code is released under the GNU Affero General Public License v3.0 (`AGPL-3.0-only`, see `LICENSE`).

The full contract (types, schema, routes, ownership, design) is in `SPEC.md`; its last section records the integration decisions made when the four modules were merged.

## Local setup

```bash
npm install
npm run dev
```

With no `DATABASE_URL` set, `npm run dev` uses a local PGlite database stored in `.pglite-data` (git-ignored) and applies `db/schema.sql` on first use. A one-line warning in the terminal says the fallback is active. In production a missing `DATABASE_URL` is an error.

```bash
npm run migrate   # applies db/schema.sql (idempotent) to DATABASE_URL, or to the PGlite fallback
npm run seed      # creates a dev license for SEED_EMAIL (default stephane@evoix.io) and prints the key once
```

Both scripts load env files through `@next/env`, so the usual local env file (dot env dot local) works without naming it on the command line. Copy `env.example` to that file to start. The example file is named `env.example`, without the leading dot, so a local tooling guard that blocks every dotted env path leaves it readable and committable; the usual local env file name still works at run time.

Paste the printed key at `/activate` to open the app, then add your engine API keys in `/app/settings`. Saving a key needs `KEY_ENCRYPTION_SECRET` in the server's environment; without it the settings route answers 500 and the server log says why.

One process at a time on `.pglite-data`. The seed script and the dev server each open the folder; run the seed before the server's first database request (the landing page makes none) or with the server stopped.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server (Turbopack). |
| `npm run build` | Production build. Every app and API route is dynamic; `/`, `/thanks`, `/robots.txt` and `/sitemap.xml` are static. |
| `npm start` | Serves the production build. Build and start back to back; a rebuild under a running `next start` breaks the served CSS chunk. |
| `npm run lint` | ESLint over the tree. |
| `npm run typecheck` | `tsc --noEmit` over the tree. If it reports duplicate identifiers in `.next/types`, delete `.next` and build again; stray `* 2.ts` copies of the generated files showed up once during integration (cause not established) and a clean build removed them. |
| `npm test` | `vitest run`: 31 files, 215 tests, in-memory PGlite, no network. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run migrate` | Applies `db/schema.sql`. |
| `npm run seed` | Mints a dev license and prints the key once. |

## Environment variables (Vercel)

Required:

| Variable | Where the value comes from |
|---|---|
| `DATABASE_URL` | Postgres connection string from your provider (Neon, Vercel Postgres, Supabase). `sslmode=verify-full` is enforced by the app. |
| `KEY_ENCRYPTION_SECRET` | 64 hex chars from `openssl rand -hex 32`. Encrypts users' engine keys at rest; losing it loses every stored key. |
| `CRON_SECRET` | Any long random string (`openssl rand -hex 32`). Vercel sends it as `Authorization: Bearer` on cron calls. |
| `RESEND_API_KEY` | Resend dashboard, API Keys. |
| `EMAIL_FROM` | Sender address on a domain verified in Resend. Default `In the Sources <noreply@evoix.io>`. |
| `NEXT_PUBLIC_BASE_URL` | The deployment origin, no trailing slash (for example `https://inthesources.evoix.io`). Used in the license email, metadata, robots and sitemap. |

Optional:

| Variable | Where the value comes from |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard, Developers, Webhooks, after adding the endpoint `/api/stripe/webhook` for `checkout.session.completed`. Required once the Payment Link exists. |
| `STRIPE_PAYMENT_LINK_URL` | The Payment Link URL from Stripe (https only). Unset shows "Founder keys open this week" with a mailto on the landing page. The landing page is static, so changing this needs a redeploy. |
| `STRIPE_FOUNDER_PRICE_ID` | The `price_...` id of the founder product. When set and the session carries expanded line items, a matching checkout maps to the founder plan, otherwise standard; a plain webhook delivery has no line items, so it maps to founder. |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Events Manager, 5 to 32 digits. Unset or non-numeric renders no pixel. Rendered on the landing and thanks pages only, never on `/activate` or `/app`. Static pages, redeploy to apply. |
| `ENGINE_OPENAI_MODEL`, `ENGINE_ANTHROPIC_MODEL`, `ENGINE_GEMINI_MODEL` | Model id overrides. Defaults: `gpt-5-mini`, `claude-haiku-4-5`, `gemini-2.5-flash`. |
| `SEED_EMAIL` | Email the seed script creates a dev license for. Local only. |

Never set provider API keys (OpenAI, Anthropic, Gemini) in the environment. Users supply their own in Settings.

## API shape

Every route under `/api/projects` and `/api/settings` goes through `src/app/api/_lib/with-license.ts`, which reads the `its_license` cookie first. Error bodies are `{ error: "<plain sentence>" }` and the client components show the sentence as-is; the two fixed strings are `401 { error: "unauthorized" }` and `404 { error: "not found" }`. Creates answer 201 (`POST /api/projects`, `POST /api/projects/[id]/prompts`). `GET /api/health` answers `{ ok: true, db }` with status 200, or 503 when the database does not answer. A project holds at most 25 active prompts (`PRODUCT.maxPromptsPerProject`); archived prompts do not count.

## Deploy

From the repo root, with the Vercel CLI logged in:

```bash
vercel          # preview
vercel --prod   # production
```

Set the variables above in the Vercel project first. Run `npm run migrate` once against the production `DATABASE_URL` (locally, with that value in your env) before the first deploy, and again after any schema change; the schema is idempotent. The `pg` path has only been exercised through its SQL on PGlite (Postgres 17 under WASM); the first migrate and seed against a real `DATABASE_URL` are the confirmation.

## Cron

`vercel.json` schedules `GET /api/cron/daily` at `0 11 * * *` UTC (06:00 EDT, 07:00 EST). The route answers 500 when `CRON_SECRET` is unset, 401 without the right `Authorization: Bearer ${CRON_SECRET}`, closes runs left at `running` for more than 15 minutes by a killed function (`partial` when they hold an answered row, `failed` otherwise), then runs every active project with daily runs enabled, at least one engine key and at least one active prompt, sequentially inside a 240 second budget (`maxDuration` 300). Each run gets the end of that budget as its deadline. Calls that cannot start with at least 10 s left are written as errored rows ("Run budget exhausted before this call started.") and the run ends `partial`, so no run outlives the function. A manual run (`POST /api/projects/[id]/runs`) has the same 240 s deadline. The route returns `{ started, finished, skipped, swept, errors }`. A large project (25 prompts on three engines, 90 s per call) can still use the whole budget and leave the projects after it with little room on that day.

## Tests

```bash
npm test            # vitest run
npm run test:watch
npm run typecheck   # tsc --noEmit
```

Tests run in Node against an in-memory PGlite database with `db/schema.sql` applied; no external services are needed. Engine tests use fixtures shaped like the installed SDK types and a fake `fetch`.

## Smoke test (PGlite fallback, no env file)

This is the sequence run at integration on 2026-10-01 (63 assertions). Terminal 1 starts the server; terminal 2 seeds and drives it with curl. The key stays in a shell variable; do not write it to a file.

```bash
# terminal 1
KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32) CRON_SECRET=test NEXT_PUBLIC_BASE_URL=http://localhost:3111 npx next dev -p 3111

# terminal 2, before the server's first database request
B=http://localhost:3111
KEY=$(KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32) CRON_SECRET=test NEXT_PUBLIC_BASE_URL=$B npm run seed 2>&1 | awk '/License key/ {print $NF}')
curl -s $B/api/health                                                    # {"ok":true,"db":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{"key":"its_wrong"}' $B/api/license/activate   # 401
curl -s -c jar -D - -o /dev/null -X POST -H 'content-type: application/json' -d "{\"key\":\"$KEY\"}" $B/api/license/activate | grep -i httponly
PID=$(curl -s -b jar -X POST -H 'content-type: application/json' -d '{"brandName":"EVOIX","domain":"evoix.io","aliases":["EVOIX.io"],"competitorDomains":["fivesixten.com","minuttia.com"]}' $B/api/projects | python3 -c 'import sys,json; print(json.load(sys.stdin)["project"]["id"])')
curl -s -b jar -X POST -H 'content-type: application/json' -d '{"texts":["What is EVOIX.io?","Best answer engine optimization tools for a small business"]}' $B/api/projects/$PID/prompts
curl -s -b jar $B/api/projects/$PID/dashboard                            # latestRun null
curl -s -b jar -X PUT -H 'content-type: application/json' -d '{"engine":"openai","apiKey":"sk-test-not-real-1234567890"}' $B/api/settings/keys   # hint 7890
curl -s -b jar -X POST $B/api/projects/$PID/runs                         # status "failed", every result carries a redacted error
curl -s -o /dev/null -w '%{http_code}\n' $B/api/cron/daily               # 401
curl -s -H 'authorization: Bearer test' $B/api/cron/daily               # {"started":...,"finished":...,"skipped":...,"errors":[...]}
curl -s -b jar $B/app/projects/$PID | grep -c '<h1[^>]*>EVOIX</h1>'      # 1
rm jar
```

A second seed (`SEED_EMAIL=second@example.com npm run seed`) activated in its own jar gets 404 on the first license's project, dashboard and delete, and an empty project list.

## Server-only guard

Server modules (db, crypto, license, engines, runs, email, stripe) start with `import "@/lib/server-only"` instead of the `server-only` npm package, which is not a dependency. The package throws under `tsx` and vitest because they do not resolve the `react-server` export condition; the local guard throws only when evaluated in a browser, which is the case that matters.

## License

In the Sources is free software under the GNU Affero General Public License, version 3 (`AGPL-3.0-only`). The full text is in `LICENSE`. If you run a modified version as a network service, the AGPL requires you to offer its source to the users of that service. Maintainer: Stephane Morera, EVOIX LLC (stephane@evoix.io).
