# MoneyLab - 05 · Content Authoring Schema & Curriculum Skeleton

Content is authored as JSON files in `content/` (git-reviewed) and imported via
`POST /admin/import` (doc 03 §14.2), or edited directly in the admin CMS. Both paths validate with
the same Zod schemas in `src/server/schemas/content.ts`.

## §1 Bundle file format

One file per course: `content/{locale}/{track-slug}/{course-slug}.json`
```jsonc
{
  "$schema": "moneylab-content-v1",
  "track": { "slug": "nen-tang-tien-bac", "order": 1,
             "i18n": { "vi": { "title": "Nền tảng tiền bạc", "subtitle": "...", "description": "..." } } },
  "course": { "slug": "ngan-sach-va-tiet-kiem", "order": 1, "level": 1, "estimatedMinutes": 45,
              "xpReward": 50,
              "i18n": { "vi": { "title": "Ngân sách và tiết kiệm", "subtitle": "...",
                                 "description": "...", "learningObjectives": ["...", "..."] } },
              "modules": [ { "slug": "phan-1", "order": 1, "i18n": { "vi": { "title": "..." } } } ],
              "lessons": [ <Lesson>... ],
              "finalQuiz": <Quiz> | null }
}
```
Import upserts by slug and never deletes: removals happen in the CMS, so a bad merge cannot wipe
published content. Every referenced url must be `https://`. The importer leaves everything `DRAFT`;
publishing is a separate, audited action (the seed publishes what it imports).

### §1.1 Article file format

Standalone articles live in one file, `content/{locale}/articles.json`, because they carry no
modules, quizzes or progress. An article is a lesson without any of that:

```jsonc
{ "$schema": "moneylab-articles-v1",
  "articles": [
    { "slug": "nam-dau-hieu-cua-mot-tin-nhan-lua-dao",
      "category": "GUIDE",                              // GUIDE | EXPLAINER | NEWS | STORY
      "relatedCourseSlug": "vay-no-va-lua-dao",         // optional, links the article to a course
      "readMinutes": 4, "authorName": "MoneyLab",
      "publishedDaysAgo": 2,                            // dated relative to the seed run
      "i18n": { "vi": { "title": "...", "summary": "...", "seoTitle": "...",
                        "seoDescription": "...", "blocks": [ <Block>... ] } } }
  ] }
```

`CHECK_QUESTION` blocks are stripped from article payloads at the service boundary, since there is
no lesson-scoped grading endpoint behind them. The file is validated in `prisma/seed.ts` against the
same `blockSchema` the CMS enforces, so a malformed article fails the seed loudly rather than
writing blocks the renderer cannot draw.

## §2 Lesson object
```jsonc
{ "slug": "vi-sao-can-ngan-sach", "order": 1, "moduleSlug": "phan-1" /* or null */,
  "estimatedMinutes": 6, "xpReward": 20,
  "i18n": { "vi": { "title": "...", "summary": "...", "blocks": [ <Block>... ] } },
  "checkQuiz": <Quiz> | null }
```

## §3 Block types (the `blocks` array; discriminated union on `type`)

One vocabulary, spoken by the authored JSON, the admin editor, the `blocks` JSON column and the
renderer alike: `blockSchema` in `src/server/schemas/content.ts` is the source of truth, and `Block`
in `src/lib/types.ts` mirrors it. Text fields are **plain text, not Markdown**. The renderer prints
them as written, so a block is what it says it is. Articles use the same union (doc 02, `Article`).

| type | fields | rules |
|---|---|---|
| `HEADING` | `text`, `level?: 2 \| 3` | ≤ 200 chars. Also builds the lesson outline rail |
| `PARAGRAPH` | `text` | ≤ 2000 chars. One idea per block |
| `LIST` | `items: string[]`, `ordered?` | 2–12 items, ≤ 400 chars each |
| `CALLOUT` | `variant?: "INFO" \| "WARNING" \| "TIP"`, `title?`, `text` | ≤ 800 chars |
| `IMAGE` | `url` (https), `alt` (required), `caption?` | |
| `VIDEO` | `url` (https), `caption?` | YouTube watch, short or embed urls are all accepted and rendered through `youtube-nocookie.com`. Every id is checked by `pnpm content:verify` before it ships |
| `TABLE` | `headers: string[]`, `rows: string[][]`, `caption?` | ≤ 6 cols, ≤ 20 rows. First column renders left aligned, the rest as figures |
| `KEY_TERM` | `term`, `definition` | the one definition the lesson turns on |
| `EXAMPLE` | `title?`, `text` | ≤ 1200 chars. A named person with real numbers beats an abstraction |
| `CHECK_QUESTION` | `question: <InlineQuestion>` | inline formative question, see §3.1 |
| `CALCULATOR` | `tool`, `presets?` | links to `/tools/{tool}`, see §3.2 |
| `SIM_LINK` | `simSlug`, `label?` | links to `/sims?start={simSlug}`, see §3.3 |
| `DIVIDER` | - | |

Rules of thumb the importer reports as **warnings** (never errors, an editor may have a reason):
5–12 blocks per lesson, at least one `CHECK_QUESTION`, at least one `VIDEO`.

### §3.1 Inline check questions

Narrower than the quiz questions in §4, because these are graded in a browser round trip by
`POST /catalog/lessons/{idOrSlug}/check/{questionId}` rather than as part of an attempt:

```jsonc
{ "type": "CHECK_QUESTION",
  "question": { "id": "ngan-sach-de-lam-gi",           // kebab-case, unique within the lesson
                "type": "SINGLE_CHOICE",                // or MULTI_CHOICE, TRUE_FALSE. Nothing else
                "prompt": "Ngân sách chủ yếu giúp bạn điều gì?",
                "options": [ { "key": "a", "text": "..." }, { "key": "b", "text": "..." } ],
                "answerKey": { "correct": "b" },        // stripped from the catalog payload
                "explanation": "..." } }                 // flat, not per-locale
```

Formative only: nothing is stored, no XP is granted, and retries are unlimited.

### §3.2 CALCULATOR presets

`tool` must be one of the six tool slugs: `compound-interest`, `loan-payment`, `loan-compare`,
`savings-goal`, `inflation`, `budget-503020`. `presets` are passed to `/tools/{tool}` as query
parameters and become the initial field values, so the learner lands on the numbers from the lesson.
Keys that the tool does not know, and values that are not plain digits, are ignored, which is what
keeps a hand-edited url from putting the form into a state the tool endpoints would reject.

| tool | preset keys |
|---|---|
| `compound-interest` | `principalVnd`, `contributionVnd`, `ratePercent`, `years` |
| `loan-payment` | `principalVnd`, `ratePercent`, `termMonths` |
| `savings-goal` | `goalVnd`, `currentVnd`, `ratePercent`, `contributionVnd` |
| `inflation` | `amountVnd`, `ratePercent`, `years` |
| `budget-503020` | `incomeVnd` |
| `loan-compare` | none, the tool compares two loans the learner enters |

### §3.3 SIM_LINK

`simSlug` must match a seeded sim definition. The block links to the hub as `/sims?start={simSlug}`,
not to a sim screen: sim screens live at `/sims/{type}/{sessionId}` and a session has to be created
or resumed first, which is the hub's job. `pnpm content:links` clicks both this block and
`CALCULATOR` for real and asserts where they land.

## §4 Question payloads & answer keys (per `QuestionType`)

Common: `{ "type": ..., "points": 1, "i18n": { "vi": { "prompt": "...", "explanation": "..." } } }`
`explanation` is required - it is shown after submit and is where the teaching happens.

| type | payload (public) | answerKey (server-only) | response shape | scoring |
|---|---|---|---|---|
| SINGLE_CHOICE | `options: [{key, i18n text}]` (2..6) | `{ correct: "b" }` | `{ choice: "b" }` | all-or-nothing |
| MULTI_CHOICE | same (3..8) | `{ correct: ["a","c"] }` | `{ choices: [...] }` | partial: `max(0, right−wrong)/rightTotal · points`, round half-up |
| TRUE_FALSE | - | `{ correct: true }` | `{ value: true }` | all-or-nothing |
| NUMERIC | `{ unit?: "VND"|"%"|"months", inputHint? }` | `{ value: "8884879", toleranceAbs?: "1000", toleranceBps?: 100 }` | `{ value: "8884000" }` | within either tolerance → full |
| ORDERING | `items: [{key, text}]` (3..6, shown shuffled) | `{ order: ["k1","k2",...] }` | `{ order: [...] }` | full only if exact |
| MATCHING | `left: [...], right: [...]` (3..5 pairs, right shuffled) | `{ pairs: {"l1":"r2",...} }` | `{ pairs: {...} }` | partial per correct pair |
| SCENARIO_CHOICE | `scenarioMd` + options, each option has `feedbackI18n` | `{ best: "b", acceptable: ["c"] }` | `{ choice }` | best=full, acceptable=half (round half-up), else 0 |

## §5 Curriculum skeleton (what the content team fills in - maps the brief's 7 topic areas)

Track 1 **Nền tảng tiền bạc** (Money Basics) - L1
1. Kiếm tiền & giá trị lao động (earning) · 2. Chi tiêu & nhu cầu vs mong muốn ·
3. **Ngân sách và tiết kiệm** (seed course, 6 lessons: why budget / 50/30/20 / emergency fund /
saving habits / interest basics / month-plan capstone → SIM_LAUNCHER: BUDGET)
Track 2 **Ngân hàng & thanh toán số** - L1: accounts, cards, MoMo/ZaloPay/bank apps, OTP & security
→ SIM: SCAM. Credit & debt, loans → SIM: LOANS.
Track 3 **Rủi ro & bảo vệ** - L2: insurance basics, scams deep-dive, taxes intro (VN PIT sketch).
Track 4 **Đầu tư & kinh doanh** - L2/3: inflation & interest rates, investing & diversification
→ SIM: INVEST; how businesses make money → SIM: BUSINESS.
Track 5 **Quyết định lớn** - L3: education ROI, first job offers, renting vs family, big purchases.

Source mapping note for authors: cross-check each course outline against FDIC Money Smart 9–12,
CFPB Youth, NGPF units, and Khan Academy Financial Literacy; localize numbers (VND salaries, VN
bank products, VN scam patterns) - never translate US tax/credit-score content literally.
**Vietnam-specific must-haves:** no credit-score system → explain CIC instead; hụi/họ (rotating
savings) risks; tín dụng đen; MoMo/ZaloPay/VietQR flows; VN deposit insurance (BHTG, 125M đ).

## §6 Import validation order (importer must report ALL errors, not fail-fast)
1. JSON parse → 2. Zod shape → 3. slug uniqueness within bundle → 4. cross-refs (moduleSlug,
simSlug, quiz question keys) → 5. answerKey consistency (correct keys exist in options) →
6. media URLs → 7. warnings (block heuristics §3). Response: doc 03 §14.2 dry-run report.

## §7 Vietnamese language standard (applies to lesson and article content AND to every string in
the interface, so the two never read as written by different people)

**Orthography.** Tone marks follow the placement taught in Vietnamese schools: `khóa`, `hóa`,
`xóa`, `hủy`, `tùy`, `hòa`, `tỏa`, `dọa`, `họa`, `lũy`. The alternative placement (`khoá`, `hoá`)
is not wrong in general Vietnamese, but a platform read by students should spell words the way
their textbooks do, and mixing both conventions in one product looks careless. Closed syllables
(`hoàn`, `toàn`, `khoản`, `hoạt`, `loại`) are unaffected, and `qu` is a digraph so `quỹ`, `quý`
stay as they are.

**One word per concept.** The audience is `học sinh`, never `học viên` or `người học`. A
simulation is something the learner `làm` or `hoàn thành`, never `chơi`, and it has `tình huống`
rather than `vòng` or `lượt chơi`. Answer feedback is `Chính xác` / `Chưa chính xác` everywhere;
quiz outcome is `Đạt` / `Chưa đạt`. The AI feature is `Trợ giảng MoneyLab` in the navigation, in
its own system prompt and in every empty state.

**Register.** Address the learner as `bạn` and keep it consistent, including on the public pages
that parents and teachers also read. No survival or gaming vocabulary (`sống sót`, `săn`, `lượt
chơi`), no chatty sentence-final particles (`nhé`, `nha`, `đấy`), no exclamation marks. Interrogative
headings take a question mark.

**Do not translate English sentence shapes.** Vietnamese drops the possessive where English keeps
it: `Nhập câu hỏi`, not `Nhập câu hỏi của bạn`. Keep `của bạn` only where it disambiguates whose
thing is meant (`Hạng của bạn`, `email của bạn`). A dash standing in for an English em dash is a
translation tell: use a comma, a colon or a second sentence instead.

**Truth in framing.** A teaching scenario built for the course is `một tình huống điển hình`, never
`chuyện có thật`. Invented names and numbers must not be presented as reported fact.

**Typography.** These are the rules that stop three authors reading as three products. Each one is
enforced mechanically by `pnpm content:lang`.

| Rule | Write | Not |
| --- | --- | --- |
| Currency in prose | `12.000.000 đồng` | `12.000.000đ`, `12 triệu` |
| Currency in a table cell | `12.000.000 ₫` | `12.000.000 đồng` (no room) |
| Rate in prose | `24% một năm`, `2,5% một tháng` | `24%/năm` |
| Rate in a table cell | `24%/năm` | spelled out |
| Ranges in prose | `1 đến 2 triệu`, `ba đến sáu tháng` | `1-2 triệu` |
| Conjunction in a title | `Ngân sách và tiết kiệm` | `Ngân sách & Tiết kiệm` |
| The budgeting rule | `50/30/20` | `50-30-20` |
| Quoted copy | `"Tháng lương đầu tiên"` | `'Tháng lương đầu tiên'` |
| Recurring period | `hằng tháng`, `hằng tuần` | `hàng tháng` |
| Emphasis | plain words, or the sentence carries it | `LUÔN`, `TẤT CẢ`, `NHU CẦU` |
| Connectives | write them out: `rồi`, `sau đó`, `nên` | `→` |

All-caps emphasis is an English style-guide habit; Vietnamese carries emphasis in word order and
in the sentence itself, so a shouted word reads as a machine translation. Arrows have the same
problem: they are fine as a decorative glyph on a link, and wrong inside a sentence a student reads
aloud.

**Sentence shape in explanations.** A quiz explanation states the reason directly. It never opens
with `Đúng.` or `Sai.`, because the interface has already told the learner whether the answer was
right, and repeating it wastes the one line they actually read. Write `Khoản trả hằng tháng thấp
thường chỉ có nghĩa là kỳ hạn dài`, not `Sai. Khoản trả hằng tháng thấp...`.

**Exemptions.** The gate skips code comments, JSON lines holding a single quoted scalar (a table
cell, where the compact forms above are correct), and the seeded `msg_*` bundle. That bundle is
quoted scam bait and quoted brand SMS: a scam text rewritten in house style would be a worse
teaching artifact than a real one, so it keeps its shouting, its missing diacritics and its glued
`đ`.

## §8 Content review checklist (the mentor's audit - stored as `docs/checklists/content.md`, one
row ticked per lesson before publish)
- [ ] Factually correct for Vietnam 2026 (rates, laws, product names)
- [ ] Reading level ≈ grade 9; sentences ≤ 25 words; jargon defined via CALLOUT DEFINITION
- [ ] No real brand endorsements; banks/apps named only descriptively
- [ ] Scam content: shows recognition cues ONLY - no working scripts, no tool names, no
      step-by-step perpetration flow
- [ ] Every quiz question has a non-trivial `explanation`
- [ ] No personalized financial advice phrasing ("bạn nên mua...") - always framed as concepts
- [ ] Numbers verified against `/tools/*` calculators where applicable
- [ ] Vietnamese follows §7: textbook tone placement, the fixed vocabulary, `bạn` throughout, no
      gaming register, no untranslated English sentence shapes
