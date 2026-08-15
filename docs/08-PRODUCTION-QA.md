# MoneyLab - 08 · Production Quality, QA & Operations Spec

This is a **production system serving real users, run on a small budget**. The way we square that:
zero extra infrastructure (everything runs on Vercel + one managed Postgres), but **non-negotiable
process**: every check in this document is cheap to run and blocking. "We'll add it later" is not
allowed for anything marked **[GATE]**.

---

## §1 Budget guardrails (what we deliberately do NOT build)

To stay cheap, quality comes from tests + process, not from more moving parts:
- One region, one Postgres, no read replicas, no Redis, no queue, no k8s, no microservices.
- No custom observability stack: structured stdout logs + the platform's collector + one uptime pinger (free tier of
  BetterStack/UptimeRobot) + Neon/Supabase built-in DB metrics. That's the whole stack.
- No load balancers/CDN config: Vercel defaults.
- Monthly infra target: **< $50/mo** (Postgres paid tier + Resend + Claude tutor budget). The
  tutor's daily cap (doc 01 §7) is the cost circuit-breaker; additionally set a hard monthly
  spend limit in the Anthropic console.
- Feature-wise nothing is cut - the savings are purely infrastructural.

## §2 Environments & configuration

| Env | Where | Data | Purpose |
|---|---|---|---|
| `local` | dev machine, Docker Postgres | seed only | development |
| `preview` | Vercel preview per PR | **shared staging DB, never prod** | PR review; `RATE_LIMIT_DISABLED=true` allowed |
| `staging` | Vercel branch `staging` | staging DB with seed + anonymized fixtures | UAT, load tests, migration rehearsal |
| `prod` | Vercel `main` | real data | users |

Rules **[GATE]**:
1. Prod secrets exist only in Vercel prod env; never in `.env` files, never in preview.
2. `APP_ORIGIN`, cookie domain, and OAuth redirect URIs differ per env - verified by a boot-time
   config validator (`src/server/config.ts`: Zod-parse ALL env vars at startup; crash loudly on
   missing/malformed instead of failing at first request).
3. Google Sign-In needs one OAuth client per env, because Google matches the JavaScript origin
   exactly. Create a **Web application** client in Google Cloud Console, add the env's
   `APP_ORIGIN` under Authorised JavaScript origins (no redirect URI: we use the id_token flow,
   which never leaves the page), then set both `GOOGLE_CLIENT_ID` and
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to it. Preview deploys get their own client with the wildcard
   preview origin. With the pair unset the Google button simply does not render and email and
   password still works, which is how local dev and CI run.
4. **Exactly one trusted proxy sits in front of the app.** The `auth` rate limit buckets by IP,
   and the only source of a client address is `x-forwarded-for`. `clientIp()` in
   `src/server/http.ts` reads the **rightmost** entry, the one the proxy appended from the socket
   it accepted, so a caller who prefills the header cannot spread their login attempts across
   fabricated addresses. Chaining a second proxy without stripping the inbound header breaks that
   property: if one is ever added, it must overwrite `x-forwarded-for` rather than append to it.
5. Logs are one JSON line per event on stdout (pino, `src/server/lib/logger.ts`), captured by the
   platform's log collector. `LOG_LEVEL` sets the level, `info` by default and `silent` under
   test. Unhandled 500s log the request id, method, path and user id; the request id is the same
   one the client is shown, so a support report maps to a line. There is no error-reporting SaaS
   wired in: alerting reads the log stream. Wiring one is a launch-time decision, not a code gap,
   and until it happens no env var pretends otherwise.
6. Staging DB is refreshed from an **anonymized** prod snapshot at most monthly, via the
   anonymizer script (`scripts/anonymize-db.ts`: emails → `user{n}@example.test`, displayName →
   generated, tutor/feedback bodies → dropped, tokens → deleted). Raw prod data never leaves prod.

## §3 Test strategy (what must exist, with coverage targets)

| Layer | Tool | Scope & target | Blocking? |
|---|---|---|---|
| Unit - `lib/` (money, time, rng, finance) | Vitest | **100% branch** on `money.ts`, `finance.ts`, `time.ts`; these files are where real-world harm lives | [GATE] |
| Unit - services | Vitest + test DB (per doc 01 §11) | every endpoint's happy path + every documented error code; ≥85% line on `services/` | [GATE] |
| Unit - engines | Vitest | golden replay + property tests + secret-path denylist (doc 04 §8) | [GATE] |
| Integration - HTTP | Vitest + `next` test server | one test per route family exercising `withApi` (auth 401/403, envelope, rate-limit 429, idempotency replay) | [GATE] |
| E2E smoke | Playwright | the 6 journeys in §3.1, run against preview build in CI and against staging nightly | [GATE] for release |
| UI smoke | `pnpm smoke` (puppeteer-core + system Chrome) | walks every learner and admin route against a production build, fails on any console error, page crash or 4xx/5xx response, and writes a full-page screenshot per route for visual review | [GATE] before release |
| Migration test | CI job | apply all migrations to an empty DB **and** to a copy of the latest staging schema; both must succeed | [GATE] |
| Load | k6 (free, local) | §8 scenarios against staging before launch and before any release touching sims/quiz submit | launch gate |
| Manual regression | checklist §6 | before every prod release | [GATE] |
| Static gates | `pnpm lint` (eslint flat config, `next/core-web-vitals` + `next/typescript`) and `pnpm typecheck` (`tsc --noEmit`, strict with `noUncheckedIndexedAccess`) | zero errors; warnings reviewed | [GATE] |

CI runs `lint`, `typecheck`, `test` and `build` on every push and pull request
(`.github/workflows/ci.yml`). The test harness starts its own embedded Postgres on 5545, so CI
needs no database service.

### 3.1 The six E2E journeys (never allowed to break)
1. Signed out: land → read an article in `/library` → sign-up CTA → account created.
2. Signup → verify banner → complete lesson → streak = 1 → appears on leaderboard.
3. Quiz: fail below threshold → retry → pass → explanations visible → no double XP.
4. Sim BUDGET: start → allocate → resolve one event → end month → report renders → resume after reload.
5. Google sign-in: Google button → account linked by verified email → same progress as the password login for that email.
6. Admin: import content bundle (dry-run shows diff) → apply → new lesson visible to learner → unpublish → hidden.

### 3.2 Test data policy
- All tests run on a disposable Postgres (Docker locally, ephemeral in CI). Never against staging.
- One canonical fixture factory module (`tests/factories.ts`); tests never hand-write user rows.
- Time-dependent tests (streaks, quests, leaderboard weeks) use an injected clock
  (`services` take `now()` from context - **required by construction**, not optional).

## §4 Data safety: backups, integrity, migrations

### 4.1 Backups & recovery **[GATE before first real user]**
- Managed Postgres PITR enabled (Neon/Supabase built-in). Targets: **RPO ≤ 24 h, RTO ≤ 4 h**.
- Additionally, nightly `pg_dump` to a private object-storage bucket, 30-day retention
  (cron on GitHub Actions schedule - free).
- **Restore drill is part of launch checklist and quarterly thereafter**: restore latest dump to a
  scratch DB, run the app against it, complete journey §3.1-1. A backup that's never been restored
  doesn't count as a backup. Document the drill result in `docs/ops/restore-drills.md`.

### 4.2 Nightly invariant checker (cheap substitute for elaborate infra)
Cron `integrity-check` (add to doc 01 §8 table, 02:00 VN) runs SQL assertions and pages on failure:
1. `SUM(xp_ledger.delta) = user_stats.xpTotal` per user (sampled 500 users + all touched today).
2. `SUM(coin_ledger.delta) = user_stats.coins` - and never negative.
3. No `quiz_attempt` SUBMITTED with `scorePoints > maxPoints` or null score.
4. No ACTIVE `sim_session` older than 30 days (auto-abandon them, count reported).
5. Every PUBLISHED lesson's blocks re-validate against the current Zod schema.
6. Orphan checks: answers without attempts, sessions without definitions, etc.
Output: one row in `daily_stat` (`integrity_violations`) + an error log line, which the alert rule picks up, if > 0.

### 4.3 Migration safety rules **[GATE]**
- Only **expand → migrate data → contract** patterns; never a destructive change in the same
  release that deploys code depending on it. Concretely forbidden in one step: dropping/renaming a
  column in use, adding a NOT NULL without default to a non-empty table.
- Every migration PR states its **rollback plan** in the description (usually: previous release is
  compatible because expand-only; if not, include a down-script).
- Long migrations (> 30 s on staging copy) must be batched or run in a maintenance window
  announced in-product 24 h ahead (feature flag `maintenance_banner`).

## §5 Security checklist (mapped to what we actually face) **[GATE at launch, re-audit each quarter]**

| Threat | Control (already specced) | Verify by |
|---|---|---|
| Credential stuffing | argon2id, rate bucket `auth`, uniform login error | integration test + manual |
| Token theft | 15-min access, rotating refresh, family revoke on reuse | test exists (T03) |
| IDOR (biggest real risk) | every service loads by `(id, ownerId)`; 404 not 403 for others' resources | **grep-audit**: CI script fails if any `findUnique({ where: { id } })` on user-owned models lacks owner scoping; plus per-resource negative tests |
| Quiz/sim cheating | answerKey/secret-path never serialized; server-side scoring | secret-path unit tests (doc 04 §1.3) |
| Injection | Prisma parameterized; Zod on all inputs; markdown rendered with sanitizer (rehype-sanitize allowlist) | dependency + one XSS regression test with `<script>` in feedback body & display name |
| XSS via content | admin-authored markdown sanitized on **render**, plus importer strips raw HTML | test |
| CSRF | SameSite=Lax cookie + JSON-only bodies + origin check in `withApi` | integration test with foreign Origin |
| SSRF/file abuse | uploads: admin-only, image mime + 500 KB cap, served from storage domain | test |
| Secrets leakage | no secrets in client bundles - CI runs `grep` of build output for key prefixes (`sk-ant`, `re_`, AUTH_SECRET value len) | CI step |
| Dependencies | `pnpm audit --prod` + Dependabot weekly; CI fails on critical CVEs | CI step |
| Headers | CSP in `next.config.ts`: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. Exactly two third parties are allowed in, `accounts.google.com` for sign-in and `www.youtube-nocookie.com` for lesson video, and only in `frame-src` plus the script and connect entries Google Identity Services needs. `script-src` keeps `'unsafe-inline'` for Next's hydration bootstrap: the nonce alternative forces every route dynamic and would cost the statically generated library pages. Plus HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options | one integration test asserting headers |
| Rate-limit evasion | `clientIp()` reads the rightmost `x-forwarded-for` hop, so a prefilled header cannot fan login attempts across fake addresses; requires the single-trusted-proxy deployment in §2 | integration test with a forged header prefix |
| Token forgery | `verifyAccessToken` pins `algorithms: ["HS256"]` and rejects any `role` outside `LEARNER`/`ADMIN`, so an `alg: none` or role-widened token fails before the payload is read | unit test |
| Minors' data | doc 01 §9 minimization; deletion pipeline tested end-to-end (delete → export returns 404 → leaderboard anonymized) | E2E test |
| AI tutor abuse | daily cap, 1000-char input, scope-pinned system prompt, output disclaimer appended server-side | tests + red-team prompt list (`tests/tutor/redteam.txt`, ~20 prompts: jailbreak, personal advice, off-topic, self-harm → assert refusal/redirect wording present) |

## §6 Release process & manual regression **[GATE - every prod deploy]**

1. All CI gates green (typecheck, lint, unit, integration, migration test, E2E on preview, audits).
2. Deploy `staging`; run Playwright suite against staging; run the **15-minute manual pass**:
 - login with password and with Google on a real phone (Android Chrome - our majority device)
 - one lesson end-to-end in `vi`; check VND formatting, no layout overflow
 - one turn of each of the 5 sims
 - tutor: one question, verify disclaimer + remaining count
 - admin: open each section, edit-and-publish one draft lesson
3. Read the staging error log for types that are new since the last release.
4. Deploy prod **during low-traffic hours (before 07:00 or after 23:00 VN - users are students)**.
5. Post-deploy watch (15 min): error log live, `/health`, one real lesson completion.
6. **Rollback**: Vercel instant rollback to previous deployment; DB is safe because §4.3 forbids
   breaking migrations. Rollback decision threshold: any 5xx spike > 1% of requests or any
   money/XP-visible bug - roll back first, debug after.
7. Every release tagged `vX.Y.Z`; `version` surfaced in `/health` and in the app footer
   (helps match user bug reports to releases).

Cadence: small releases, ≥ weekly during active development. Never deploy Friday evening before a
weekend nobody is on call.

## §7 Monitoring & alerting (exact alerts; all free-tier)

| Alert | Source | Threshold | Channel |
|---|---|---|---|
| Site down | uptime pinger on `/api/v1/health` (1-min interval, from 2 regions) | 2 consecutive fails | Telegram/Zalo group + SMS to on-call |
| Error spike | log-based alert on `level=50` lines from the platform's collector | > 20 events/5 min, or any error on a `/sims/*` or `/quizzes/*` path | Telegram |
| DB near limit | provider dashboard alerts | storage > 80%, connections > 80% | email |
| Integrity violations | §4.2 cron | any | Telegram |
| Cron missed | each cron writes `cron_run(name, ranAt)`; `/health` marks `degraded` if `daily-rollover` > 26 h old | degraded | uptime pinger catches it |
| Tutor cost | Anthropic console budget alert | 80% of monthly cap | email |
| Cert/domain expiry | uptime service | 14 days | email |

On-call = rotating team member per week (calendar), expectations: acknowledge Sev-1 within 1 h
daytime / best-effort at night. This is honest for a small team; do not promise more.

### Severity ladder & runbook (`docs/ops/runbook.md` - create with these entries)
- **Sev-1** (down, data loss, auth broken, minors' data exposed): drop everything; rollback or
  maintenance banner; postmortem within 48 h (blameless, 1 page: timeline/cause/fix/prevention).
- **Sev-2** (a feature broken: one sim, tutor, leaderboard): flag it off if flagged, fix within 3 days.
- **Sev-3** (cosmetic, single-content error): normal backlog; content errors fixable via CMS without deploy.
Runbook must include copy-paste procedures for: restore from backup, rotate `AUTH_SECRET`
(invalidates all sessions - user comms template included), revoke a leaked API key, take a DB
snapshot before risky manual SQL, contact info of DB/hosting support.

## §8 Performance & capacity (verify, don't guess)

Load profile assumption: launch cohort ≤ 5k users, peak = classroom-style bursts (30–60 students
hitting the same lesson simultaneously when a teacher demos it).
k6 scenarios (staging, before launch) **[launch GATE]**:
1. 100 VUs × 10 min mixed read (bootstrap, catalog, lesson) → p95 < 300 ms, 0 errors.
2. 60 VUs completing lessons + submitting quizzes concurrently → p95 < 500 ms, no idempotency
   violations, no deadlocks (watch Postgres logs).
3. 30 VUs playing sims (1 action/3 s) → p95 < 500 ms, `VERSION_CONFLICT` rate < 1%.
Known cheap wins if targets missed (in order): add the missing index (check `pg_stat_statements`),
cache bootstrap flags in-process 60 s, ISR for catalog pages. Do NOT reach for Redis/replicas
before those.

Frontend budget **[GATE per release]**: Lighthouse CI on `/learn` and one lesson page, mobile,
throttled: Performance ≥ 80, LCP < 3 s on 4G, bundle for learner routes < 250 KB gz JS.

## §9 QA of content & simulations (product correctness, not just code)

1. Every published lesson passed the mentor checklist (doc 05 §7) - tracked as a required
   checkbox in the CMS publish dialog (`publish` endpoint requires `checklistConfirmed: true`).
2. Every sim config change (even numbers-only) re-runs golden replay + a **balance report** script
   (`scripts/sim-balance.ts`): plays 1000 seeded random-policy sessions and prints outcome
   distribution (fail rate, grade distribution). Human rule: BUDGET fail rate for random play
   40–70%; SCAM average accuracy 55–75% (too easy/hard = retune before publish).
3. Quiz question health: `/admin/analytics/content-health` reviewed **weekly** during term time;
   any question with first-try accuracy < 30% or > 95% gets flagged for rewrite (that's a
   measurement, not a guess, of bad questions).
4. Vietnamese copy: second-person consistent (`bạn`), currency format `12.500.000 ₫`, no
   machine-translation artifacts - spot-checked per release in the §6 manual pass.

## §10 Launch readiness checklist (all boxes before real users)

- [ ] All [GATE] items above green; restore drill done and documented
- [ ] Terms of use + privacy policy pages live (plain Vietnamese, age-appropriate); consent
      checkbox on signup; contact email monitored
- [ ] `DELETE /me` and `GET /me/export` verified end-to-end on staging
- [ ] Rate limits verified ON in prod (attempt 11 logins → 429)
- [ ] Seed/demo/admin accounts: prod admin uses strong unique password + non-shared email;
      no demo accounts in prod
- [ ] Log-based error alert, uptime and DB alerts firing tested (break staging on purpose once)
- [ ] Error pages exist in `vi` and don't dead-end: `not-found.tsx`, `error.tsx` and
      `global-error.tsx` for a failure in the root layout itself
- [ ] `robots.txt` and `sitemap.xml` resolve on the real origin, and the sitemap lists the
      published articles (`APP_ORIGIN` is what both are built from)
- [ ] Tutor red-team list passes; monthly Anthropic spend cap set
- [ ] k6 scenarios passed; Lighthouse budget passed
- [ ] Runbook + on-call rotation agreed and written down
- [ ] Feedback widget works logged-out (first bug reports will come from it)
