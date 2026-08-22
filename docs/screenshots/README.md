# UI smoke screenshots

Full-page captures produced by `pnpm smoke` (puppeteer-core driving system Chrome
against a production build). The run fails on any console error, page crash or
4xx/5xx response, so these images are the visual half of that gate.

Re-run with `pnpm smoke` to refresh them in place, or `pnpm smoke <dir>` to write
somewhere else.

On macOS, Chrome is auto-detected at `/Applications/Google Chrome.app/...`. Override
with `CHROME_PATH` if needed.

## Product v2 — map & wallet

| File | Route |
| --- | --- |
| `ban-do.png` | `/ban-do` (signed out; map waits 6s for tiles + pins) |
| `ban-do-selected.png` | `/ban-do` with first spot selected (on-map preview overlay) |
| `ban-do-spot.png` | `/ban-do/spot/[id]` opened from map overlay |
| `ban-do-signed-in.png` | `/ban-do` (learner session) |
| `vi-cua-toi.png` | `/vi-cua-toi` |
| `vi-cua-toi-hieu-minh.png` | `/vi-cua-toi/hieu-minh` |
| `vi-cua-toi-chia-vi.png` | `/vi-cua-toi/chia-vi` |
| `vi-cua-toi-cuoc-song.png` | `/vi-cua-toi/cuoc-song` |
| `vi-cua-toi-thu-thach.png` | `/vi-cua-toi/thu-thach` |
| `mobile-ban-do.png` | `/ban-do` at 420px width |
| `mobile-ban-do-selected.png` | `/ban-do` at 420px with spot selected (on-map overlay) |

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
