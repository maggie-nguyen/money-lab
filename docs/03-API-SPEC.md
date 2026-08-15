# MoneyLab - 03 · Complete API Specification (`/api/v1`)

All conventions from `01-ARCHITECTURE.md §3–§5` apply everywhere (envelope, error codes, cursor
pagination, bigint-money-as-string, ETag on public GETs). Per endpoint we list:
**AUTH** (none | optional | required | role), flags **[IDEMPOTENT-KEY]** / **[RL:bucket]**, request,
response `data`, and *specific* errors beyond the universal ones (400/401/429/500 are always possible).

Shared object shapes are defined once in §0 and referenced as `<TypeName>`.

---

## §0 Shared DTOs

```ts
// UserPublic - safe for anyone
{ id: string, displayName: string, avatarKey: string|null, level: number, isMinor?: true }

// Me - self only
{ id, email: string|null, emailVerified: boolean, displayName, avatarKey, role,
  birthYear: number|null, province: string|null, localePref: "vi"|"en",
  onboardedAt: string|null, createdAt: string }

// Stats
{ xpTotal: number, level: number, xpForNextLevel: number, coins: number,
  streakCurrent: number, streakLongest: number, streakFreezes: number,
  lessonsCompleted: number, quizzesPassed: number, simsCompleted: number }

// TrackSummary
{ id, slug, title, subtitle, iconKey, order, courseCount: number, resolvedLocale: "vi"|"en" }

// CourseSummary
{ id, slug, title, subtitle, coverImageUrl, level: 1|2|3, estimatedMinutes, order,
  lessonCount: number, xpReward: number,
  progress?: { status: "NOT_STARTED"|"IN_PROGRESS"|"COMPLETED", completedLessons: number } } // only when authed

// CourseDetail = CourseSummary + { description, learningObjectives: string[],
//   modules: [{ id, slug, title, order, lessons: LessonSummary[] }],
//   unmoduledLessons: LessonSummary[], finalQuiz: { id, questionCount, passThresholdPct } | null }

// LessonSummary
{ id, slug, title, order, estimatedMinutes, xpReward, hasCheckQuiz: boolean,
  media: { video: boolean, sim: boolean },   // derived from the blocks, drives the syllabus glyphs
  progress?: { status, lastBlockIndex } }

// LessonDetail
{ id, slug, courseId, courseSlug, courseTitle, title, summary,
  position: number, lessonCount: number,     // 1-based place in the published order
  prev: { slug, title } | null, next: { slug, title } | null,   // published siblings only
  estimatedMinutes, xpReward, contentVersion,
  blocks: Block[],                      // doc 05 §3; CHECK_QUESTION blocks EXCLUDE answerKey and explanation
  checkQuiz: { id, questionCount, passThresholdPct } | null,
  resolvedLocale }

// QuestionPublic - NEVER contains answerKey or per-option correctness
{ id, order, type, points, prompt, payload: object }   // payload per type, doc 05 §4

// AttemptState
{ id, quizId, attemptNumber, status, questionOrder: string[],
  startedAt, expiresAt: string|null,
  answers: [{ questionId, response }],                  // own answers echoed
  result?: { scorePoints, maxPoints, scorePct, passed,
             perQuestion: [{ questionId, isCorrect, pointsAwarded, correctResponse, explanation }] }
} // result present only when status=SUBMITTED

// SimDefinitionSummary
{ id, slug, type: "BUDGET"|"LOANS"|"SCAM"|"BUSINESS"|"INVEST", title, subtitle,
  estimatedMinutes, xpRewardComplete, order, locked: boolean, lockReason: string|null,
  activeSessionId: string|null }

// SimSessionView - engine-specific `view` documented in doc 04 per engine
{ id, simId, simType, status, turnNumber, stateVersion, startedAt, endedAt: string|null,
  view: object, availableActions: ActionDescriptor[], summary?: object,
  meta: { disclaimer: "simulated" } }

// ActionDescriptor
{ type: string, schema: object /* JSON-schema-ish hint for the client */ }

// GamifiedResult - appended by any endpoint that can award things
{ awards: { xp: number, coins: number, badges: [{ code, title }],
            questProgress: [{ code, progressInt, targetInt, completed: boolean }],
            streak: { current: number, extendedToday: boolean },
            levelUp: { from: number, to: number } | null } }

// TutorThreadView / TutorMessageView / FeedbackView / CertificateView - defined inline below.
```

---

## §1 Auth - `/auth/*`  [RL:auth unless noted]

### 1.1 `POST /auth/signup` - AUTH none
Body: `{ email: string, password: string(≥8), displayName: string(2..40), birthYear?: number, province?: string, localePref?: "vi"|"en" }`
→ 201 `{ user: Me, accessToken, refreshToken, accessTokenExpiresIn: 900 }`; sends verify email.
Errors: 409 `CONFLICT` (email taken).

### 1.2 `POST /auth/login` - AUTH none
Body: `{ email, password }` → 200 same shape as signup.
Errors: 401 `UNAUTHENTICATED` ("Invalid credentials" - same message whether email exists or not).

### 1.3 `POST /auth/google` - AUTH none
Body: `{ idToken: string }` (Google ID token from the client). Verify audience+signature server-side.
→ 200 tokens (+ `isNewUser: boolean`). Errors: 401.

### 1.4 `POST /auth/refresh` - AUTH none
Body: `{ refreshToken }` → 200 `{ accessToken, refreshToken /* rotated */, accessTokenExpiresIn }`.
Errors: 401 (invalid/expired); reuse of rotated token → revoke family, 401.

### 1.5 `POST /auth/logout` - AUTH required
Body: `{ refreshToken?: string, allDevices?: boolean }` → 204. Revokes given token (or all families).

### 1.6 `POST /auth/verify-email` - none. Body `{ token }` → 204. Errors: 410 `GONE`.
### 1.7 `POST /auth/resend-verification` - required → 204 (always, no enumeration).
### 1.8 `POST /auth/forgot-password` - none. Body `{ email }` → 204 always.
### 1.11 `POST /auth/reset-password` - none. Body `{ token, newPassword }` → 204; revokes all refresh
families. Errors: 410.

---

## §2 Me - `/me/*` - AUTH required unless noted

### 2.1 `GET /me` → 200 `Me`.
### 2.2 `PATCH /me` Body: any of `{ displayName, avatarKey, birthYear, province, localePref }` → 200 `Me`.
Errors: 422 `RULE_VIOLATION` (profanity in displayName, invalid avatarKey).
### 2.3 `DELETE /me` Body `{ confirm: "DELETE" }` → 202 `{ scheduledPurgeAt }`. Immediate logout-all + anonymize.
### 2.4 `GET /me/export` → 200 full JSON dump (may take seconds; no pagination; `Content-Disposition: attachment`).
### 2.5 `GET /me/stats` → 200 `Stats`.
### 2.6 `GET /me/bootstrap` - the app-shell call, one round trip after login:
→ 200 `{ user: Me, stats: Stats, featureFlags: Record<string,boolean>,
          dailyQuests: DailyQuest[], activeSimSessions: [{ sessionId, simSlug, simType, turnNumber }],
          continueLearning: { lessonId, lessonSlug, courseSlug, lastBlockIndex } | null,
          unreadBadges: [{ code, title }] }`
(`unreadBadges` = badges awarded since last bootstrap; mark seen server-side on this call.)
### 2.7 `GET /me/ledger?type=xp|coin&cursor&limit` → 200 list of `{ delta, reason, refType, refId, createdAt }`.

---

## §3 Catalog - public reads. AUTH **optional** (when authed, `progress` fields are populated).
All accept `?locale=vi|en`. Cached + ETag. Only `PUBLISHED` content is visible here.

### 3.1 `GET /catalog/tracks` → 200 `TrackSummary[]` (ordered; no pagination - tiny).
### 3.2 `GET /catalog/tracks/{idOrSlug}` → 200 `TrackSummary & { courses: CourseSummary[] }`. 404.
### 3.3 `GET /catalog/courses/{idOrSlug}` → 200 `CourseDetail`. 404.
### 3.4 `GET /catalog/lessons/{idOrSlug}` → 200 `LessonDetail`. 404.
 - Server strips `answerKey` from every CHECK_QUESTION block. Verify by test.
### 3.4a `POST /catalog/lessons/{idOrSlug}/check/{questionId}` - AUTH optional, read rate limit.
Body `{ response }` in the same shape the quiz scorer takes for that question type.
→ 200 `{ questionId, isCorrect, correctResponse, explanation }`. 404 when the lesson or the
question is unknown, 422 `"BAD_RESPONSE_SHAPE"` when the response does not match the type.
Formative only: nothing is stored, no XP is granted, retries are unlimited. This exists because
3.4 strips the answer key, so an inline check cannot be graded in the browser.
### 3.5 `GET /catalog/search?q=&limit=` → 200 `{ data: [{ type: "course"|"lesson"|"sim", id, slug, title, subtitle }] }`
   Postgres FTS (`vietnamese` unaccent config) over titles+summaries. Min q length 2.

---

## §3b Library - `/library/*` - standalone articles. AUTH **optional** [RL:read]

Only `PUBLISHED` articles with a non-null `publishedAt` ever leave these endpoints, whoever is
asking. Articles carry no progress, XP or quiz, which is what lets them be read signed out and
server rendered at `/library` and `/library/{slug}` for search engines.

### 3b.1 `GET /library/articles?category=&courseId=&cursor=&limit=` → 200
`{ data: ArticleSummary[], meta: { nextCursor } }`, newest `publishedAt` first, `limit` 1-50
(default 12). `category` is one of GUIDE, EXPLAINER, NEWS, STORY.
The cursor is opaque and carries **both** sort keys, `<publishedAt ISO>_<id>`: publication dates are
editorial and may be backdated, so a cursor on id alone would skip or repeat rows.

`ArticleSummary = { id, slug, category, coverImageUrl, readMinutes, publishedAt, authorName, title,
summary, resolvedLocale }`.

### 3b.2 `GET /library/articles/{idOrSlug}` → 200 `ArticleDetail`. 404 when unknown, draft or
archived, with no distinction between the three (an unpublished slug must not be discoverable).

`ArticleDetail = ArticleSummary & { seoTitle, seoDescription, blocks, relatedCourse: { slug, title }
| null, related: ArticleSummary[] }`. `related` holds up to three more to read: same category first,
then recent articles of any category. `CHECK_QUESTION` blocks are **dropped** from `blocks`, not
merely stripped of their answer key, because no grading endpoint stands behind an article.

Admin CRUD for articles rides the generic `/admin/{resource}` routes in §14 as the `articles`
resource, so it inherits `If-Match` concurrency, `content_revision` history and `audit_log` writes.

---

## §4 Enrollment & lesson progress - AUTH required

### 4.1 `POST /courses/{courseId}/enroll` [RL:write] → 201 `{ enrollmentId }` | 200 if already (idempotent by design).
Errors: 404 (course not published).
### 4.2 `GET /me/enrollments?status=active|completed&cursor` → 200 `CourseSummary[]` (with progress).
### 4.3 `POST /lessons/{lessonId}/start` [RL:write] → 200 `{ progress: { status:"IN_PROGRESS", lastBlockIndex } }`
Auto-enrolls in the course if needed. Emits `lesson_start`.
### 4.4 `PATCH /lessons/{lessonId}/progress` [RL:write]
Body `{ lastBlockIndex: number≥0, secondsSpentDelta?: number 0..600 }` → 200 progress.
Monotonic: server keeps `max(lastBlockIndex)`. Errors: 422 if index ≥ block count.
### 4.5 `POST /lessons/{lessonId}/complete` **[IDEMPOTENT-KEY]** [RL:write]
Preconditions: progress exists; if lesson has `checkQuiz`, a passed attempt is required.
→ 200 `{ progress, ...GamifiedResult }` (awards lesson XP once ever - ledger guard).
Errors: 422 `RULE_VIOLATION` `"CHECK_QUIZ_NOT_PASSED"`; 404.
 - Completing the **last** lesson of a course also: sets `enrollment.completedAt` **iff** final
     quiz passed or course has none; awards course XP; auto-issues certificate (§13) if course
     completed. All in one transaction; response includes `courseCompleted: boolean, certificate?: CertificateView`.

---

## §5 Quizzes - AUTH required

### 5.1 `POST /quizzes/{quizId}/attempts` [RL:write] - start attempt
→ 201 `AttemptState` (questions **not** included - fetch 5.2; `questionOrder` frozen now, shuffled
if quiz.shuffleQuestions, seeded by attemptId).
Errors: 404; 422 `"MAX_ATTEMPTS_REACHED"`; 409 `CONFLICT` if an IN_PROGRESS attempt exists →
`details:[{path:"attemptId", message:"<existing id>"}]` so the client resumes it.
### 5.2 `GET /quizzes/{quizId}/attempts/{attemptId}` → 200 `AttemptState & { questions: QuestionPublic[] }`
(questions in frozen order). Owner only → 404 otherwise.
### 5.3 `PUT /quizzes/{quizId}/attempts/{attemptId}/answers/{questionId}` [RL:write]
Body `{ response: <per-type shape, doc 05 §4> }` → 200 `{ saved: true }`. Upsert; no correctness
revealed. Errors: 422 `"ATTEMPT_NOT_IN_PROGRESS"`, `"ATTEMPT_EXPIRED"` (auto-expire lazily on any touch past expiresAt).
### 5.4 `POST /quizzes/{quizId}/attempts/{attemptId}/submit` **[IDEMPOTENT-KEY]** [RL:write]
→ 200 `AttemptState (with result) & GamifiedResult`.
Scoring rules: per-type in doc 05 §4.9 (partial credit for MULTI_CHOICE = max(0, correctChosen−wrongChosen)/correctTotal·points, rounded half-up; NUMERIC uses tolerance from answerKey).
`passed = scorePct ≥ passThresholdPct`. XP: `QUIZ_PASS` once per quiz ever; `QUIZ_PERFECT` (100%) once per quiz ever.
Errors: 422 `"ATTEMPT_NOT_IN_PROGRESS"`.
### 5.5 `GET /me/quizzes/{quizId}/attempts` → 200 list of own `AttemptState` summaries (no perQuestion).

**Anti-cheat baseline:** answerKey never leaves the server before submit; question shuffle per
attempt; option order also shuffled (seeded by attemptId+questionId); server-side time limit;
result exposes correct answers only after submit - acceptable for an educational product.

---

## §6 Gamification - AUTH required

### 6.1 `GET /me/quests/today` → 200 `{ questDate, quests: DailyQuest[] }` where a quest is
`{ id, code, questDate, title, description, targetInt, progressInt, completedAt, xpReward, coinReward }`
(lazy-generates if cron missed; date = VN today).
### 6.2 `GET /me/badges` → 200 one flat array covering every badge, earned or not:
`[{ id, code, kind, iconKey, coinReward, title, description, earnedAt }]`. `earnedAt` is null
until the learner earns it, so the client sorts and filters on that single field.
### 6.3 `GET /leaderboards/weekly?around=me&limit=` - AUTH optional (global scope only).
→ 200 `{ weekStart, entries: [{ rank, user: UserPublic, xpEarned, isMe }],
me: { rank, xpEarned } | null }`. Current week computed live: `SUM(xp_ledger.delta) where createdAt in
[weekStart, now)`, tie-break earlier achiever first. Minors and deleted users shown with anonymized names.
### 6.4 `GET /leaderboards/weekly/history?weekStart=` → closed snapshot from `leaderboard_result`.
### 6.5 `GET /shop/items` → 200 `{ coins, items: [{ id, code, kind, title, description, priceCoins,
iconKey, owned, held }] }`. The coin balance rides along so the shop screen needs one request. 6.6 `POST /shop/items/{itemId}/purchase`
**[IDEMPOTENT-KEY]** → 200 `{ coins: newBalance, item }`. Errors: 422 `"INSUFFICIENT_COINS"`,
409 already owned (non-stackable).
### 6.7 `POST /me/streak/freeze/use` - not needed: freezes auto-consume at rollover. **Do not build.** (Documented to prevent invention.)

---

## §7 Simulations - AUTH required. Full engine semantics in doc 04.

### 7.1 `GET /sims` - AUTH optional → 200 `SimDefinitionSummary[]` (`locked` per unlockRule vs caller's progress).
### 7.2 `GET /sims/{idOrSlug}` → 200 summary + `{ description, howToPlay: string[] }`.
### 7.3 `POST /sims/{idOrSlug}/sessions` **[IDEMPOTENT-KEY]** [RL:write]
Body `{ optionsKey?: string }` (named difficulty/scenario preset from config; default `"default"`).
→ 201 `SimSessionView` (turn 0 initial state).
Errors: 409 `CONFLICT` active session exists (details carry its id); 422 `"SIM_LOCKED"`; 404.
### 7.4 `GET /sims/sessions/{sessionId}` → 200 `SimSessionView`. Owner only (else 404).
### 7.5 `POST /sims/sessions/{sessionId}/actions` **[IDEMPOTENT-KEY]** [RL:sim-action]
Body: `{ expectedStateVersion: number, action: { type: string, ...payload } }`
→ 200 `SimSessionView & { turnReport?: object } & GamifiedResult`
The engine validates the action against `availableActions` for current state.
Errors: 409 `VERSION_CONFLICT` (stale expectedStateVersion → client refetches 7.4);
422 `RULE_VIOLATION` with engine-specific machine code in `details[0].message`
(e.g. `"OVERSPEND_LIMIT"`, `"INSUFFICIENT_CASH"`, `"MARKET_CLOSED_TURN"`);
400 `INVALID_STATE` if session not ACTIVE.
### 7.6 `POST /sims/sessions/{sessionId}/abandon` [RL:write] → 200 `{ status: "ABANDONED" }`.
### 7.7 `GET /me/sims/history?simId=&cursor` → 200 list `{ sessionId, simSlug, status, startedAt, endedAt, summary }`.
### 7.8 `GET /sims/sessions/{sessionId}/log` → 200 the action log (owner or ADMIN) - powers the post-game review screen ("here's every decision you made").

---

## §8 Calculators - `/tools/*` - AUTH **none** [RL:read]. Pure functions, no persistence except an
`tool_used` event when `X-Anonymous-Id` present. All money in/out = string đồng; rates = bps int.
All respond `{ data: {...}, meta: { formula: string } }` (formula = human-readable explanation, localized).

### 8.1 `POST /tools/compound-interest`
Body `{ principalVnd, monthlyContributionVnd?, annualRateBps, compounding: "MONTHLY"|"QUARTERLY"|"ANNUALLY", years: 1..50 }`
→ `{ finalAmountVnd, totalContributedVnd, totalInterestVnd, yearly: [{ year, balanceVnd }] }`
### 8.2 `POST /tools/loan-payment` - amortizing loan.
Body `{ principalVnd, annualRateBps, termMonths: 1..600, method: "ANNUITY"|"DECLINING_BALANCE" }`
→ `{ monthlyPaymentVnd /* first month for declining */, totalPaidVnd, totalInterestVnd,
     schedule: [{ month, paymentVnd, principalVnd, interestVnd, remainingVnd }] }` (schedule capped at 360 rows).
### 8.3 `POST /tools/loan-compare` - Body `{ loans: [2..4 of 8.2 inputs + { name }] }` →
per-loan results + `{ cheapestByTotal: name, note }`.
### 8.4 `POST /tools/savings-goal` Body `{ goalVnd, currentVnd, annualRateBps, monthlyContributionVnd }` → `{ monthsNeeded, achievedDate }` (422 `"UNREACHABLE"` if contribution=0 and rate=0).
### 8.5 `POST /tools/inflation` Body `{ amountVnd, annualInflationBps, years }` → `{ futureValueOfCashVnd, equivalentPurchasingPowerVnd }`
### 8.6 `POST /tools/budget-503020` Body `{ monthlyIncomeVnd }` → `{ needsVnd, wantsVnd, savingsVnd }`

Formulas (implement in `src/server/lib/finance.ts` with unit tests against these exact fixtures):
- Annuity payment: `M = P · i / (1 − (1+i)^−n)`, `i = annualRateBps/120000` (monthly), round half-up at the end.
  Fixture: P=100,000,000; 12% p.a. (1200 bps); n=12 → M = 8,884,879 đ; totalInterest = 6,618,545 đ.
  (Not `M·n − P` = 6,618,548: interest is rounded to the đồng each month and the **last payment is
  adjusted to clear the balance exactly** - here 8,884,876 đ - so the schedule stays self-consistent:
  Σprincipal = P and ΣpaymentVnd = totalPaidVnd. Always assert against the schedule, not `M·n`.)
- Compound (monthly, with contribution at period end): iterate months, round only final display values.
  Fixture: 10,000,000 principal, 500,000/mo, 6% p.a. (600 bps), 10y → final 100,133,641 đ (assert ±1 đ).
- Declining balance month k: `interest_k = remaining · i` (round), principal portion constant `P/n` (round last month to clear).

---

## §9 AI Tutor - `/tutor/*` - AUTH required.
Feature-flagged: if `ai_tutor_enabled=false`, all routes return 403 `FORBIDDEN` with message
`"TUTOR_DISABLED"`. Clients hide the UI via the bootstrap flags anyway.

Shapes:
```ts
// TutorThreadView
{ id, contextType: "GENERAL"|"LESSON"|"SIM_SESSION", contextId: string|null,
  contextTitle: string|null, title: string|null, messageCount, lastMessageAt, createdAt }
// TutorMessageView
{ id, role: "USER"|"ASSISTANT", content: string, createdAt }
```

### 9.1 `POST /tutor/threads` [RL:write]
Body `{ contextType, contextId? }` - LESSON requires a published lessonId; SIM_SESSION requires an
own sim_session id (any status). → 201 `TutorThreadView` (no messages yet).
Errors: 404 bad context; 422 `"CONTEXT_REQUIRED"` when type≠GENERAL and contextId missing.
### 9.2 `GET /tutor/threads?cursor` → 200 own `TutorThreadView[]`, newest first,
with `meta: { nextCursor, hasMore }`.
### 9.3 `GET /tutor/threads/{threadId}` → 200 `TutorThreadView & { messages: TutorMessageView[] }`
(full thread ≤40 msgs, no pagination). Owner only → 404.
### 9.4 `POST /tutor/threads/{threadId}/messages` **[IDEMPOTENT-KEY]** [RL:tutor]
Body `{ content: 1..1000 chars }` → 200 `{ userMessage: TutorMessageView, assistantMessage: TutorMessageView,
remainingToday: number }` - **synchronous**, no streaming in MVP (simplest for weak clients; p95
< 8 s accepted for this route only; set route timeout 30 s).
Server pipeline (implement exactly, in `tutorService.sendMessage`):
1. Check flag, thread ownership, thread not full (< 40 msgs) else 422 `"THREAD_FULL"`.
2. Check + increment `tutor_usage` for VN-today in a transaction → 429 `RATE_LIMITED` with
   `Retry-After` = seconds until VN midnight when over `AI_TUTOR_DAILY_MSG_LIMIT`.
3. Build context block: GENERAL → none; LESSON → lesson title + plain-text extraction of its
   blocks (≤6000 chars); SIM_SESSION → sim title + JSON of current `view` + last 5 action-log rows.
4. Call Claude (`AI_TUTOR_MODEL`, max_tokens 1024, temperature 0.3) with the fixed system prompt in
   `src/server/services/tutorPrompt.ts` (Vietnamese; scope: financial education for teens; refuse
   personal investment advice, homework-unrelated topics, and real-money instructions; answer in
   the user's language) + last 20 thread messages + new message.
5. Append server-side disclaimer line (doc 01 §9.7), persist both messages + token counts, return.
On Claude API failure: 502-mapped `INTERNAL` message `"TUTOR_UPSTREAM"`; the user message is NOT
persisted (whole step is one transaction) so retry is clean.
### 9.5 `DELETE /tutor/threads/{threadId}` → 204.
### 9.6 `GET /tutor/usage` → 200 `{ usedToday, limitPerDay, remainingToday }`.

Sim engines may also surface a canned, non-LLM `hint` inside `SimSessionView.view` (doc 04) -
that is separate from and unaffected by the Tutor.

---

## §10 Feedback & surveys

### 10.1 `POST /feedback` - AUTH optional [RL:write]
Body `{ kind, body: 5..2000, screenPath?, entityType?, entityId?, screenshotUrl?, appVersion? }` → 201 `{ id }`.
### 10.2 `GET /surveys/active` - AUTH optional → 200 first matching open survey (audience-filtered) or `null`.
### 10.3 `GET /surveys/{slug}` → 200 `{ id, slug, questions: [{ id, order, type, prompt, payload }] }`. 404 if closed.
### 10.4 `POST /surveys/{slug}/responses` **[IDEMPOTENT-KEY]** - AUTH optional.
Body `{ answers: [{ questionId, value }] }` (value shape per type: NPS 0..10 int; RATING 1..5; choices = option key(s); FREE_TEXT ≤1000).
→ 201. Errors: 409 already responded (authed); 410 closed.

## §11 Events (product analytics ingest)

### 11.1 `POST /events` - AUTH optional [RL:events]
Body `{ anonymousId?: string, sessionId: string, events: [1..50 of { name: <allowlist doc 02 §9>, ts: iso, props?: object ≤2KB }] }`
→ 202 `{ accepted: n, rejected: [{ index, reason }] }`. Never 4xxs the whole batch for one bad event.
Server stamps userId from auth, ignores client userId, clamps ts to now±48h.

## §12 Health & meta
`GET /health` (doc 01 §10) · `GET /meta/provinces` → enum list with vi labels ·
`GET /meta/avatars` → `[{ key, url }]` · all AUTH none, cached.

## §13 Certificates

### 13.1 Issued automatically on course completion (§4.5). No manual issue endpoint for learners.
### 13.2 `GET /me/certificates` → 200 `CertificateView[]`
`{ id, code, courseTitle, issuedAt, status, shareUrl: "https://moneylab.vn/verify/{code}" }`.
### 13.3 `GET /certificates/verify/{code}` - AUTH none, [RL:read] → 200
`{ valid: boolean, holderDisplayName, courseTitle, issuedAt, status }` (404 unknown; still 200 with
`valid:false` when REVOKED, plus `revokedAt`).

---

## §14 Admin - `/admin/*` - role per row; ALL mutations write `audit_log`; ALL list endpoints
support `?status=&locale=&cursor=&limit=&q=`.

### 14.1 Content CRUD - role ADMIN (single-role CMS; draft → published, no review stage)
For each of `tracks, courses, modules, lessons, quizzes, questions, sims (sim-definitions), badges, shop-items, surveys`:
- `GET /admin/{res}` - list incl. DRAFT/ARCHIVED; lessons/questions include full payloads **and answerKeys**.
- `GET /admin/{res}/{id}` - full object incl. all translations.
- `POST /admin/{res}` - body = full authoring shape (doc 05); created as DRAFT.
- `PATCH /admin/{res}/{id}` - partial update. Header `If-Match: <updatedAt etag>` required → 409 `VERSION_CONFLICT` on mismatch (two admins editing).
- `POST /admin/{res}/{id}/publish` - DRAFT→PUBLISHED. Body `{ checklistConfirmed: true }` required
  for lessons/quizzes/sims (the mentor checklist, doc 05 §7 / doc 08 §9) → 422 `"CHECKLIST_REQUIRED"`
  otherwise; bumps `contentVersion`; validates
  referential integrity (course publish requires ≥1 published lesson; lesson publish requires its
  checkQuiz published; sim publish runs engine config Zod + a **smoke simulation** of 3 turns server-side - reject on crash).
- `POST /admin/{res}/{id}/unpublish` - → DRAFT. 422 if referenced by a published parent.
- `POST /admin/{res}/{id}/archive`.
- `DELETE /admin/{res}/{id}` - only when never published (else 422 → archive instead).
Errors shared: 404, 409 slug conflict, 422 with `details` listing every validation failure.

### 14.2 Content import/export (bridges the `content/` JSON folder, doc 05 §6)
- `POST /admin/import` - body = doc 05 bundle JSON → dry-run report `{ creates, updates, errors[] }`;
  with `?apply=true` performs it transactionally (all-or-nothing).
- `GET /admin/export?scope=track:{slug}|course:{slug}|all` → bundle JSON.

### 14.3 Media - ADMIN
`POST /admin/media/presign` Body `{ fileName, mimeType: image/*, bytes ≤ 512000 }` → `{ uploadUrl, assetId, publicUrl }`;
`POST /admin/media/{assetId}/confirm` → 201 asset. `GET /admin/media` list.

### 14.4 Users - ADMIN
- `GET /admin/users?q=&role=&cursor` → `[{ Me-shape minus email for minors? No: admins see email }, stats summary]`
- `PATCH /admin/users/{id}` Body `{ role?, displayName? /* moderation */ }` → 200.
- `POST /admin/users/{id}/ban` Body `{ reason }` → revoke tokens, block login (add `bannedAt` to user table).
- `DELETE /admin/users/{id}` → same pipeline as DELETE /me.

### 14.5 Feedback & research - ADMIN
- `GET /admin/feedback?kind=&resolved=&cursor` · `PATCH /admin/feedback/{id}` `{ resolvedAt, resolutionNote }`.
- `GET /admin/surveys/{id}/responses?cursor` and `.csv`.

### 14.6 Analytics - ADMIN
- `GET /admin/analytics/overview?from=&to=` → `{ dau: [...], signups: [...], activation: n, d1: n, d7: n }` from `daily_stat`.
- `GET /admin/analytics/content-health?courseId=` → per-lesson `{ started, completed, completionRate, medianSeconds, dropOffBlockHistogram }`, per-question `{ firstTryAccuracy, attempts }`.
- `GET /admin/analytics/sims` → per sim `{ started, completed, abandoned, medianTurns, outcomeHistogram }`.
- `GET /admin/analytics/funnel?steps=signup,lesson_start,lesson_complete&from=&to=` → step conversion.

### 14.7 Ops - ADMIN
- `GET/PUT /admin/flags/{key}` · `GET /admin/audit-log?entityType=&actorId=&cursor`
- `POST /admin/certificates/{code}/revoke` `{ reason }`.
- `POST /admin/gamification/adjust` `{ userId, xpDelta?, coinDelta?, reason }` (ledger `ADMIN_ADJUST`).

---

## §15 Endpoint index (checklist - ~70 routes; tick when implemented)

Auth(11): 1.1–1.11 · Me(7): 2.1–2.7 · Catalog(5) · Library(2): 3b.1–3b.2 · Progress(5) · Quiz(5) · Gamification(6) ·
Sims(8) · Tools(6) · Tutor(6): 9.1–9.6 · Feedback/Surveys(4) · Events(1) · Meta(3) · Certs(2) ·
Admin(≈28 counting per-resource CRUD as families) · Internal cron(4).
