# MoneyLab - 02 · Data Model (PostgreSQL 16 + Prisma 5)

Authoritative schema. Field names here are the canonical camelCase names used in JSON too
(Prisma `@map` maps to snake_case columns; that mapping is mechanical, not shown for every field).

Conventions for every table unless stated otherwise:
- `id String @id` - UUIDv7, server-generated.
- `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Money = `BigInt` (đồng). Rates = `Int` basis points. Enums are Postgres enums via Prisma.
- Soft delete only where noted; default is hard delete with FK `onDelete` rules given.

---

## 1. Enums

```prisma
enum Role            { LEARNER ADMIN }
enum ContentStatus   { DRAFT PUBLISHED ARCHIVED }
enum Locale          { vi en }
// no BlockType enum: blocks are jsonb, validated by blockSchema (doc 05 §3), because a database
// enum would need migrating for every new block type and could not describe a block's fields anyway
enum ArticleCategory { GUIDE EXPLAINER NEWS STORY }
enum QuestionType    { SINGLE_CHOICE MULTI_CHOICE TRUE_FALSE NUMERIC ORDERING MATCHING SCENARIO_CHOICE }
enum QuizKind        { LESSON_CHECK COURSE_FINAL PLACEMENT }
enum AttemptStatus   { IN_PROGRESS SUBMITTED EXPIRED }
enum ProgressStatus  { NOT_STARTED IN_PROGRESS COMPLETED }
enum SimType         { BUDGET LOANS SCAM BUSINESS INVEST }
enum SimStatus       { ACTIVE COMPLETED ABANDONED FAILED }
enum LedgerReason    { LESSON_COMPLETE QUIZ_PASS QUIZ_PERFECT SIM_TURN SIM_COMPLETE STREAK_BONUS
                       DAILY_QUEST BADGE_AWARD LEADERBOARD_REWARD SHOP_PURCHASE STREAK_FREEZE_USE
                       ADMIN_ADJUST REFERRAL }
enum BadgeKind       { PROGRESS STREAK MASTERY SIM SPECIAL }
enum FeedbackKind    { BUG CONTENT_ERROR SUGGESTION PRAISE OTHER }
enum TutorContextType { GENERAL LESSON SIM_SESSION }
enum TutorMsgRole    { USER ASSISTANT }
enum SurveyQuestionType { NPS RATING_1_5 SINGLE_CHOICE MULTI_CHOICE FREE_TEXT }
enum CertStatus      { ACTIVE REVOKED }
enum Province        { HANOI HCMC DANANG HAIPHONG CANTHO /* … all 34 2025 provinces, seed fully */ OTHER }
```

## 2. Identity & auth

### user
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| email | text? unique (citext) | null only until an OAuth account supplies one |
| emailVerifiedAt | timestamptz? | |
| passwordHash | text? | argon2id; null for OAuth-only accounts |
| displayName | text | 2..40 chars; profanity-filtered on write |
| avatarKey | text? | one of ~24 built-in avatar ids, no uploads for learners |
| role | Role | default LEARNER |
| birthYear | int? | 1950..now |
| province | Province? | |
| localePref | Locale | default vi |
| onboardedAt | timestamptz? | set when onboarding quiz done |
| lastActiveAt | timestamptz | bumped max 1×/5 min |
| deletedAt | timestamptz? | soft-delete marker during 30-day purge window |

Indexes: `unique(email)`, `(lastActiveAt)`, `(role)`.

### oauth_account
`id, userId FK→user cascade, provider ("google"), providerAccountId, unique(provider, providerAccountId)`

### refresh_token
`id, userId FK cascade, familyId uuid, tokenHash text unique, expiresAt, rotatedAt?, revokedAt?, userAgent text?, ip inet?`
Index `(userId, familyId)`.

### email_token
For verification + password reset. `id, userId FK cascade, purpose ("verify"|"reset"), tokenHash unique, expiresAt (verify: 7d, reset: 1h), usedAt?`

### idempotency_key
`id, userId, key, endpoint, requestHash, responseStatus int, responseBody jsonb, createdAt` -
`unique(userId, key)`; cron-pruned after 24 h.

### rate_limit
`bucket text, subjectKey text, windowStart timestamptz, count int` - PK `(bucket, subjectKey, windowStart)`.

## 3. Content catalog

Content is versioned at the **lesson/quiz level** via `contentVersion int` (increments on publish);
progress rows record which version the user saw.

### track
`id, slug unique, order int, status ContentStatus, iconKey text?` + translations child.

### track_translation
`trackId FK cascade, locale, title, subtitle, description` - PK `(trackId, locale)`.

### course
`id, trackId FK restrict, slug unique, order int, status ContentStatus, level int (1 easy..3 hard),
estimatedMinutes int, coverImageUrl?, xpReward int (on completion, default 50),
finalQuizId FK?→quiz` + `course_translation(courseId, locale, title, subtitle, description, learningObjectives jsonb /* string[] */)`.

### module
`id, courseId FK cascade, slug, order int` + `module_translation(moduleId, locale, title)`.
`unique(courseId, slug)`.

### lesson
| field | type | notes |
|---|---|---|
| id, slug | | `unique(courseId, slug)` |
| courseId FK cascade, moduleId FK?→module set-null | | |
| order | int | global order within course |
| status | ContentStatus | |
| estimatedMinutes | int | 3..15 |
| xpReward | int | default 20 |
| contentVersion | int | default 1; ++ on each publish |
| checkQuizId | FK?→quiz | the embedded end-of-lesson check |

### lesson_translation
`lessonId, locale` PK pair; `title, summary, blocks jsonb` - **blocks** is the ordered array of
Block objects validated by the Zod schema in doc 05 §3. Blocks live inside the translation because
text differs per locale; media URLs may repeat.

### quiz
`id, kind QuizKind, status ContentStatus, passThresholdPct int (default 70), maxAttempts int? (null=∞),
timeLimitSec int?, shuffleQuestions bool default true, contentVersion int`

### question
`id, quizId FK cascade, order int, type QuestionType, points int default 1, payload jsonb, answerKey jsonb`
- `payload` (learner-visible) and `answerKey` (server-only, **never serialized to non-admin API**)
  schemas per type are in doc 05 §4.
- `question_translation(questionId, locale, prompt, explanation, payloadText jsonb)` - the
  translatable strings referenced by stable keys from `payload`.

### article
`id, slug unique, status ContentStatus default DRAFT, category ArticleCategory, coverImageUrl?,
readMinutes int default 4, publishedAt?, authorName default "MoneyLab", relatedCourseId FK→course
(onDelete SetNull), contentVersion int, createdAt, updatedAt`
- Indexes `(status, publishedAt)` and `(category, publishedAt)`, both serving the library list,
  which is always ordered newest first and filtered to PUBLISHED.
- An article is a lesson without progress, XP or a quiz. It carries no enrollment, no
  `lesson_progress` row and no ledger entry, which is exactly why it can be read signed out.
- `publishedAt` is editorial and may be backdated, so it does **not** follow id order. The library
  cursor therefore carries both keys, `<publishedAt ISO>_<id>` (doc 03 §3.1).

### article_translation
`articleId, locale` PK pair; `title, summary, seoTitle, seoDescription, blocks jsonb` - the same
Block array as `lesson_translation`, validated by the same schema (doc 05 §3), so one renderer draws
both. `CHECK_QUESTION` blocks are dropped at the service boundary rather than stripped of their
answer key: there is no lesson-scoped grading endpoint behind an article, and an unanswerable
question is worse than none.

### media_asset
`id, uploaderId FK→user, url, mimeType, bytes int, width?, height?, altText?` - admin uploads only.

### content_revision  (audit of CMS edits)
`id, entityType text, entityId uuid, editorId FK→user, action ("create"|"update"|"publish"|"unpublish"|"archive"),
snapshot jsonb, createdAt` - append-only.

## 4. Progress

### enrollment
`id, userId FK cascade, courseId FK cascade, startedAt, completedAt?`
`unique(userId, courseId)`.

### lesson_progress
| field | notes |
|---|---|
| id, userId, lessonId | `unique(userId, lessonId)` |
| status ProgressStatus | |
| lastBlockIndex int default 0 | for resume + drop-off analytics |
| contentVersionSeen int | |
| startedAt, completedAt? | |
| secondsSpent int default 0 | client-reported, clamp 0..7200 per lesson |

### quiz_attempt
| field | notes |
|---|---|
| id, userId, quizId | |
| attemptNumber int | 1-based per (user, quiz) |
| status AttemptStatus | |
| questionOrder jsonb | frozen shuffled question-id array at start |
| startedAt, submittedAt?, expiresAt? | expires = start + timeLimitSec |
| scorePoints int?, maxPoints int?, scorePct int?, passed bool? | filled on submit |
| contentVersionSeen int | |

`unique(userId, quizId, attemptNumber)`; index `(userId, quizId, status)`.

### quiz_answer
`id, attemptId FK cascade, questionId, response jsonb, isCorrect bool?, pointsAwarded int?, answeredAt`
`unique(attemptId, questionId)`. Answers are upsertable while IN_PROGRESS; frozen after submit.

## 5. Gamification

### xp_ledger  (append-only; user's XP = SUM(delta) - also denormalized on user_stats)
`id, userId FK cascade, delta int (>0 always for XP), reason LedgerReason, refType text?, refId uuid?, createdAt`
Index `(userId, createdAt)`. `unique(userId, reason, refType, refId)` **partial, where refId is not null** -
this is the anti-double-award guard (e.g. one LESSON_COMPLETE per lesson forever).

### coin_ledger
Same shape but `delta` may be negative (shop). Same partial unique guard. Balance must never go
negative - enforce in service within a transaction (`SELECT ... FOR UPDATE` on user_stats).

### user_stats  (1:1 with user; denormalized hot row)
`userId PK FK cascade, xpTotal int, level int, coins int, streakCurrent int, streakLongest int,
streakLastDate date? (VN date), streakFreezes int default 0, lessonsCompleted int, quizzesPassed int,
simsCompleted int`
**Level formula (fixed):** level = floor(sqrt(xpTotal / 100)) + 1; XP for next level = 100·level².

### badge
`id, code unique (e.g. "STREAK_7"), kind BadgeKind, iconKey, coinReward int default 0, criteria jsonb`
+ `badge_translation(badgeId, locale, title, description)`.
Seeded set (minimum): FIRST_LESSON, LESSONS_10, LESSONS_50, COURSE_FIRST, STREAK_3, STREAK_7,
STREAK_30, QUIZ_PERFECT_1, QUIZ_PERFECT_10, SIM_BUDGET_SURPLUS, SIM_LOANS_SAVER, SIM_SCAM_DETECTIVE
(≥90% on scam sim), SIM_BUSINESS_PROFIT, SIM_INVEST_DIVERSIFIED, LEADERBOARD_TOP10.

### user_badge
`id, userId, badgeId, awardedAt` - `unique(userId, badgeId)`.

### daily_quest
`id, userId, questDate date (VN), code ("COMPLETE_1_LESSON"|"EARN_50_XP"|"PLAY_1_SIM"|"PERFECT_CHECK"),
targetInt int, progressInt int default 0, completedAt?, xpReward int, coinReward int`
`unique(userId, questDate, code)`. 3 quests generated per user per day by cron **lazily on first
request of the day too** (service must handle both to survive cron misses).

### leaderboard_result  (closed weeks only; current week computed live from xp_ledger)
`id, weekStart date (Monday VN), userId, rank int, xpEarned int`
`unique(weekStart, userId)`. Global scope only - there are no groups.

### shop_item / user_purchase
`shop_item: id, code unique, kind ("AVATAR"|"THEME"|"STREAK_FREEZE"), priceCoins int, status` +
translations. `user_purchase: id, userId, itemId, unique(userId,itemId) except STREAK_FREEZE (stackable - no unique, increments user_stats.streakFreezes)`.

## 6. Simulations

### sim_definition  (one row per playable scenario; engine params live here, NOT in code)
| field | notes |
|---|---|
| id, slug unique, type SimType | |
| status ContentStatus, order int | |
| configVersion int | ++ on publish |
| config jsonb | validated by the engine's Zod config schema (doc 04, per engine §"Config") |
| estimatedMinutes int, xpRewardComplete int | |
| unlockRule jsonb? | e.g. `{ "requiresLessonSlug": "lai-suat-co-ban" }`; null = always unlocked |
+ `sim_definition_translation(simId, locale, title, subtitle, description, textBundle jsonb)` -
`textBundle` holds all scenario strings keyed by stable ids the config references (doc 04 §2.3).

### sim_session
| field | notes |
|---|---|
| id, userId FK cascade, simId FK restrict | |
| status SimStatus | |
| configVersionUsed int | frozen at start |
| seed int | PRNG seed frozen at start (determinism, doc 04 §2.2) |
| turnNumber int default 0 | |
| stateVersion int default 0 | optimistic concurrency counter, ++ every action |
| state jsonb | engine-owned canonical state (schema per engine) |
| summary jsonb? | final results on completion |
| startedAt, endedAt? | |
Index `(userId, simId, status)`. Rule: max **1 ACTIVE session per (user, sim)**; enforce with a
partial unique index `unique(userId, simId) where status = 'ACTIVE'`.

### sim_action_log  (append-only, replayable)
`id, sessionId FK cascade, turnNumber int, actionIndex int, actionType text, payload jsonb,
resultDelta jsonb, createdAt` - `unique(sessionId, turnNumber, actionIndex)`.

## 7. AI Tutor

### tutor_thread
| field | notes |
|---|---|
| id, userId FK cascade | |
| contextType TutorContextType | |
| contextId uuid? | lessonId or simSessionId per contextType; null for GENERAL |
| title text? | first user message truncated to 60 chars |
| messageCount int default 0 | |
| lastMessageAt timestamptz | |
Index `(userId, lastMessageAt)`. Max 50 threads per user (delete-oldest on create beyond cap).

### tutor_message
`id, threadId FK cascade, role TutorMsgRole, content text (user ≤1000 chars, assistant ≤4000),
inputTokens int?, outputTokens int?, model text?, createdAt`
Index `(threadId, createdAt)`. Append-only; threads capped at 40 messages
(422 `"THREAD_FULL"` after - user starts a new thread).

### tutor_usage  (daily cost guard)
`userId, usageDate date (VN), messageCount int` - PK `(userId, usageDate)`; incremented in the same
transaction that inserts the USER message; checked against `AI_TUTOR_DAILY_MSG_LIMIT`.

## 8. Feedback & research

### feedback
`id, userId? (null when anonymous), kind FeedbackKind, screenPath text?, entityType?, entityId?,
body text (≤2000), screenshotUrl?, appVersion?, resolvedAt?, resolverId?, resolutionNote?`

### survey / survey_question / survey_response
`survey: id, slug unique, status ContentStatus, audience jsonb? (targeting: minLessons, provinces…), opensAt?, closesAt?`
`survey_question: id, surveyId cascade, order, type SurveyQuestionType, payload jsonb` + translations.
`survey_response: id, surveyId, userId?, answers jsonb, submittedAt` - `unique(surveyId, userId) where userId is not null`.

## 9. Analytics

### event  (first-party, high-volume, append-only; partition by month when >5 M rows)
`id bigserial PK, userId?, anonymousId?, sessionId text, name text, ts timestamptz,
props jsonb, appVersion text?, platform ("web")` - index `(name, ts)`, `(userId, ts)`.
Allowed event names (reject others with 400): `page_view, lesson_start, lesson_block_view,
lesson_complete, quiz_start, quiz_submit, sim_start, sim_action, sim_complete, sim_abandon,
tool_used, search, signup, login, share_click, cert_view`.

### daily_stat  (cron rollup)
`statDate date, metric text, dims jsonb, value numeric` - PK `(statDate, metric, dims)`.
Metrics minimum: dau, signups, lessons_completed, lesson_completion_rate(lessonId),
quiz_first_try_accuracy(questionId), sim_started(simId), sim_completed(simId), d1_retention(cohortDate).

## 10. Certificates & audit

### certificate
`id, code char(13) unique ("ML-XXXXXXXXXX"), userId, courseId, status CertStatus,
issuedAt, revokedAt?, snapshot jsonb (name, course title, score at issue time)`
`unique(userId, courseId)`.

### audit_log
`id, actorId, action text, entityType, entityId, before jsonb?, after jsonb?, ip inet?, createdAt` -
append-only; written by all `/admin/*` mutations.

### cron_run
`id, name text, ranAt timestamptz, ok bool, note text?` - index `(name, ranAt)`; written by every
cron (doc 01 §8); read by `/health`; pruned after 90 days by `daily-rollover`.

### feature_flag
`key text PK, enabled bool, payload jsonb?, updatedBy, updatedAt` - read by
`GET /me/bootstrap`; flags minimum: `sim_invest_enabled`, `shop_enabled`, `survey_prompt_enabled`, `ai_tutor_enabled`.

---

## 11. ER summary (crow's foot, text form)

```
user 1─∞ enrollment ∞─1 course ∞─1 track
user 1─∞ lesson_progress ∞─1 lesson ∞─1 course ; lesson ∞─1 module (opt)
user 1─∞ quiz_attempt 1─∞ quiz_answer ∞─1 question ∞─1 quiz ; quiz 1─0..1 lesson.checkQuiz / course.finalQuiz
user 1─1 user_stats ; user 1─∞ xp_ledger / coin_ledger / user_badge / daily_quest
user 1─∞ sim_session 1─∞ sim_action_log ; sim_session ∞─1 sim_definition
user 1─∞ tutor_thread 1─∞ tutor_message ; user 1─∞ tutor_usage
user 1─∞ feedback / survey_response / event / certificate
```

## 12. Migration & seed requirements

1. `prisma migrate dev` from empty DB must succeed in one shot; no hand-edited migrations.
2. `prisma/seed.ts` must create: 1 ADMIN (from env), all badges, all shop items, all feature flags,
   1 published track ("Nền tảng tiền bạc") with 1 published course ("Ngân sách và tiết kiệm",
   6 lessons incl. blocks + check quizzes in `vi`), all 5 sim_definitions with playable configs
   (use the exact sample configs in doc 04), and 1 demo LEARNER account with some progress for
   manual testing of leaderboards and analytics.
3. Seed is idempotent (upsert by slug/code).
