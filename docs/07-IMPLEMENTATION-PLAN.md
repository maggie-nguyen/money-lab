# MoneyLab - 07 · Implementation Plan (ordered tickets, weak-agent-proof)

Rules: do tickets **in order**; each has a Definition of Done (DoD); never start a ticket whose
dependencies aren't merged. Every backend ticket includes its tests (doc 01 §11). Estimated sizes:
S ≤ half day, M ≤ 2 days, L ≤ 4 days.
**Production quality is built in per phase, not bolted on at the end**: each phase ends with a
QA-gate ticket (Q-tickets) drawn from doc 08; a phase is not "done" until its Q-ticket is green.

## Phase 0 - Foundation (week 1)
- **T00 (S)** Repo init: Next.js 15 + TS strict + ESLint/Prettier + Vitest + CI workflow. DoD: CI green on empty app.
- **T00a (S)** `src/server/config.ts` boot-time env validation (doc 08 §2). DoD: missing var crashes with named error; CI proves it.
- **T01 (M)** Prisma schema from doc 02 (all tables incl. `cron_run`), `migrate dev` clean, seed skeleton (admin user, flags, badges, shop items). DoD: `pnpm db:seed` idempotent twice.
- **T02 (M)** `withApi` wrapper: envelope, error mapping (doc 01 §3.4), requestId, bigint serializer, Zod integration, rate-limit table impl, idempotency table impl, origin check, security headers. DoD: unit tests for each error path; `/health` live; headers test (doc 08 §5).
- **T03 (M)** Auth: signup/login/refresh rotation/logout/Google + email tokens (Resend). DoD: doc 03 §1 all routes with tests incl. refresh-reuse revocation.
- **Q0 (S)** [GATE] CI hardening: migration test job (empty DB + staging-copy), `pnpm audit` job, secret-scan of build output, log-based error alerting wired, staging + preview envs live with separate DBs, uptime pinger on staging `/health`. (doc 08 §2, §5, §7)

## Phase 1 - Learning core (weeks 2–3)
- **T04 (M)** Catalog read endpoints + ETag caching (§3). Depends T01–02.
- **T05 (M)** Content schemas + importer + `/admin/import` dry-run/apply (doc 05 §6). DoD: seed course imports from `content/vi/...` fixture bundle.
- **T06 (M)** Enrollment + lesson progress + complete pipeline incl. course-completion transaction (§4). 
- **T07 (L)** Quiz engine: attempts, answers, scoring per type table (doc 05 §4), submit + idempotency (§5). DoD: scoring fixtures for all 7 types.
- **T08 (M)** Gamification service: ledgers + anti-double-award guard, level formula, streak logic (VN tz!), daily quests lazy-gen, badges evaluator hooks. DoD: streak unit tests across midnight VN incl. freeze consumption.
- **T09 (S)** Leaderboard live + weekly snapshot cron. **T10 (S)** Shop endpoints. **T11 (S)** cron `daily-rollover` + `cron_run` bookkeeping.
- **Q1 (M)** [GATE] Phase-1 quality: `integrity-check` cron live (doc 08 §4.2); IDOR grep-audit CI script + negative ownership tests for enrollment/progress/attempts; injected-clock refactor verified (no `new Date()` in services); nightly `pg_dump` GitHub Action + **first restore drill documented**; XSS regression tests (feedback body, display name).

## Phase 2 - Sims (weeks 3–5) - one ticket per engine, all depend on T12
- **T12 (M)** Engine contract, RNG, session endpoints (§7) with a trivial FAKE engine for tests; golden-replay harness.
- **T13 (L)** BUDGET engine (doc 04 §2) + seed config. - **T14 (L)** LOANS (§3, incl. `/tools/*` finance lib first: **T13a (M)** doc 03 §8 all 6 calculators with fixtures). - **T15 (M)** SCAM (§4) + ≥24-item pool content. - **T16 (L)** BUSINESS (§5). - **T17 (L)** INVEST (§6).
- DoD each: golden replay + property tests + secret-path test + badge award test.
- **Q2 (S)** [GATE] `scripts/sim-balance.ts` (1000-session outcome distribution, doc 08 §9.2) run
  and tuned for all 5 seed configs; k6 sim-action scenario passes on staging (doc 08 §8.3).

## Phase 3 - Tutor, research, admin (weeks 5–6)
- **T18 (M)** AI Tutor: tables, threads/messages endpoints, usage limits, prompt file, Claude client (doc 03 §9). Load the `claude-api` skill before implementing the client. DoD: mocked-API tests; live smoke behind flag.
- **T19 (M)** Feedback + surveys + events ingest + `analytics-rollup` cron (§10, §11, doc 02 §9).
- **T20 (L)** Admin CRUD families + publish validation (incl. `checklistConfirmed`) + audit log (§14.1–14.3). - **T21 (M)** Admin users/flags/analytics endpoints (§14.4–14.7). - **T22 (S)** Certificates + verify page.
- **Q3 (M)** [GATE] Tutor red-team suite (doc 08 §5 last row) passing; Anthropic monthly spend cap set; `scripts/anonymize-db.ts` + first anonymized staging refresh; account-deletion pipeline E2E test (delete → export 404 → anonymized leaderboard).

## Phase 4 - Frontend (parallel from week 2, per doc 06)
- **F01 (M)** Fork T1 shell, strip language content, wire bootstrap/auth. - **F02 (M)** Catalog +
  lesson player (block renderer). - **F03 (M)** Quiz UI. - **F04 (M)** Gamification surfaces
  (header stats, quests, leaderboard, shop from T1). - **F05–F09 (M each)** five sim UIs via v0
  recipe (doc 06 §4). - **F10 (M)** Tutor panel. - **F11 (L)** Admin on T3. - **F12 (S)** settings,
  delete/export, verify page, landing.

## Phase 5 - Launch (week 7+)
- **T23 (M)** Playwright: all six journeys of doc 08 §3.1 (not just one smoke). - **T24 (S)**
  Lighthouse CI budget on `/learn` + lesson page (doc 08 §8). - **T25 (M)** k6 scenarios 1–2 on
  staging; fix with the listed cheap wins only. - **T26 (S)** privacy + terms pages, consent
  checkbox, error pages (404/500/offline) in vi. - **T27 (M)** `docs/ops/runbook.md` with all
  procedures of doc 08 §7; on-call rotation agreed; alert-fire test (break staging once).
- **Q4** [GATE] The full **launch readiness checklist doc 08 §10** - every box, signed off in the PR that flips prod live.
- **T28** usability-test round 1: seed survey `usability-round-1`, funnels verified in `/admin/analytics/funnel`, weekly content-health review scheduled (doc 08 §9.3).

## Sequencing summary
`T00→T00a→T01→T02→{T03,T04}→Q0`; T05→T06→T07→T08→{T09,T10,T11}→Q1;
T12→{T13,T13a→T14,T15,T16,T17}→Q2; {T18,T19,T20→T21,T22}→Q3 after Phase 1;
frontend F-tickets each depend on their API ticket; Phase 5 (T23–T27) → Q4 → launch → T28.

## Risk register (top 5, mitigation baked into spec)
1. Money-math bugs → bigint-string convention + fixture tests (doc 00 §4, doc 03 §8).
2. Sim cheating/desync → server-authoritative + stateVersion + golden replay (doc 04 §1).
3. Content quality → mentor checklist gate (doc 05 §7) + content-health analytics (§14.6).
4. AI tutor cost/abuse → daily cap, 1k-char inputs, haiku model (doc 03 §9).
5. Minors' privacy → data minimization + purge + anonymized leaderboards (doc 01 §9).
