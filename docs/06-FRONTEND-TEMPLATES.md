# MoneyLab - 06 · Frontend: Reuse Existing Templates (screen-by-screen map)

> **Status: superseded by what shipped.** This document is the survey that led to the decision, kept
> for the reasoning. The UI was not forked from any of the candidates below: it is built on the
> "Sổ Cái" design language (editorial banking, paper and ink and moss, tabular figures) described in
> [10-FRONTEND-BUILD-BRIEF.md](10-FRONTEND-BUILD-BRIEF.md), with the primitives in
> `src/components/ui` and the tokens in `src/app/globals.css`. Read §2 onward as history.

Goal: write as little custom UI as possible. Stack for all candidates: **Next.js + Tailwind +
shadcn/ui** so pieces compose. Strategy: fork ONE base template for the app shell, one for the
admin, and lift specific screens/blocks from the others.

## §1 Template shortlist (all free / open source)

| # | Template | Use for | License check |
|---|---|---|---|
| T1 | [Duolingo clone - sanidhyy/duolingo-clone](https://github.com/sanidhyy/duolingo-clone) | THE closest existing UI to MoneyLab's learner app: unit/lesson path map, hearts/XP/streak header, quests panel, leaderboard page, shop page, lesson player with feedback footer | MIT - verify before fork |
| T2 | [Code With Antonio LMS - kendevco/NextLMS](https://github.com/kendevco/NextLMS) (or the original tutorial repo) | Course catalog cards, course page with chapter sidebar, progress bar, admin course editor patterns | check repo license |
| T3 | [Next.js + shadcn/ui admin dashboard (Vercel template)](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard) | Admin CMS shell: sidebar nav, data tables, CRUD forms, charts | MIT |
| T4 | [shadcn/ui official blocks](https://ui.shadcn.com/blocks) (login, sidebar, dashboard, charts blocks) | Auth screens, settings, stat cards - copy-paste blocks | MIT |
| T5 | [v0.app dashboard templates](https://v0.app/templates/dashboards) | Generate one-off screens (sim UIs, reports) by prompting v0 with the DTOs from doc 03; export as shadcn components | per-template |
| T6 | [Skillsaint LMS template](https://github.com/NextJSTemplates/skillsaint-nextjs-lms) | Marketing/landing page + course listing look | check license |
| T7 | [Shadcn Studio LMS template](https://shadcnstudio.com/templates) | Reference for course detail & lesson layouts (free tier) | per-template |
| T8 | [Lets-Learn-LMS](https://github.com/aialvi/Lets-Learn-LMS) | Reference for AI-tutor chat panel embedded in lessons | check license |

Base choice (fixed): **fork T1 for the learner app shell** (its gamified layout is 80% of our UX),
**T3 for `/admin`**. Everything else is quarry, not foundation.

## §2 Screen-by-screen mapping (learner app)

| Screen | Route | Source | Adaptation notes (what a weak agent must change) |
|---|---|---|---|
| Landing / marketing | `/` | T6 or v0 prompt | vi copy; secondary CTA → "Đọc thư viện" links to `/library` |
| Auth (login/signup/reset) | `/login`, `/signup` | T4 login blocks | wire to doc 03 §1; Google button above the password form |
| Onboarding | `/welcome` | custom (3 steps, use T4 form) | display name, birthYear, province → `PATCH /me`; then `/learn` |
| Home / course path | `/learn` | **T1 unit path map** | units→our Courses, lessons→Lessons; lock icons from `progress.status`; right rail = T1's quests+leaderboard widgets fed by §6 endpoints |
| Course detail | `/course/[slug]` | T2 course page | chapters→modules; enroll button → §4.1 |
| Lesson player | `/lesson/[slug]` | T1 lesson screen + T2 content area | render Block union (doc 05 §3): map each `type` to a component; footer "Tiếp tục" advances block index → `PATCH /lessons/{id}/progress`; CHECK_QUESTION uses T1's answer-feedback footer (green/red slide-up) |
| Quiz | `/quiz/[attemptId]` | T1 challenge screens | one question per screen, progress bar = answered/total; submit → result screen with per-question explanations |
| Sims hub | `/sims` | v0 prompt: "card grid of 5 game modes" | locked state + activeSession "Continue" chip |
| Sim: Budget | `/sims/budget/[sessionId]` | v0 prompt (see §4) | 3-phase UI: allocation sliders → event modal cards → month report |
| Sim: Loans | `/sims/loans/...` | v0 prompt | offer comparison table reuses `/tools/loan-compare` result shape |
| Sim: Scam | `/sims/scam/...` | v0 prompt: "mobile inbox mock" | chat/SMS-style list; SCAM/SAFE buttons; reveal card |
| Sim: Business | `/sims/business/...` | v0 prompt | weekly plan form + results chart (load `dataviz` conventions) |
| Sim: Invest | `/sims/invest/...` | v0 prompt | line chart of portfolioValue vs benchmark; order ticket panel |
| Leaderboard | `/leaderboard` | **T1 leaderboard page** | weekly; anonymized minors handled server-side already |
| Quests | `/quests` | **T1 quests page** | 3 daily quests + progress bars |
| Shop | `/shop` | **T1 shop page** | coins balance; avatar/theme/freeze items |
| Profile & stats | `/profile` | T4 blocks + T1 header stats | Stats DTO; badges grid; certificates list |
| Tutor chat | floating panel on lesson/sim + `/tutor` | T8 pattern or v0 "chat panel" | thread list + messages; disable input while awaiting reply; show `remainingToday` |
| Certificates verify | `/verify/[code]` | v0 simple page | public, no auth |
| Settings | `/settings` | T4 settings block | PATCH /me, delete account flow, data export |

## §3 Admin (`/admin`) on T3

Sidebar sections → doc 03 §14: Content (tree editor: track→course→lesson; lesson editor = block
list with per-type forms + JSON import), Quizzes, Sims (JSON config editor with Zod error display +
"smoke test" button), Media, Users, Feedback inbox, Surveys + responses, Analytics (overview,
content-health, sims, funnel - use T3's chart components), Flags, Audit log. Every table = T3
DataTable with server cursor pagination.

## §4 How to use v0 for the custom screens (recipe for the team)

1. Paste into v0: the relevant **DTO from doc 03 §0** + the engine's **view/action shapes from
   doc 04** + one sentence of art direction ("friendly, Duolingo-like, Vietnamese labels,
   green/amber palette, mobile-first").
2. Ask for a **single client component taking `data` props and `onAction` callbacks** - no fetch
   inside v0 components ever.
3. Export → drop into `src/components/sims/...` → wire callbacks to the API client.
4. Do NOT accept v0 code that computes money client-side; it renders only.

## §5 Frontend hard rules
- One typed API client (`src/lib/api.ts`) generated from `openapi.json`; no raw `fetch` in components.
- TanStack Query for all server state; mutation `onSuccess` invalidates the affected keys listed
  per endpoint family (learner: `me`, `bootstrap`, `lesson`, `sims`).
- All money rendering through `formatVnd(bigintString)` util (`12.500.000 ₫`); never `parseInt` on
  money strings - use `BigInt`.
- vi/en strings via `next-intl`; no hardcoded UI strings.
- Charts: follow the `dataviz` skill conventions already available in this workspace.

Sources: [v0 dashboard templates](https://v0.app/templates/dashboards) · [Vercel shadcn admin template](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard) · [shadcn Studio templates](https://shadcnstudio.com/templates) · [duolingo-clone](https://github.com/sanidhyy/duolingo-clone) · [NextLMS](https://github.com/kendevco/NextLMS) · [Skillsaint](https://github.com/NextJSTemplates/skillsaint-nextjs-lms) · [Lets-Learn-LMS](https://github.com/aialvi/Lets-Learn-LMS)
