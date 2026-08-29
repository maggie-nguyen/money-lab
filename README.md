# Money&Me

Interactive financial literacy platform for Vietnamese high school students: short video-led
lessons, a library of standalone articles, six calculators, and five deterministic simulations
where a learner can make an expensive mistake without it costing anything.

Next.js 15 App Router, React 19, TypeScript strict, Prisma 6 on Postgres, Tailwind 4.
Two roles only, LEARNER and ADMIN.

## Running it locally

```bash
pnpm install
cp .env.example .env          # fill AUTH_SECRET at minimum
pnpm db:local                 # embedded Postgres on 5544, leave running
pnpm exec prisma migrate deploy
pnpm db:seed                  # admin + learner accounts, sims, badges, 2 courses, 6 articles
pnpm dev
```

The seed creates `admin@moneylab.local` / `admin12345` and `learner@moneylab.local` /
`learner12345`. Google sign-in stays hidden until `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set, so local
development and CI work without any Google credentials. When you do set it, the client id needs
`http://localhost:3000` (and the production origin) listed as an authorised JavaScript origin in the
Google Cloud console. No client secret is involved: sign-in uses the Identity Services id_token
flow, verified server side against Google's JWKS.

## The gate

Everything below must be green before a deploy.

| Command | What it covers |
|---|---|
| `pnpm lint` | eslint flat config on `next/core-web-vitals` and `next/typescript` |
| `pnpm typecheck` | types, strict, with `noUncheckedIndexedAccess` |
| `pnpm test` | unit, engine golden files and API integration tests against a throwaway Postgres on 5545 |
| `pnpm build` | production build |
| `pnpm content:verify` | every YouTube id in `content/` still exists and is embeddable |
| `pnpm content:links` | the CALCULATOR and SIM_LINK blocks actually land where they claim |
| `pnpm smoke` | a real Chrome walks every route signed in, fails on any console error, any 4xx/5xx, or a missing security header. Screenshots land in `docs/screenshots/` for review by eye |

`pnpm smoke` and `pnpm content:links` need a server already running (`pnpm build && pnpm start`).
`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` also run in CI on every push and pull
request (`.github/workflows/ci.yml`); the test harness starts its own Postgres, so CI needs no
database service.

## Deploying

Vercel hosts this project as a full-stack Next.js app: pages run on its frontend
infrastructure and every `src/app/api/**/route.ts` is deployed as a serverless
backend function. Neon hosts the Postgres database used by those functions.

The checked-in `vercel.json` sets the Build Command to `pnpm vercel-build`. It
generates the Prisma client, applies committed migrations, safely syncs
editorial articles, and then runs the production build. The article sync does
not touch users, reviews, map data, or other user-owned records. The same file
schedules the three daily maintenance jobs in UTC; Vercel supplies
`Authorization: Bearer <CRON_SECRET>` automatically.

Required production environment variables:

| Variable | Production value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (`-pooler` host) |
| `DIRECT_URL` | Neon direct connection string (the value Neon exposes as `DATABASE_URL_UNPOOLED`) |
| `AUTH_SECRET` | Random secret of at least 32 characters |
| `APP_ORIGIN` | Exact public origin, for example `https://example.com` |
| `CRON_SECRET` | Random secret of at least 8 characters |
| `RATE_LIMIT_DISABLED` | `false` |

Google sign-in additionally needs matching `GOOGLE_CLIENT_ID` and
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`. The map needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
and optionally `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Email verification needs
`RESEND_API_KEY`; without it, account creation works but verification email is
not delivered.

Two things the runtime assumes, both covered in
[docs/08-PRODUCTION-QA.md](docs/08-PRODUCTION-QA.md) §2:

- **Exactly one trusted proxy in front of the app.** The login rate limit buckets by IP and takes
  the rightmost `x-forwarded-for` hop, the one the proxy appended. A second proxy chained in front
  must overwrite that header rather than append to it, or the bucket becomes spoofable.
- **Logs are JSON on stdout** (pino, level from `LOG_LEVEL`), and the platform's collector is the
  sink. Unhandled 500s carry the same request id the client is shown, so a support report maps
  straight to a log line. `robots.txt`, `sitemap.xml` and the article canonicals are all built from
  `APP_ORIGIN`, so that value has to be the real public origin in production.

## Content

Courses are authored as JSON under `content/{locale}/{track}/{course}.json` and articles in
`content/{locale}/articles.json`, both git reviewed, both validated by the same Zod schemas the
admin CMS enforces. See [docs/05-CONTENT-SCHEMA.md](docs/05-CONTENT-SCHEMA.md) for the block
vocabulary. Import never publishes: it leaves everything DRAFT, and publishing is a separate audited
action.

## Specification set

1. [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) - scope, personas, glossary, hard rules (money/time/locale)
2. [docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) - stack, repo layout, API conventions, auth and JWT, rate limits, crons, privacy
3. [docs/02-DATA-MODEL.md](docs/02-DATA-MODEL.md) - every table, indexes, seed requirements
4. [docs/03-API-SPEC.md](docs/03-API-SPEC.md) - every endpoint: auth, catalog, library, progress, quizzes, gamification, sims, calculators, AI tutor, feedback, certificates, admin
5. [docs/04-SIMULATIONS-SPEC.md](docs/04-SIMULATIONS-SPEC.md) - the five sim engines with configs, turn rules, scoring, tests
6. [docs/05-CONTENT-SCHEMA.md](docs/05-CONTENT-SCHEMA.md) - lesson, article and quiz authoring JSON, curriculum skeleton, review checklist
7. [docs/06-FRONTEND-TEMPLATES.md](docs/06-FRONTEND-TEMPLATES.md) - the template survey behind the UI decision, superseded by doc 10
8. [docs/07-IMPLEMENTATION-PLAN.md](docs/07-IMPLEMENTATION-PLAN.md) - ordered tickets with definition of done and blocking QA gates
9. [docs/08-PRODUCTION-QA.md](docs/08-PRODUCTION-QA.md) - test matrix, environments, backups and restore drills, security checklist, release process, monitoring, load targets
10. [docs/10-FRONTEND-BUILD-BRIEF.md](docs/10-FRONTEND-BUILD-BRIEF.md) - the build brief the UI was implemented against

Decisions that are settled, and not to be re-opened without a spec change: two roles only, no
classrooms or teachers, no guest mode (Google or email and password, nothing else), VND carried as a
bigint string end to end, server-authoritative sims, REST under `/api/v1`.
