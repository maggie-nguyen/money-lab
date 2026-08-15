# 10. Frontend build brief (template A "Sổ Cái")

Read this before writing any page. It is the contract every screen follows.
Endpoint shapes live in `docs/03-API-SPEC.md`; the route map lives in `docs/06-FRONTEND-TEMPLATES.md`
(its Duolingo-styled base template is superseded by this brief, the route list still applies).

## 1. What already exists, do not rebuild it

| File | What it gives you |
| --- | --- |
| `src/app/globals.css` | All design tokens. Light and dark. Never write a raw hex anywhere else. |
| `src/lib/api.ts` | `api.get/post/patch/put/del`, `session.*`, `ApiError`, `idempotencyKey()` |
| `src/lib/types.ts` | Every DTO from doc 03 §0 |
| `src/lib/format.ts` | `formatVnd`, `formatVndShort`, `formatBps`, `formatDate`, `formatRelative`, `formatMinutes` |
| `src/components/ui/index.tsx` | Button, Card, CardBody, SectionTitle, LedgerLabel, StatStrip, ProgressBar, Chip, Field, Input, Select, Textarea, MoneyInput, Alert, EmptyState, Skeleton, ErrorPanel, Dialog, LedgerTable, `cx()` |
| `src/components/Providers.tsx` | `useSession`, `useMe`, `useStats`, `useFeatureFlag`, `useToast`, `BOOTSTRAP_KEY` |
| `src/components/AppShell.tsx` | Header, nav, footer |
| `src/app/(app)/layout.tsx` | Wraps every signed-in page in the shell and the session guard |

Signed-in pages go under `src/app/(app)/`. Public pages (`/`, `/login`, `/signup`, `/verify/[code]`)
go directly under `src/app/` so they do not get the shell.

The library is the one exception to rule 1 in §4 below. `/library` and `/library/[slug]` sit outside
`(app)`, render on the server and call `libraryService` directly rather than going through
`src/lib/api.ts`, because articles have to be readable signed out and indexable, which needs
`generateMetadata` and `generateStaticParams`. They are the only server-rendered read path in the
app. Keep it that way: everything else is a client page over TanStack Query.

## 2. Design system in one page

Ground is warm paper, ink is near-black green, the one accent is moss green.
Structure comes from hairline rules, not shadows or heavy borders.

- Headings render in the serif display face automatically (`h1`-`h3` in globals.css). Use `font-display` on other elements only when they are truly display type.
- Any number a reader might compare down a column carries `className="figure"` (tabular numerals). All money, all percentages, all counts in tables.
- Small uppercase captions use `className="ledger-label"`.
- Cards: `<Card><CardBody>…</CardBody></Card>`. Nothing gets a drop shadow except the account menu and toasts.
- Semantic color (`text-positive`, `bg-caution-soft`, `text-critical`) is for state only. It is never the brand accent.
- Spacing comes from flex or grid `gap`, not stacked margins.
- Wide content wraps in `<div className="scroll-x">` or uses `LedgerTable`, which already does.
- Every interactive element must be reachable by keyboard and show the focus ring (it is global, do not remove it).

## 3. Copy rules

- All UI copy is Vietnamese. Sentence case, no shouting.
- Never use an em dash, an en dash used as a dash, or the "not X, but Y" construction. Use a comma, a period, or rewrite. This applies to every string that ships.
- A button says what happens: "Nộp bài", then the toast says "Đã nộp bài".
- Errors say what went wrong and what to do next. No apologies.
- Money is always rendered by `formatVnd`. Never `${x} đ`.

## 4. Data rules (hard, from doc 06 §5)

1. No `fetch` in a component. Everything goes through `src/lib/api.ts`.
2. Server state goes through TanStack Query. Local UI state only in `useState`.
3. Money arrives as a decimal string of đồng. Never `Number()` it, never do arithmetic on it in the browser. If a screen needs a computed total, the server sends it.
4. After a mutation that grants XP, coins, badges or streak, invalidate `BOOTSTRAP_KEY` so the header updates.
5. Award-granting POSTs pass `idempotencyKey("scope", ...ids)` so a double click cannot double award.
6. Read `ApiError.ruleCode` for engine and business rule failures (422 `RULE_VIOLATION`), `ApiError.fieldErrors()` for form validation (400).

Query key convention: `["resource", ...identifiers]`, for example `["course", slug]`,
`["sim-session", sessionId]`, `["attempt", attemptId]`.

## 5. Every page must handle four states

Loading (`Skeleton`), error (`ErrorPanel` with a retry), empty (`EmptyState`), and content.
A page that renders `undefined` data during load is a defect, not a shortcut.

## 6. Simulation screens

- Read: `GET /sims/sessions/:id` returns `SimSessionView`.
- Act: `POST /sims/sessions/:id/actions` with `{ expectedStateVersion, action }`.
- On `ApiError.code === "VERSION_CONFLICT"` (409): refetch the session, show "Phiên đã thay đổi, đã tải lại", do not resend.
- Disable the action controls while a mutation is in flight. Never queue two actions.
- Render only actions present in `availableActions`. Do not hardcode the action list.
- Every sim screen shows the simulated-data disclaimer once, near the numbers.
- `turnReport` renders after an action resolves; `awards` renders as a small XP and coin line.

## 7. Definition of done for a page group

- `pnpm exec tsc --noEmit` is clean.
- No raw hex colors, no `fetch`, no client-side money math, no em dashes.
- Loading, error and empty states present.
- Keyboard reachable, labelled form fields, `aria-current` on active nav.
