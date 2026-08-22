# MoneyLab — 09 · Backend Platform Architecture

> **Status:** Active (Aug 2026). Defines the **production backend** shared by the Next.js web app and any future **native mobile clients**. Product UX lives in `08-PRODUCT-ARCHITECTURE-V2.md`; API shapes in `03-API-SPEC.md`; cross-cutting rules in `01-ARCHITECTURE.md`.

---

## 1. Platform intent

MoneyLab is not an MVP spike — it is a **production web app** on a path to **many users** and a **shared backend** for mobile.

| Principle | Decision |
|-----------|----------|
| **One API, many clients** | All clients talk to `/api/v1/*` over HTTPS JSON |
| **Logic in services** | Route handlers ≤ 30 lines; business rules in `src/server/services/*` |
| **Postgres is source of truth** for user state | Reviews, jars, challenges, auth, profiles |
| **Git is source of truth** for editorial content | Articles JSON, food spot seed data — synced to DB on deploy/seed |
| **Vietnamese only** | `locale = vi` everywhere; no EN fallback in product |
| **Legacy LMS frozen** | Schema kept; routes redirect; not seeded in production |

---

## 2. Client architecture (web today, mobile later)

```mermaid
flowchart LR
  subgraph clients [Clients]
    WEB[Next.js Web]
    MOB[Future iOS/Android]
  end

  subgraph api [MoneyLab API]
    V1["/api/v1/*"]
    SESS["/api/session/*"]
  end

  subgraph data [Data]
    PG[(PostgreSQL)]
    STATIC[Static content JSON]
  end

  WEB --> SESS
  WEB --> V1
  MOB --> V1
  V1 --> PG
  STATIC --> PG
```

### 2.1 Web (current)

| Concern | Mechanism |
|---------|-----------|
| Auth | `POST /api/session/login` → **httpOnly cookies** (`ml_access`, `ml_refresh`) |
| API calls | Browser sends cookies automatically; client in `src/lib/api.ts` |
| Refresh | `POST /api/session/refresh` on 401, replay once |
| CSRF | `SameSite=Lax` cookies + `Origin` check on mutating requests |

### 2.2 Mobile (future — already supported at HTTP layer)

| Concern | Mechanism |
|---------|-----------|
| Auth | `POST /api/v1/auth/login` or `/auth/google` → **`accessToken` + `refreshToken` in JSON body** |
| API calls | `Authorization: Bearer <accessToken>` on every request |
| Refresh | `POST /api/v1/auth/refresh` with `{ refreshToken }` in body |
| No cookies | Mobile never uses `/api/session/*` |

**Implementation note:** `src/server/http.ts` already accepts **Bearer OR cookie** for access tokens. Mobile work is mostly **client SDK + app store auth**, not a new backend.

### 2.3 Shared contract rules (all clients)

- Base URL: `https://moneylab.vn/api/v1` (prod) / `http://localhost:3000/api/v1` (dev)
- Envelope: `{ data, meta? }` success; `{ error: { code, message, details?, requestId } }` failure
- Money: **string integers** in đồng (`"35000"`), never JS `number` for VND
- IDs: UUIDv7 strings
- Pagination: cursor-based (`?cursor=&limit=`), not offset
- Versioning: path prefix `/api/v1`; breaking changes → `/api/v2` (never silent breaks)

---

## 3. Active API surface (v2 product)

These endpoints are **supported for production** web and mobile.

### 3.1 Public (no login)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/food/spots?swLat&swLng&neLat&neLng` | Map pins in viewport |
| GET | `/food/spots/{idOrSlug}` | Spot detail + reviews |
| GET | `/food/clusters` | City list (Sài Gòn, Hà Nội) |
| GET | `/library/articles` | Psychology articles |
| GET | `/library/articles/{idOrSlug}` | Article body |
| GET | `/challenges` | Challenge definitions |
| GET | `/meta/provinces`, `/meta/avatars` | Profile pickers |
| GET | `/health` | Liveness |
| POST | `/auth/signup`, `/auth/login`, `/auth/google`, `/auth/refresh` | Mobile auth |
| POST | `/tools/*` | Calculators (stateless) |

### 3.2 Authenticated learner

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me`, `/me/bootstrap` | Profile + stats + flags |
| PATCH | `/me` | Display name, province, avatar |
| GET/PUT | `/me/spending-jars` | Monthly jar plan |
| GET | `/challenges/mine` | Active/completed challenges |
| POST | `/challenges/{slug}/start` | Join challenge |
| POST | `/challenges/participations/{id}/tick` | Daily tick |
| POST | `/food/spots/{id}/reviews` | Community review |
| POST | `/events` | Analytics (optional) |

### 3.3 Admin

| Prefix | Purpose |
|--------|---------|
| `/admin/users`, `/admin/flags`, `/admin/audit-log` | Ops |
| `/admin/food/*` (future) | Spot moderation, UGC queue |

### 3.4 Frozen (redirect in UI, do not build new features on)

`/catalog/*`, `/lessons/*`, `/quizzes/*`, `/sims/*`, `/tutor/*`, `/shop/*`, `/leaderboards/*`, `/me/quests/*`, `/me/enrollments`, `/me/certificates`

Routes remain for backwards compatibility and admin; **feature flags default off**.

---

## 4. Database architecture

### 4.1 Provider & connection

| Environment | Database | Connection |
|-------------|----------|------------|
| Local dev | Postgres via `pnpm db:local` (port 5544) | Direct |
| Production | **Neon** (Singapore region) | **`DATABASE_URL`** = pooled (PgBouncer, `-pooler` host) |
| Migrations | CI + deploy | **`DIRECT_URL`** = direct (non-pooled) for `prisma migrate` |

```env
# .env.example pattern for Neon
DATABASE_URL=postgres://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/moneylab?sslmode=require
DIRECT_URL=postgres://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/moneylab?sslmode=require
```

**Why pooler:** Serverless (Vercel) opens many short-lived connections; Neon pooler prevents connection exhaustion at scale.

### 4.2 Schema domains

The Prisma schema (`prisma/schema.prisma`) contains **three domains**. Do not add v2 features to legacy tables.

#### Domain A — Platform core (always active)

```
User, OauthAccount, RefreshToken, EmailToken
UserStats, FeatureFlag, Event, AuditLog, RateLimit, IdempotencyKey
```

#### Domain B — v2 product (active)

```
FoodCluster, FoodClusterTranslation
FoodSpot, FoodReview
SpendingJarPlan
SavingsChallenge, SavingsChallengeTranslation, UserChallenge
Article, ArticleTranslation
Badge, BadgeTranslation, UserBadge  (light gamification for challenges)
```

#### Domain C — Legacy LMS (frozen)

```
Track, Course, Lesson, Quiz, Question, Sim*, Tutor*, Shop*, Leaderboard*,
Enrollment, LessonProgress, QuizAttempt, Certificate, DailyQuest, …
```

**Retirement plan:** when traffic is zero for 6+ months, drop Domain C tables in a dedicated migration. Until then: **no new code**, flags off, **not seeded in prod**.

### 4.3 Entity relationships (v2)

```
User ─┬─ FoodReview ── FoodSpot ── FoodCluster (city: Sài Gòn | Hà Nội)
      ├─ SpendingJarPlan (1:1)
      ├─ UserChallenge ── SavingsChallenge
      └─ UserStats / UserBadge
```

### 4.4 Indexes (hot paths at scale)

| Table | Index | Query |
|-------|-------|-------|
| `food_spot` | `(lat, lng)` | Bbox map load |
| `food_review` | `(spot_id, created_at)` | Spot detail reviews |
| `user_challenge` | `(user_id, status)` | My challenges |
| `refresh_token` | `(user_id)`, `(token_hash)` | Session rotation |
| `event` | `(name, ts)` | Analytics rollups |

At **>10k spots** or **>100k reviews**: add PostGIS `GIST (location)` or partition reviews by month. Not needed for v1 launch (2 cities, ~50–500 spots).

### 4.5 Data ownership

| Data | Canonical source | Sync to DB |
|------|------------------|------------|
| Food spots (seed) | `prisma/food-spots-data.ts` | `pnpm db:seed` / deploy hook |
| Psychology articles | `content/vi/articles.json` | seed |
| Challenge defs | `prisma/seed-challenges.ts` | seed |
| User reviews | — | **DB only** (UGC) |
| Jar plans | — | **DB only** |
| Challenge ticks | — | **DB only** |

**Deploy pipeline recommendation:**

```bash
pnpm db:migrate deploy   # production migrations
pnpm db:seed             # idempotent v2 seed (no LMS unless SEED_LEGACY=true)
```

---

## 5. Scaling roadmap

### Phase 1 — Launch → ~10k MAU (current architecture)

- Single Neon project, pooled connections
- Vercel serverless Next.js, one region (sin1)
- Map: bbox query, client-side pin cache per session
- No Redis required; feature flags cached in-process (10s TTL)

### Phase 2 — ~10k–100k MAU

| Bottleneck | Mitigation |
|------------|------------|
| DB connections | Neon pooler + Prisma `connection_limit` |
| Map bbox reads | CDN-cache `GET /food/spots` with short `s-maxage` + `stale-while-revalidate` |
| Review writes | Rate limit per user; optional review dedupe `(spot_id, user_id)` unique |
| Bootstrap payload | Split `/me/bootstrap` → `/me` + lazy tabs |
| Auth refresh storm | Already bucketed (`session-refresh` 240/10min/IP) |

### Phase 3 — 100k+ MAU / mobile launch

| Change | When |
|--------|------|
| Read replica for map + library GETs | p95 DB latency > 100ms on reads |
| `@googlemaps/markerclusterer` | >100 visible pins per viewport |
| Background jobs (Vercel Cron / queue) | Leaderboards, digest emails, moderation |
| Separate **upload service** for spot photos | UGC photos (R2/Blob) |
| Consider **extract API** to standalone Node service | Only if Next.js cold starts hurt mobile p99 — services already portable |

**Mobile does not require a separate backend** — same `/api/v1`, Bearer auth, identical DTOs in `src/lib/types.ts` (mirror to Swift/Kotlin models).

---

## 6. Security & compliance (production)

| Topic | Implementation |
|-------|----------------|
| Passwords | argon2id |
| Tokens | JWT access (short) + rotating refresh family |
| Rate limits | Per-IP + per-email on auth; per-user on writes |
| Admin | `role = ADMIN` RBAC on `/admin/*` |
| PII | Email optional (Google); no location stored server-side for map |
| Minors | `birthYear` optional; no investment advice in tutor (disabled) |
| Secrets | `AUTH_SECRET`, `CRON_SECRET`, API keys in Vercel env only |

---

## 7. Seed & environments

| Command | What it loads |
|---------|---------------|
| `pnpm db:seed` | **v2 only:** users, flags, map, challenges, articles, challenge badges |
| `SEED_LEGACY=true pnpm db:seed` | Above + LMS courses, sims, shop, full badge set |

**Production:** never set `SEED_LEGACY=true`. Staging may use it for regression tests.

Default demo accounts (override via env):

- Admin: `admin@moneylab.local` / `SEED_ADMIN_PASSWORD`
- Learner: `learner@moneylab.local` / `SEED_LEARNER_PASSWORD`

---

## 8. Feature flags (runtime toggles)

Seeded in v2; defaults in `src/server/lib/flags.ts`:

| Flag | v2 default | Notes |
|------|------------|-------|
| `map_reviews_enabled` | on | Community reviews |
| `spending_jars_enabled` | on | Chia ví |
| `savings_challenges_enabled` | on | Thử thách |
| `ai_tutor_enabled` | **off** | Legacy |
| `shop_enabled` | **off** | Legacy |
| `leaderboard_enabled` | **off** | Legacy |
| `sim_invest_enabled` | **off** | Legacy |

Toggle via `/admin/flags` without redeploy (10s cache delay).

---

## 9. Observability

| Signal | Tool |
|--------|------|
| Structured logs | pino → Vercel log drain |
| Request tracing | `X-Request-Id` on every response |
| Errors | `error.code` + `requestId` in client UI |
| Product analytics | `event` table + optional PostHog mirror |
| DB health | Neon dashboard + `/api/v1/health` |

---

## 10. Mobile SDK checklist (when building native apps)

- [ ] Implement auth: store `refreshToken` in Keychain/Keystore; access token in memory
- [ ] Map screen: same bbox API; Google Maps SDK native instead of JS API
- [ ] Share DTO types from OpenAPI or hand-port `src/lib/types.ts`
- [ ] Push notifications (future): device token table + FCM/APNs — **not in schema yet**
- [ ] Deep links: `moneylab://ban-do/spot/{id}` ↔ `/ban-do/spot/{id}`
- [ ] Offline: cache last bbox pins + jar plan locally; sync on reconnect

---

## 11. Document map

| Doc | Scope |
|-----|-------|
| `08-PRODUCT-ARCHITECTURE-V2.md` | Pillars, routes, map UX |
| **This file (`09`)** | Backend, DB, scaling, mobile contract |
| `01-ARCHITECTURE.md` | Stack, API envelope, auth details |
| `03-API-SPEC.md` | Full endpoint reference (incl. legacy) |
| `API-V2-ACTIVE.md` | Quick index of **supported v2 routes** |
| `02-DATA-MODEL.md` | Column-level schema reference |

When product and platform docs conflict on **priority**, `08` wins for UX; **`09` wins for backend and scale**.
