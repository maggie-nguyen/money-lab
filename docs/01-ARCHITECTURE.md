# MoneyLab - 01 · Architecture & Cross-Cutting Conventions

Everything in this file applies to **every** endpoint in `03-API-SPEC.md`. Do not repeat these
rules per-endpoint; do not deviate from them per-endpoint.

---

## 1. Stack (fixed choices - do not re-litigate)

| Layer | Choice | Why / notes |
|---|---|---|
| Language | TypeScript 5.x, `strict: true` | everywhere, including scripts |
| Runtime | Node.js 22 LTS | Vercel default |
| Web framework | Next.js 15 (App Router) | one repo serves UI + API |
| API style | REST/JSON under `/api/v1` | simplest for a mixed-skill team; no GraphQL |
| Validation | Zod v3 | every request body/query parsed with Zod **before** any logic |
| ORM | Prisma 5 | schema in `02-DATA-MODEL.md` |
| Database | PostgreSQL 16 (Neon or Supabase, region Singapore) | one DB, one schema |
| Auth | Auth.js (NextAuth v5) with Credentials + Google providers, **JWT strategy** | see §5 |
| Password hashing | `argon2id` (`@node-rs/argon2`), memory 19 MiB, iterations 2, parallelism 1 | never bcrypt-10-only, never plain |
| Money math | `decimal.js` internally, `bigint` at rest, `string` on the wire | doc 00 §4 |
| File storage | UploadThing (or Cloudflare R2 with presigned URLs) | images only in MVP |
| Email | Resend, sender `no-reply@moneylab.vn` | verification + password reset only |
| Cron | Vercel Cron hitting `/api/internal/cron/*` with `CRON_SECRET` header | §8 |
| Analytics | first-party events table + PostHog (optional mirror) | doc 02 §9 |
| Logging | pino to stdout | `LOG_LEVEL`; the platform's collector is the sink |
| Tests | Vitest (unit: services + engines), Playwright (a few smoke E2E) | engines require golden tests, doc 04 §8 |
| Lint | ESLint 9 flat config, `next/core-web-vitals` + `next/typescript` | `eslint.config.mjs`; formatting is held by `.editorconfig`, not a formatter run |
| CI | GitHub Actions: lint, typecheck, vitest, build | `.github/workflows/ci.yml`; the test job applies every migration to a fresh DB, which is the migration check |

**Portability rule:** route handlers must be ≤ ~30 lines: parse → call a service → map result to
HTTP. All logic lives in `src/server/services/*` and `src/server/engines/*`, which import nothing
from Next.js. This lets the team move to NestJS/Fastify later without rewriting logic.

## 2. Repository layout (monorepo, single Next app)

```
moneylab/
├─ docs/                        # these spec files
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                   # seeds roles, tracks, 1 course, badges, sim configs
├─ content/                     # authored content as JSON (doc 05), imported via admin API
│  └─ vi/track-money-basics/...
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/           # landing, /about, /verify/[certCode]
│  │  ├─ (app)/                 # authed learner UI
│  │  ├─ (admin)/admin/         # CMS UI
│  │  └─ api/
│  │     ├─ v1/                 # public API - mirrors doc 03 section-by-section
│  │     │  ├─ auth/...
│  │     │  ├─ catalog/...
│  │     │  ├─ lessons/...
│  │     │  ├─ quizzes/...
│  │     │  ├─ me/...
│  │     │  ├─ gamification/...
│  │     │  ├─ sims/...
│  │     │  ├─ tools/...
│  │     │  ├─ tutor/...
│  │     │  ├─ feedback/...
│  │     │  ├─ events/...
│  │     │  ├─ certificates/...
│  │     │  └─ admin/...
│  │     └─ internal/cron/...
│  ├─ server/
│  │  ├─ services/              # authService, catalogService, progressService, gamificationService,
│  │  │                         # simService, tutorService, feedbackService, adminContentService…
│  │  ├─ engines/               # budget/, loans/, scam/, business/, invest/  (doc 04)
│  │  ├─ repos/                 # thin Prisma wrappers, one per aggregate
│  │  ├─ auth/                  # session helpers, RBAC guard
│  │  ├─ lib/                   # money.ts (roundVnd, bps math), time.ts (VN tz), ids.ts, http.ts
│  │  └─ schemas/               # Zod schemas shared by API + engines + content importer
│  ├─ components/               # UI (doc 06)
│  └─ tests/
└─ .env.example
```

## 3. API conventions (apply to ALL endpoints)

### 3.1 URLs & verbs
- Base path `/api/v1`. Plural nouns (`/courses`), kebab-case path segments, camelCase JSON keys.
- `GET` never mutates. Mutations: `POST` (create/action), `PATCH` (partial update), `DELETE`.
- Sub-actions use `POST /resource/{id}/verb` (e.g. `POST /sims/sessions/{id}/actions`). No RPC-ish
  query params like `?action=`.

### 3.2 IDs
- All primary keys are **UUIDv7** strings, generated server-side (`ids.ts`). Never expose serial ints.
- One human-facing short code exists: certificate code (10 chars, alphabet `A-Z2-9` minus
  `I,O,1,0`, prefixed `ML-`).
- Content also has stable **slugs** (`ngan-sach-va-tiet-kiem`) unique per content type; public
  catalog GETs accept `{idOrSlug}`.

### 3.3 Envelope
Success (2xx):
```json
{ "data": <payload>, "meta": { ...optional... } }
```
List endpoints (cursor pagination only, no offset):
```json
{ "data": [ ... ], "meta": { "nextCursor": "opaque-string-or-null", "total": 123 } }
```
- `?limit=` 1..100, default 20. `?cursor=` opaque (base64 of `id`+sort key). `total` may be omitted
  where counting is expensive (events); if omitted, key must be absent, not null-with-lies.

Error (4xx/5xx) - **single shape everywhere**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable English developer message",
    "details": [ { "path": "body.amountVnd", "message": "Expected string bigint" } ],
    "requestId": "req_01J..."
  }
}
```
`details` is present only for `VALIDATION_ERROR`. `requestId` is always present and matches the
`X-Request-Id` response header (generate per request, log it, return it to the client).

### 3.4 Canonical error codes (the complete list - do not invent others)

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod parse failed (body, query, params) |
| 400 | `INVALID_STATE` | Operation not allowed in current resource state (e.g. acting on a finished sim) |
| 401 | `UNAUTHENTICATED` | Missing/expired/invalid token |
| 403 | `FORBIDDEN` | Authenticated but not allowed (role or ownership) |
| 404 | `NOT_FOUND` | Resource doesn't exist **or** exists but caller may not know that |
| 409 | `CONFLICT` | Unique violation (email taken, already enrolled, already claimed) |
| 409 | `VERSION_CONFLICT` | Optimistic concurrency failure (sim actions, content edits) |
| 410 | `GONE` | Expired join code / reset token / cert revoked |
| 422 | `RULE_VIOLATION` | Valid shape, but business rule rejects (overspend beyond allowed debt, quiz already finalized) |
| 429 | `RATE_LIMITED` | See §7; include `Retry-After` header |
| 500 | `INTERNAL` | Unhandled; never leak stack traces |
| 501 | `NOT_IMPLEMENTED` | Reserved namespaces (doc 00 §5) |

### 3.5 Idempotency
- Any endpoint marked **[IDEMPOTENT-KEY]** in doc 03 accepts header `Idempotency-Key: <uuid>`
  (required for those endpoints). Server stores `(userId, key, endpoint, requestHash, responseBody)`
  in table `idempotency_key` for 24 h. Same key + same hash → replay stored response with header
  `Idempotent-Replay: true`. Same key + different hash → `409 CONFLICT`.
- This exists because learners on flaky mobile networks will retry lesson-complete / quiz-submit /
  sim-action posts.

### 3.6 Versioning & deprecation
- Breaking changes → `/api/v2/...` new routes; v1 kept ≥ 90 days with `Deprecation: true` header.
- Additive changes (new optional fields) are allowed in place; clients must ignore unknown fields.

### 3.7 Content negotiation & caching
- Requests/responses `application/json; charset=utf-8` only. Reject other bodies with 400.
- Public catalog/content GETs: `Cache-Control: public, max-age=300, stale-while-revalidate=86400`
  and strong `ETag` (hash of content version). Support `If-None-Match` → 304.
- Everything user-specific: `Cache-Control: private, no-store`.

## 4. Request lifecycle (implement once in `src/server/http.ts` as a wrapper)

```
withApi(handler, { auth: 'required' | 'optional' | 'none',
                   roles?: Role[],
                   rateLimit?: BucketName,
                   idempotent?: boolean })
```
Order inside the wrapper - exactly this order:
1. Generate `requestId`; attach logger.
2. CORS (same-origin app; allow only `APP_ORIGIN` env; preflight handled globally).
3. Rate limit check (§7) → 429.
4. AuthN: parse Bearer JWT (or session cookie for the web app) → `ctx.user | null` → 401 if required.
5. AuthZ: role check → 403. (Ownership checks stay inside services - they need the DB.)
6. Idempotency replay check.
7. Zod-parse params/query/body → 400 with `details`.
8. Call service. Services throw typed `AppError(code, message, httpStatus)`; wrapper maps to §3.4.
9. Serialize (bigint→string via a global replacer), store idempotency record, log
   `{requestId, userId, route, status, ms}`.

## 5. Authentication & sessions

### 5.1 Mechanisms
- **Web app (first-party):** Auth.js session as an HttpOnly, Secure, SameSite=Lax cookie carrying a
  JWT. Route handlers accept the cookie.
- **API (tooling, mobile later):** `Authorization: Bearer <accessToken>` from
  `POST /auth/login` - same JWT payload as the cookie.
- Access token TTL **15 min**; refresh token TTL **30 days**, rotating, stored **hashed (sha256)**
  in `refresh_token` table, one row per device; reuse of a rotated-out refresh token revokes the
  whole family (theft detection).

### 5.2 JWT claims (HS256, secret `AUTH_SECRET`, ≥64 random bytes)
```json
{
  "sub": "<userId uuid>",
  "role": "LEARNER|ADMIN",
  "iat": 0, "exp": 0, "jti": "<uuid>"
}
```
No emails/names in the token. Role changes take effect on next refresh (≤15 min lag accepted).

### 5.3 Signup rules
- Email + password (min 8 chars, no other composition rules; check against a top-100k breach list
  if convenient, else skip). Email verification is NOT required for learning (don't block kids on
  email) - it only gates password reset usefulness.
- Google OAuth: auto-links by verified email, else creates a user.
- We ask **birth year** only (1950..current). If age < 13 → still allowed (content is educational,
  no social features, minimal data), but marked `isMinor` and excluded from public leaderboards'
  display names (shown as anonymized handle).
- Google Sign-In sits above the password form on `/login` and `/signup`. The password form stays,
  because school-managed Google Workspace accounts are often blocked from third-party OAuth and
  under-13 Google accounts are restricted, so Google alone would lock real students out.

### 5.4 No anonymous accounts
Every learner holds a real account. There is no guest mode: it produced unreachable rows with no
email and no password, and the signed-out reader now has the article library (`/library`) instead,
which needs no account and costs no user row. Signed-out visitors can read the landing page and
every published article; everything else requires sign-in.

### 5.5 RBAC matrix (two roles only - enforced by `withApi` roles + service ownership checks)

| Capability | Signed out | LEARNER | ADMIN |
|---|---|---|---|
| Landing page, article library | ✅ | ✅ | ✅ |
| Learn, quiz, sims, tools, gamification, feedback, surveys | - | ✅ | ✅ |
| AI Tutor | - | ✅ | ✅ |
| Certificates | - | ✅ | ✅ |
| CMS create/edit/publish content, media | - | - | ✅ |
| User admin, flags, analytics dashboards, audit log | - | - | ✅ |

ADMIN is granted only via `PATCH /admin/users/{id}` by another ADMIN, or by seed. There are no
other roles; learners never interact with each other (leaderboards display anonymized public data
only, no profiles, no messaging).

## 6. Environment variables (complete `.env.example`)

```
DATABASE_URL=postgres://...
DIRECT_URL=postgres://...            # for prisma migrate on pooled providers
AUTH_SECRET=                          # 64+ random bytes, base64
APP_ORIGIN=https://moneylab.vn
GOOGLE_CLIENT_ID=                     # id_token flow, no client secret needed
NEXT_PUBLIC_GOOGLE_CLIENT_ID=         # same value, exposed so the button renders
GOOGLE_JWKS_URL=                      # override only for tests
RESEND_API_KEY=
CRON_SECRET=                          # random 32 bytes; cron requests send X-Cron-Secret
LOG_LEVEL=info                        # pino level: fatal|error|warn|info|debug|trace|silent
RATE_LIMIT_DISABLED=false             # true only in local dev
ANTHROPIC_API_KEY=                    # AI Tutor (server-side only)
ANTHROPIC_BASE_URL=                   # override only for tests
AI_TUTOR_MODEL=claude-haiku-4-5
AI_TUTOR_DAILY_MSG_LIMIT=50           # per user per VN day
SEED_ADMIN_EMAIL=                     # seed.ts creates this ADMIN
SEED_ADMIN_PASSWORD=
SEED_LEARNER_EMAIL=                   # seed.ts creates this LEARNER
SEED_LEARNER_PASSWORD=
```

`src/server/config.ts` is the authority: it parses this set at boot with zod and
crashes on anything missing or malformed. Nothing outside that schema is read,
so a variable that is not listed here does nothing.

Logs are one JSON line per event on stdout, written by pino from
`src/server/lib/logger.ts`. Unhandled 500s carry the request id, method, path
and user id, which is the same request id the client is shown, so a support
report leads straight to the line. There is no error-reporting SaaS wired in;
the platform's log collector is the sink.

## 7. Rate limiting (fixed-window, per bucket, stored in Postgres table `rate_limit` keyed
`(bucket, subjectKey, windowStart)`; subjectKey = userId if authed else IP)

| Bucket | Applies to | Limit |
|---|---|---|
| `auth` | login, signup, Google sign-in, forgot/reset | 10 / 10 min / IP |
| `write` | all other POST/PATCH/DELETE | 120 / min / user |
| `sim-action` | `POST /sims/sessions/{id}/actions` | 30 / min / user |
| `tutor` | `POST /tutor/threads/*/messages` | 10 / min / user + `AI_TUTOR_DAILY_MSG_LIMIT` / VN day / user |
| `events` | `POST /events` | 60 / min / user (batched anyway) |
| `read` | all GETs | 600 / min / user |

Return `429 RATE_LIMITED` + `Retry-After` seconds. A daily cron prunes old windows.

## 8. Optional maintenance jobs (`/api/internal/cron/{name}`, manual POST with `X-Cron-Secret`)

| Name | Schedule (VN time) | What it does |
|---|---|---|
| `daily-rollover` | 00:05 daily | Break streaks (users with no qualifying activity yesterday and no streak-freeze; consume freeze if owned), generate today's daily quests, expire idempotency keys, prune rate_limit |
| `weekly-leaderboard` | Mon 00:10 | Snapshot & close last week's leaderboard, write `leaderboard_result` rows, grant top-10 badges/coins |
| `analytics-rollup` | 01:00 daily | Fill `daily_stat` aggregate table from `event` (doc 02 §9) |
| `integrity-check` | 02:00 daily | Run data-invariant assertions, auto-abandon stale sims, alert on violations (doc 08 §4.2) |

Every cron writes a `cron_run(name, ranAt, ok, note)` row; `/health` reports `degraded` when
`daily-rollover` hasn't succeeded in 26 h (doc 08 §7).

Crons must be **idempotent** - safe to run twice.

## 9. Privacy & safety (users are minors)

1. Data minimization: no phone, no address, no full DOB, no school free-text. Province from enum.
2. `DELETE /me` performs true deletion (cascade) within 30 days; immediate anonymization of
   leaderboard rows (display name → "Tài khoản đã xóa").
3. `GET /me/export` returns the user's full data as JSON (GDPR-ish, also good pedagogy).
4. All sim money is fictional; every sim response includes `"disclaimer": "simulated"` in meta and
   the UI shows "Tiền mô phỏng - không phải lời khuyên đầu tư".
5. Scam-simulation content teaches **recognition only** - the content schema forbids step-by-step
   perpetration detail (reviewer checklist in doc 05 §7).
6. Logs never contain passwords, tokens, emails, or free-text feedback bodies.
7. AI Tutor: server-side system prompt pins scope to financial education; requests to the Claude
   API contain the lesson/sim context and the thread messages - never email, real name, or any
   profile field. Tutor answers always end with the fixed disclaimer string
   `"Đây là nội dung giáo dục, không phải lời khuyên tài chính cá nhân."` (appended server-side).
8. Admin endpoints require role ADMIN **and** are additionally IP-logged to `audit_log` (doc 02 §10)
   with before/after diffs for content and user mutations.

## 10. Observability

- Structured JSON logs (pino): `{ts, level, requestId, userId, route, status, ms, code}`.
- Every unhandled error logged at `error` with the requestId, method, path and userId.
- `GET /api/v1/health` → `{ data: { status: "ok"|"degraded", db: "ok", cron: "ok"|"stale", version: "<git sha>" } }`
  (no auth, no rate limit) - used by uptime monitor.
- **Boot-time config validation**: `src/server/config.ts` Zod-parses every env var at startup and
  crashes with a clear message on any missing/malformed value (doc 08 §2).
- Full production QA/ops requirements (environments, backups & restore drills, integrity cron,
  security checklist, release gates, monitoring thresholds, load targets) are in **doc 08** and
  are part of the definition of "done" for the system, not optional extras.

## 11. Definition of Done for any endpoint

1. Zod schemas for params/query/body in `src/server/schemas`, exported and reused by tests.
2. Service function with unit tests covering happy path + every listed error code.
3. Handler wired through `withApi` with correct auth/roles/rate-limit/idempotency flags from doc 03.
4. Appears in the generated OpenAPI file (`pnpm gen:openapi` builds `openapi.json` from the Zod
   registry via `zod-to-openapi`; CI fails if a route exists without a registered schema).
5. Seed data exists so the endpoint is manually testable right after `pnpm db:seed`.
