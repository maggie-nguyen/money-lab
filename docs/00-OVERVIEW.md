# MoneyLab - 00 · Product & Scope Overview

> **Read this first.** Every other document assumes the vocabulary, IDs and scope defined here.
> Docs index:
> - `00-OVERVIEW.md` - this file (scope, personas, glossary, MVP cut)
> - `01-ARCHITECTURE.md` - stack, deployment, repo layout, auth, cross-cutting API conventions
> - `02-DATA-MODEL.md` - full database schema (Prisma + SQL), every table, every index
> - `03-API-SPEC.md` - **every endpoint**, request/response/errors
> - `04-SIMULATIONS-SPEC.md` - deterministic rules for each game/simulation engine
> - `05-CONTENT-SCHEMA.md` - lesson/quiz authoring JSON format + i18n
> - `06-FRONTEND-TEMPLATES.md` - existing UI templates to reuse, mapped screen-by-screen
> - `07-IMPLEMENTATION-PLAN.md` - ordered tickets with acceptance criteria

---

## 1. One-paragraph product definition

MoneyLab is a Vietnamese-first (vi-VN primary, en fallback) web platform where high-school and
early-university students learn personal finance through **short lessons** (5–8 min), **immediate
practice** (quiz + interactive checks), and **server-authoritative simulations** (budgeting a month
of income, comparing loans, spotting scams, running a micro-business, managing a fake investment
portfolio). Progress is gamified (XP, levels, streaks, badges, leaderboards). An **AI Tutor**
answers questions about the current lesson or simulation. The team can run **user research**
in-product (surveys, NPS, event analytics) because iterative improvement is an explicit project goal.

## 2. Personas (drive every authorization rule)

**Only two roles exist.** Learners interact with the program, the simulations, and the AI tutor -
never with each other and never with a human staff role in-product.

| # | Persona | Role code | Notes |
|---|---------|-----------|-------|
| P1 | Học sinh THPT, 15–18 | `LEARNER` | Phone-first, low bandwidth, may not have a bank account or email. Must be able to read the article library with **zero signup**; learning requires an account. |
| P2 | Sinh viên / người đi làm sớm, 18–24 | `LEARNER` | Has a bank app, uses MoMo/ZaloPay, may have a first salary. |
| P3 | Team member / mentor | `ADMIN` | Full access: content CMS (create + publish), user management, feature flags, analytics. The team is small; no author/reviewer/teacher split. |

Role is a single `role` enum on the user row. See `02-DATA-MODEL.md §3`.

## 3. Glossary - use these exact words in code, DB and API

| Term | Meaning | Never call it |
|---|---|---|
| **Track** | Top-level learning path, e.g. "Tiền của tôi" (My Money). Contains Courses. | Path, Category |
| **Course** | ~5–12 Lessons on one topic, e.g. "Ngân sách và tiết kiệm". | Class, Unit |
| **Module** | Optional grouping of Lessons inside a Course (a "chapter"). | Section, Chapter |
| **Lesson** | Atomic learning unit, 5–8 min. Has ordered **Blocks**. | Page, Article |
| **Block** | One renderable piece inside a Lesson (text, image, callout, embedded check, sim launcher). | Component, Widget |
| **Quiz** | Ordered set of Questions attached to a Lesson or a Course (final). | Test, Exam |
| **Attempt** | One user's run at a Quiz. Server-scored. | Submission |
| **Simulation** | A stateful, server-authoritative interactive experience (5 engines, see doc 04). | Game (in code), Activity |
| **SimSession** | One user's playthrough of one Simulation. | Save, Run |
| **Action** | A single user decision submitted into a SimSession. | Move, Event |
| **Tick / Turn** | One advance of simulated time inside a SimSession (usually 1 month). | Round |
| **XP** | Non-spendable score. Drives Level. | Points |
| **Coin** (`xu`) | Spendable soft currency for the cosmetic shop and streak freezes. | Gold, Credits |
| **Streak** | Consecutive days with ≥1 qualifying activity, in `Asia/Ho_Chi_Minh`. | Chain |
| **Tutor** | The in-product AI assistant a learner can chat with about a lesson or sim. | Chatbot, Agent (in code) |
| **TutorThread** | One conversation between a learner and the Tutor, anchored to a context (lesson/sim/general). | Chat, Session |

## 4. Money, time, locale - HARD RULES

These cause the most bugs. They are non-negotiable.

1. **Currency is VND only in MVP.** VND has **no subunit**. Store every amount as a **signed 64-bit
   integer number of đồng** (`BIGINT` in Postgres, `bigint`/`string` at the JSON boundary).
   *Never* use float/double/`number` for money in JSON - serialize `bigint` as a **JSON string**
   (`"amountVnd": "12500000"`). All API money fields end in `Vnd` and are typed `string`.
2. **Percentages/rates** are stored as integer **basis points** (`bps`, 1 bps = 0.01%). 7.5% p.a. →
   `750`. Field names end in `Bps`.
3. **Rounding**: every money computation rounds **half-up to the nearest đồng** at the end of each
   step, never mid-formula. Provide one helper `roundVnd(x: Decimal): bigint` and use it everywhere.
4. **Timezone**: all business-day logic (streaks, daily quests, leaderboard resets) uses
   `Asia/Ho_Chi_Minh` (UTC+7, no DST). Store all timestamps in Postgres as
   `TIMESTAMPTZ` in UTC; convert at the edges only.
5. **Dates in JSON** are ISO-8601 UTC with `Z` (`2026-08-14T03:00:00.000Z`). Calendar-only fields
   (`dueDate`, `streakDate`) are `YYYY-MM-DD` **in Asia/Ho_Chi_Minh**.
6. **Locale**: content is authored per-locale. Supported: `vi` (default), `en`. Every content read
   endpoint accepts `?locale=` and falls back `vi → en → any`, and returns the resolved locale.
7. **Number formatting is a frontend concern.** The API never returns pre-formatted strings like
   `"12.500.000 ₫"`.

## 5. MVP scope (v1.0) vs later

**In v1.0 (build this):**
- Email/password + Google Sign-In
- Catalog: Tracks → Courses → Modules → Lessons → Blocks
- Lesson progress, quiz attempts with server scoring
- Gamification: XP, level, streak, coins, badges, weekly leaderboard
- 5 simulation engines (doc 04), all server-authoritative
- 6 stateless calculators (`/tools/*`)
- AI Tutor: lesson-aware chat + sim hints (Claude API, behind feature flag `ai_tutor_enabled`)
- Feedback, surveys, NPS, event analytics ingest
- Admin CMS API (content CRUD, direct publish by ADMIN, JSON import/export)
- Certificates with public verification page

**Explicitly NOT in v1.0 (do not build):**
- Real money, real bank/broker integrations, KYC
- Payments/subscriptions (the product is free)
- Native mobile apps (PWA only)
- Teacher accounts, classrooms, assignments, or any human-to-human interaction (chat, comments, user-generated public content)
- Multi-step content approval workflow (draft → published only; the mentor reviews outside the tool or as ADMIN)
- SSO with school systems (SAML), SCORM/xAPI export

**Reserved namespaces** (return `501 NOT_IMPLEMENTED`, documented so nobody re-designs URLs later):
`/api/v1/billing/*`, `/api/v1/parents/*`, `/api/v1/classrooms/*`.

## 6. Non-functional requirements

| Area | Target |
|---|---|
| p95 latency, read endpoints | < 300 ms from Singapore region |
| p95 latency, sim action endpoints | < 500 ms |
| Availability | 99% (best-effort student project; single region `ap-southeast-1` acceptable) |
| Payload | Any list endpoint ≤ 200 KB per page; default page size 20, max 100 |
| Offline | Lesson content cacheable (`Cache-Control: public, max-age=300, stale-while-revalidate=86400`); progress writes queue client-side and replay with idempotency keys |
| Bandwidth | Lesson media ≤ 300 KB per image (WebP/AVIF), no autoplay video in MVP |
| A11y | WCAG 2.1 AA; all sim states must be reachable/announceable without drag-and-drop |
| Privacy | Users may be minors (<16). Collect **no** phone number, no address, no school name free-text in v1. Only: email, display name, birth **year** (not full DOB), province (from a fixed list). See `01-ARCHITECTURE.md §9`. |
| Data retention | Deleted accounts and their data purged on request; see `01-ARCHITECTURE.md §9` |

## 7. Success metrics the backend must be able to report

These drive the analytics tables in `02-DATA-MODEL.md §9` and the admin endpoints in
`03-API-SPEC.md §14`.

1. **Activation**: % of new users who complete ≥1 lesson within 24h.
2. **Lesson completion rate** per lesson (started → completed), to find bad content.
3. **Quiz first-attempt accuracy** per question, to find confusing or wrong questions.
4. **Sim engagement**: sessions started, % finished, median turns played.
5. **D1/D7/D30 retention** by cohort week.
6. **Drop-off block**: last block index viewed on abandoned lessons.
7. **NPS** and free-text feedback tagged by screen.

---

## 8. High-level system diagram

```
                    ┌───────────────────────────────────────────────┐
   Browser / PWA    │  Next.js 15 App Router (React Server Comps)   │
   (vi-VN)          │ - marketing, catalog, lesson player          │
                    │ - sim UIs (client comps, no game logic)      │
                    │ - admin CMS                                  │
                    └───────────────┬───────────────────────────────┘
                                    │ fetch /api/v1/* (JSON, Bearer JWT)
                    ┌───────────────▼───────────────────────────────┐
                    │  API layer - Next.js Route Handlers           │
                    │  (transport-agnostic; portable to NestJS)     │
                    │  ┌─────────┬─────────┬──────────┬──────────┐  │
                    │  │ auth    │ catalog │ progress │ gamif.   │  │
                    │  ├─────────┼─────────┼──────────┼──────────┤  │
                    │  │ sim     │ tools   │ tutor    │ admin    │  │
                    │  └─────────┴─────────┴──────────┴──────────┘  │
                    │  services/  (pure business logic, testable)   │
                    │  engines/   (5 deterministic sim engines)     │
                    │  repos/     (Prisma data access)              │
                    └───┬───────────────┬──────────────┬────────────┘
                        │               │              │
                 ┌──────▼─────┐  ┌──────▼──────┐  ┌────▼─────────┐
                 │ PostgreSQL │  │ Object store│  │ Cron worker  │
                 │ (Neon /    │  │ (S3-compat: │  │ (Vercel Cron │
                 │  Supabase) │  │  UploadThing│  │  → /internal)│
                 │            │  │  or R2)     │  │              │
                 └────────────┘  └─────────────┘  └──────────────┘
```

No message queue, no Redis in MVP. If rate limiting needs shared state, use Postgres (`rate_limit`
table) or Upstash Redis - see `01-ARCHITECTURE.md §7`. The Tutor service calls the external
**Claude API** (`claude-haiku-4-5` for cost) server-side only; the API key never reaches the client.
