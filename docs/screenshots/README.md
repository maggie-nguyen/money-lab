# UI smoke screenshots

Full-page captures produced by `pnpm smoke` (puppeteer-core driving system Chrome
against a production build). The run fails on any console error, page crash or
4xx/5xx response, so these images are the visual half of that gate.

Re-run with `pnpm smoke` to refresh them in place, or `pnpm smoke <dir>` to write
somewhere else.

## Learner, light theme

| File | Route |
| --- | --- |
| `landing.png` | `/` |
| `login.png` | `/login` |
| `signup.png` | `/signup` |
| `learn.png` | `/learn` |
| `course.png` | `/course/[slug]` |
| `lesson.png` | `/lesson/[slug]` |
| `sims.png` | `/sims` |
| `sim-budget.png` | `/sims/budget/[sessionId]` |
| `sim-loans.png` | `/sims/loans/[sessionId]` |
| `sim-scam.png` | `/sims/scam/[sessionId]` |
| `sim-business.png` | `/sims/business/[sessionId]` |
| `sim-invest.png` | `/sims/invest/[sessionId]` |
| `tools.png` | `/tools` |
| `tools-loan.png` | `/tools/loan-payment` |
| `quests.png` | `/quests` |
| `shop.png` | `/shop` |
| `leaderboard.png` | `/leaderboard` |
| `profile.png` | `/profile` |
| `settings.png` | `/settings` |
| `tutor.png` | `/tutor` |

## Admin console

| File | Route |
| --- | --- |
| `admin.png` | `/admin` |
| `admin-content.png` | `/admin/content` |
| `admin-sims.png` | `/admin/sims` |
| `admin-users.png` | `/admin/users` |
| `admin-flags.png` | `/admin/flags` |
| `admin-feedback.png` | `/admin/feedback` |
| `admin-audit.png` | `/admin/audit` |

## Dark theme

| File | Route |
| --- | --- |
| `dark-learn.png` | `/learn` |
| `dark-tools.png` | `/tools/loan-payment` |
| `dark-admin.png` | `/admin/content` |

## Narrow viewport, 420 px

| File | Route |
| --- | --- |
| `mobile-login.png` | `/login` |
| `mobile-learn.png` | `/learn` |
