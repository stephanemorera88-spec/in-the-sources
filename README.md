# In the Sources

Bring-your-own-key AI visibility tracker, sold as a lifetime deal by EVOIX LLC. It tells you whether ChatGPT, Claude and Gemini mention your brand and cite your site when they answer the questions your customers ask.

How it works: a buyer pays once through a Stripe Payment Link, a webhook mints a license key, Resend emails it, and the key goes in an httpOnly cookie. In the app the user pastes their own OpenAI, Anthropic and Gemini API keys (encrypted at rest, never sent back to the browser), creates a project (brand, domain, aliases, competitor domains), adds prompts, and runs every prompt on every engine with web search on. Per answer the app stores whether the brand was mentioned, its position in a numbered list, whether the brand's domain is in the cited sources, the full source list, the search results the engine saw, and the raw text. The dashboard leads with the citation rate and the mention rate per engine, a trend across runs, a per-prompt table and a competitor domain leaderboard. A Vercel cron runs every project daily.

The full contract (types, schema, routes, ownership, design) is in `SPEC.md`.

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

Both scripts load env files through `@next/env`, so a local env file (`.env.local`) works without naming it on the command line. Copy `env.example` to `.env.local` to start. The example file is named `env.example`, without the leading dot, so the local credential guard that blocks every `.env*` path leaves it readable.

Paste the printed key at `/activate` to open the app, then add your engine API keys in `/app/settings`.

## Environment variables (Vercel)

Required:

| Variable | Where the value comes from |
|---|---|
| `DATABASE_URL` | Postgres connection string from your provider (Neon, Vercel Postgres, Supabase). `sslmode=verify-full` is enforced by the app. |
| `KEY_ENCRYPTION_SECRET` | 64 hex chars from `openssl rand -hex 32`. Encrypts users' engine keys at rest; losing it loses every stored key. |
| `CRON_SECRET` | Any long random string (`openssl rand -hex 32`). Vercel sends it as `Authorization: Bearer` on cron calls. |
| `RESEND_API_KEY` | Resend dashboard, API Keys. |
| `EMAIL_FROM` | Sender address on a domain verified in Resend. Default `In the Sources <noreply@evoix.io>`. |
| `NEXT_PUBLIC_BASE_URL` | The deployment origin, no trailing slash (for example `https://inthesources.evoix.io`). Used in the license email and in metadata. |

Optional:

| Variable | Where the value comes from |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard, Developers, Webhooks, after adding the endpoint `/api/stripe/webhook` for `checkout.session.completed`. Required once the Payment Link exists. |
| `STRIPE_PAYMENT_LINK_URL` | The Payment Link URL from Stripe. Unset shows "Founder keys open soon" on the landing page. |
| `STRIPE_FOUNDER_PRICE_ID` | The `price_...` id of the founder product. When set, a matching checkout maps to the founder plan. |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Events Manager. Unset renders no pixel. |
| `ENGINE_OPENAI_MODEL`, `ENGINE_ANTHROPIC_MODEL`, `ENGINE_GEMINI_MODEL` | Model id overrides. Defaults: `gpt-5-mini`, `claude-haiku-4-5`, `gemini-2.5-flash`. |
| `SEED_EMAIL` | Email the seed script creates a dev license for. Local only. |

Never set provider API keys (OpenAI, Anthropic, Gemini) in the environment. Users supply their own in Settings.

## Deploy

From the repo root, with the Vercel CLI logged in:

```bash
vercel          # preview
vercel --prod   # production
```

Set the variables above in the Vercel project first. Run `npm run migrate` once against the production `DATABASE_URL` (locally, with that value in your env) before the first deploy, and again after any schema change; the schema is idempotent.

## Cron

`vercel.json` schedules `GET /api/cron/daily` at `0 11 * * *` UTC (06:00 EDT, 07:00 EST). The route checks `Authorization: Bearer ${CRON_SECRET}`, which Vercel adds automatically when `CRON_SECRET` is set in the project. It runs every active project with daily runs enabled, at least one engine key and at least one active prompt, sequentially inside a 240 second budget (`maxDuration` 300).

## Tests

```bash
npm test            # vitest run
npm run test:watch
npm run typecheck   # tsc --noEmit
```

Tests run in Node against an in-memory PGlite database with `db/schema.sql` applied; no external services are needed.

## Server-only guard

Server modules (db, crypto, license, engines, runs, email, stripe) start with `import "@/lib/server-only"` instead of the `server-only` package. The package throws under `tsx` and vitest because they do not resolve the `react-server` export condition; the local guard throws only when evaluated in a browser, which is the case that matters.
