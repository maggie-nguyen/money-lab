# MoneyLab - 04 · Simulation Engines Specification

Five engines. All are **server-authoritative deterministic state machines**: the client renders
`view` and posts actions; it never computes money outcomes. This doc defines, per engine:
Config (authored JSON in `sim_definition.config`), State (server-only), View (what the API returns),
Actions (what the client may post), Turn resolution (exact order of operations), End conditions,
Scoring/awards, and Error codes.

---

## §1 Common engine contract (`src/server/engines/types.ts`)

```ts
interface Engine<C, S, A, V> {
  type: SimType
  configSchema: ZodSchema<C>
  init(config: C, seed: number, optionsKey: string): S        // turn 0 state
  view(state: S, config: C, textBundle): V                     // strips secrets
  availableActions(state: S, config: C): ActionDescriptor[]
  applyAction(state: S, config: C, action: A, rng: Rng): 
    { state: S, resultDelta: object, turnAdvanced: boolean, turnReport?: object }
  isFinished(state: S): { finished: boolean, status: "COMPLETED"|"FAILED", summary?: object }
}
```

### 1.1 Determinism & RNG
- `sim_session.seed` is drawn once at session creation (`crypto.randomInt(2^31)`).
- All randomness uses **mulberry32(seed + turnNumber)** - implement in `lib/rng.ts`. Never
  `Math.random`. Replaying the action log against the same config+seed MUST reproduce the exact
  final state (golden test requirement, §8).

### 1.2 Transactionality & concurrency
Each `POST .../actions`: `SELECT sim_session FOR UPDATE` → check `expectedStateVersion` →
apply → write session (stateVersion+1, turnNumber maybe +1) + `sim_action_log` row + any XP ledger
rows, all in **one** transaction.

### 1.3 Secrets rule
`state` may contain hidden info (e.g. which scam messages are real, future price paths). `view()`
is the ONLY serialization sent to clients; write a unit test per engine asserting the view JSON
never contains the listed secret paths.

### 1.4 Text & i18n
Configs contain **no display strings**, only stable keys (`"eventKey": "evt_motorbike_repair"`).
`sim_definition_translation.textBundle` maps keys → localized strings. `view()` resolves them.

### 1.5 XP (uniform across engines)
- `SIM_TURN`: +5 XP per completed turn, capped at 10 turns per session.
- `SIM_COMPLETE`: `sim_definition.xpRewardComplete` (seed default 100), once per (user, sim) ever
  via the ledger guard; replays still get SIM_TURN XP (capped 50/day across all sims - enforce in
  gamificationService).
- Engine-specific badges listed per engine.

---

## §2 Engine `BUDGET` - "Tháng lương đầu tiên" (survive N months on a salary)

**Learning goal:** needs vs wants, fixed vs variable costs, emergency fund, 50/30/20.

### 2.1 Config (Zod: `budgetConfigSchema`)
```jsonc
{
  "months": 3,                                // 1..12
  "monthlyIncomeVnd": "6500000",
  "openingCashVnd": "1000000",
  "fixedBills": [                             // charged automatically at month start
    { "key": "bill_rent",   "amountVnd": "1800000" },
    { "key": "bill_phone",  "amountVnd": "120000" }
  ],
  "categories": [                             // player allocates into these
    { "key": "cat_food",      "kind": "NEED", "minVnd": "1200000", "recommendedVnd": "1800000" },
    { "key": "cat_transport", "kind": "NEED", "minVnd": "300000",  "recommendedVnd": "500000" },
    { "key": "cat_fun",       "kind": "WANT", "minVnd": "0",       "recommendedVnd": "800000" },
    { "key": "cat_clothes",   "kind": "WANT", "minVnd": "0",       "recommendedVnd": "400000" },
    { "key": "cat_savings",   "kind": "SAVING", "minVnd": "0",     "recommendedVnd": "1300000" }
  ],
  "events": [                                 // random events; weight-drawn 0..2 per month
    { "key": "evt_motorbike_repair", "weight": 3, "type": "EXPENSE", "amountVnd": "700000",
      "choices": [
        { "key": "ch_pay_now",  "effect": { "cashVnd": "-700000" } },
        { "key": "ch_delay",    "effect": { "cashVnd": "-200000", "nextMonthExtraVnd": "700000" } }
      ] },
    { "key": "evt_bonus", "weight": 1, "type": "INCOME", "amountVnd": "500000", "choices": [] },
    { "key": "evt_friend_borrow", "weight": 2, "type": "CHOICE", "amountVnd": "300000",
      "choices": [
        { "key": "ch_lend",    "effect": { "cashVnd": "-300000", "repayChanceBps": 6000, "repayMonthOffset": 1 } },
        { "key": "ch_decline", "effect": {} }
      ] }
  ],
  "allowDebt": false,                         // if false, cash<0 at month end = FAILED
  "eventCountPerMonth": { "min": 0, "max": 2 },
  "presets": { "default": {}, "hard": { "monthlyIncomeVnd": "5200000" } }  // optionsKey overrides
}
```

### 2.2 State
```ts
{ month: 1..months, phase: "ALLOCATE"|"EVENTS"|"REVIEW",
  cashVnd: bigint, savingsVnd: bigint,
  allocations: Record<catKey, bigint>,        // this month's plan
  pendingEvents: EventInstance[],             // drawn for this month, unresolved first
  carryoverExtraVnd: bigint, pendingRepays: [{month, amountVnd, chanceBps}],
  history: MonthReport[] }
```
Secrets: none (all visible) - but future months' event draws don't exist yet (drawn at month start).

### 2.3 Actions & turn flow (one month = one turn; 3 phases)
1. Phase `ALLOCATE` - action `{ type: "SET_ALLOCATIONS", allocations: Record<catKey, stringVnd> }`
   Validation: every configured category present; each ≥ its `minVnd` for NEED kinds
   (else 422 `ALLOC_BELOW_MIN`); sum ≤ cash + income this month (else 422 `OVERSPEND_LIMIT`).
   On success: income credited, fixed bills + carryover charged (charge order: income → bills →
   carryover → allocations reserve), phase→EVENTS, events drawn via RNG (weights).
2. Phase `EVENTS` - for each pending event with choices, action
   `{ type: "RESOLVE_EVENT", eventKey, choiceKey }` (422 `EVENT_NOT_PENDING` / `BAD_CHOICE`).
   Choice effects applied (repayChance resolved with RNG at the offset month). Choiceless events
   auto-apply when drawn. When none pending → phase→REVIEW automatically.
3. Phase `REVIEW` - action `{ type: "END_MONTH" }`:
   unspent NEED/WANT allocation returns to cash; SAVING allocation moves to `savingsVnd`
   (plus monthly interest `savings · 40 bps`, rounded); MonthReport appended
   `{ month, incomeVnd, spentByCategory, savedVnd, cashEndVnd, events }`; turnNumber++; month++,
   phase→ALLOCATE (or finish).

### 2.4 End & scoring
- FAILED if `cashVnd < 0` at any END_MONTH and `allowDebt=false`.
- COMPLETED after final END_MONTH. Summary:
  `{ finalNetWorthVnd: cash+savings, savingsRatePct, needsWantsSavePct: [n,w,s], eventsHandled,
     grade: "A"(save≥20% & never below 0)... "D", tips: [textKeys] }`
- Badge `SIM_BUDGET_SURPLUS`: COMPLETED with savingsRate ≥ 20%.

### 2.5 View additions
`view.hint` (canned, non-LLM): rule-based - e.g. if fun > 30% income → `hint_wants_high`.

---

## §3 Engine `LOANS` - "Vay khôn ngoan" (choose & manage a loan)

**Learning goal:** interest cost, term tradeoffs, effective rate, hidden fees, early repayment,
predatory lending ("tín dụng đen") red flags.

### 3.1 Config
```jsonc
{
  "goalKey": "goal_laptop", "goalPriceVnd": "18000000",
  "playerCashVnd": "4000000", "monthlyBudgetVnd": "2500000",   // max repay capacity per month
  "offers": [
    { "key": "offer_bank",   "principalVnd": "14000000", "annualRateBps": 1400, "termMonths": 12,
      "method": "ANNUITY", "upfrontFeeVnd": "200000", "earlyRepayPenaltyBps": 200, "legit": true },
    { "key": "offer_retail", "principalVnd": "14000000", "annualRateBps": 0, "termMonths": 6,
      "method": "ANNUITY", "upfrontFeeVnd": "1400000", "earlyRepayPenaltyBps": 0, "legit": true,
      "marketingKey": "mk_zero_percent" },                    // the "0%" trap: fee = hidden interest
    { "key": "offer_app",    "principalVnd": "14000000", "annualRateBps": 9500, "termMonths": 12,
      "method": "DECLINING_BALANCE", "upfrontFeeVnd": "0", "earlyRepayPenaltyBps": 0, "legit": false,
      "redFlags": ["rf_no_license", "rf_contact_access", "rf_daily_calls"] }
  ],
  "incomeEvents": [ { "key": "evt_overtime", "weight": 2, "amountVnd": "800000" },
                    { "key": "evt_income_drop", "weight": 2, "amountVnd": "-900000" } ],
  "months": 12
}
```
Secrets in state: none, but `legit` and computed `effectiveAnnualRateBps` are **hidden until the
player uses the COMPARE action or finishes** (discovery is the pedagogy).

### 3.2 Flow (phase machine)
1. `CHOOSE` phase actions:
 - `{ type: "COMPARE", offerKeys: [..] }` → resultDelta reveals per-offer
     `{ monthlyPaymentVnd, totalCostVnd, effectiveAnnualRateBps }` (computed with doc 03 §8
     formulas + fees amortized). Unlimited, free - teaches comparison. Reveals redFlags for
     non-legit offers only after 2+ compares that include them (config: `redFlagRevealAfter: 2`).
 - `{ type: "TAKE_LOAN", offerKey }` → cash += principal − upfrontFee; buy goal (cash −= price;
     422 `INSUFFICIENT_CASH` if still short); phase→REPAY.
 - `{ type: "PAY_CASH_WAIT", months: n }` - alternative path: save `monthlyBudgetVnd` for n
     months then buy outright; jumps to end with its own summary (teaches "waiting is an option").
2. `REPAY` phase, per month-turn: income event drawn; then exactly one of
 - `{ type: "PAY_SCHEDULED" }` (422 `INSUFFICIENT_CASH` if cash < payment → must RESTRUCTURE)
 - `{ type: "PAY_EXTRA", extraVnd }` (reduces principal; penalty applied; 422 `EXTRA_TOO_SMALL` < 100000)
 - `{ type: "RESTRUCTURE" }` (once per game: term +3 months, rate +200 bps - models real cost of missing payments; second attempt → FAILED "default")
3. End: loan cleared (COMPLETED) or default (FAILED) or months exhausted.

### 3.3 Summary & scoring
`{ chosenOfferKey, totalInterestAndFeesVnd, vsBestOfferDeltaVnd, monthsToClear,
   effectiveRatePaidBps, grade, insights: [textKeys /* e.g. ins_zero_pct_trap if retail chosen */] }`
Badge `SIM_LOANS_SAVER`: cleared with total cost within 5% of the mathematically cheapest path.
Choosing `legit:false` offer never FAILs immediately - it plays out with brutal numbers + harassment
event keys, ending in insight `ins_black_credit`; that's the lesson.

---

## §4 Engine `SCAM` - "Nhận diện lừa đảo" (spot the scam, inbox game)

**Learning goal:** recognizing phishing, OTP scams, ponzi, fake investment, impersonation.
**Safety:** content shows recognition cues only; templates come from the curated textBundle
(doc 05 §7 checklist forbids reusable perpetration detail).

### 4.1 Config
```jsonc
{
  "rounds": 10,
  "timerSecondsPerRound": null,               // no timer in v1
  "pool": [                                   // ≥ 2× rounds items; drawn without replacement
    { "key": "msg_bank_otp",    "channel": "SMS",  "isScam": true,
      "scamType": "OTP_PHISHING", "cues": ["cue_urgent", "cue_link_odd", "cue_asks_otp"] },
    { "key": "msg_real_promo",  "channel": "EMAIL", "isScam": false, "cues": [] },
    { "key": "msg_invest_30pct","channel": "ZALO", "isScam": true,
      "scamType": "PONZI", "cues": ["cue_guaranteed_return", "cue_pressure_recruit"] }
    // … seed ≥ 24 items
  ],
  "livesMode": false,
  "scoring": { "correctFlag": 10, "correctTrust": 10, "missedScam": -10, "falseAlarm": -5,
               "cueBonusEach": 2 }
}
```
**Secrets:** `isScam`, `scamType`, `cues` of the *current* undecided item MUST NOT appear in view.

### 4.2 Flow (one round = one turn)
- View shows current item: resolved message text (from textBundle), channel, sender display.
- Action `{ type: "DECIDE", verdict: "SCAM"|"SAFE", cueKeys?: string[] }` - cueKeys optional
  (player highlights suspicious parts; only scored when verdict correct & item is scam).
- resultDelta reveals truth `{ correct, isScam, scamType, cues, explanationKey, pointsDelta }` -
  immediate feedback is the core loop.
- After N rounds → COMPLETED. No FAILED state.

### 4.3 Summary
`{ score, maxScore, accuracyPct, byScamType: [{type, seen, caught}], missedKeys, grade }`
Badge `SIM_SCAM_DETECTIVE`: accuracy ≥ 90% with rounds ≥ 10.

---

## §5 Engine `BUSINESS` - "Quán nước của tôi" (run a drink stall N weeks)

**Learning goal:** revenue/cost/profit, unit economics, pricing vs demand, inventory & spoilage,
reinvestment.

### 5.1 Config (abridged - same rigor as above)
```jsonc
{
  "weeks": 8, "openingCashVnd": "3000000",
  "product": { "key": "prod_tra_chanh", "unitCostVnd": "6000", "spoilagePctBpsPerWeek": 2000 },
  "demandCurve": { "basePriceVnd": "15000", "baseDemandUnits": 120, "elasticity": -1.6,
                   "noiseBps": 1500 },        // demand = base · (price/basePrice)^elasticity · noise
  "weather": [ { "key": "w_sunny", "weight": 5, "demandMultBps": 12000 },
               { "key": "w_rain",  "weight": 3, "demandMultBps": 6000 } ],
  "upgrades": [ { "key": "up_sign",    "costVnd": "500000",  "demandMultBps": 11000 },
                { "key": "up_fridge",  "costVnd": "1500000", "spoilageMultBps": 3000 } ],
  "fixedCostPerWeekVnd": "200000",
  "events": [ { "key": "evt_inspection", "weight": 1, "costVnd": "300000" } ]
}
```

### 5.2 Turn (one week): action `{ type: "PLAN_WEEK", priceVnd, unitsToStock, buyUpgradeKeys?: [] }`
Validation: stock cost + upgrades ≤ cash (`INSUFFICIENT_CASH`); price 1000..100000.
Resolution order (exact): pay fixed cost → buy upgrades → buy stock → draw weather →
compute demand (formula above, floor to int, RNG noise) → unitsSold = min(demand, stock) →
revenue → spoilage on unsold (config pct, fridge reduces) → event draw → weekReport.
FAILED if cash < 0 after resolution. COMPLETED after final week.

### 5.3 Summary
`{ totalProfitVnd, bestWeek, avgMarginPct, missedDemandUnits, spoiledUnits, grade, insights }`
Badge `SIM_BUSINESS_PROFIT`: COMPLETED with totalProfit > 0.
**View secret:** next weeks' weather and the demand formula parameters (elasticity, noise) are
hidden; players discover price sensitivity by experimenting.

---

## §6 Engine `INVEST` - "Danh mục đầu tiên" (12-turn portfolio with fake assets)

**Learning goal:** risk vs return, diversification, volatility, fees, FOMO/panic behavior,
long-horizon thinking. **All assets are fictional** (no real tickers - legal safety).

### 6.1 Config
```jsonc
{
  "turns": 12, "turnLabelKey": "quarter",     // 12 quarters = 3 simulated years
  "startingCashVnd": "20000000",
  "assets": [
    { "key": "as_savings",  "class": "DEPOSIT", "meanReturnBps": 120,  "volBps": 10,   "feeBps": 0 },
    { "key": "as_bond",     "class": "BOND",    "meanReturnBps": 200,  "volBps": 300,  "feeBps": 20 },
    { "key": "as_bluechip", "class": "STOCK",   "meanReturnBps": 350,  "volBps": 1200, "feeBps": 30 },
    { "key": "as_hotcoin",  "class": "CRYPTO",  "meanReturnBps": 500,  "volBps": 4500, "feeBps": 50,
      "crashChanceBps": 800, "crashSizeBps": -6000 }
  ],
  "newsEvents": [   // shown BEFORE the turn's returns; some are noise (teaches: news ≠ signal)
    { "key": "news_hotcoin_hype", "affects": "as_hotcoin", "biasBps": 0, "weight": 3 },
    { "key": "news_rate_cut", "affects": "as_bond", "biasBps": 150, "weight": 2 }
  ],
  "rebalanceFeeVnd": "10000"                  // per buy/sell order, flat
}
```

### 6.2 State & secrets
Per-turn returns are pre-generated at `init` for ALL turns from the seed (lognormal:
`return = meanReturnBps + volBps · gauss(rng)`, crash check per turn) and stored in state as
`pricePath` - **absolute secret**, never in view. News events are drawn per turn; their `biasBps`
already baked into the pre-generated path when non-zero.

### 6.3 Turn: view shows current holdings, prices so far (chart series), this turn's news.
Action `{ type: "REBALANCE", orders: [{ assetKey, action: "BUY"|"SELL", amountVnd }] }`
(empty orders = hold, always legal). Validation: sells ≤ holdings, buys ≤ cash after sells+fees
(`INSUFFICIENT_CASH`). Then the turn's returns apply, fees deducted, turnReport returned
`{ turn, newsKey, perAsset: [{key, returnBps, valueVnd}], portfolioValueVnd, benchmarkValueVnd }`.
Benchmark = 100% as_savings buy-and-hold (humble but instructive).

### 6.4 End & summary (after turn 12)
`{ finalValueVnd, totalReturnBps, benchmarkReturnBps, maxDrawdownBps,
   herfindahlIndex /* concentration 0..10000 */, tradesCount, feesPaidVnd,
   behaviorFlags: ["flag_panic_sell" /* sold >50% of an asset the turn after it dropped >15% */,
                   "flag_fomo_buy", "flag_diversified"], grade, insights }`
Badge `SIM_INVEST_DIVERSIFIED`: finish with HHI ≤ 4000 and ≥ 3 asset classes held ≥ 6 turns.

---

## §7 Engine-specific error codes (returned as 422 `RULE_VIOLATION`, `details[0].message`)

`ALLOC_BELOW_MIN, OVERSPEND_LIMIT, EVENT_NOT_PENDING, BAD_CHOICE, INSUFFICIENT_CASH,
EXTRA_TOO_SMALL, RESTRUCTURE_EXHAUSTED, WRONG_PHASE, UNKNOWN_ACTION, BAD_ASSET, SELL_EXCEEDS_HOLDING,
PRICE_OUT_OF_RANGE, STOCK_NEGATIVE, DECIDE_DUPLICATE`

## §8 Test requirements (blocking for merge)

1. **Golden replay** per engine: fixture file `tests/engines/{type}.golden.json` = config + seed +
   action list + expected final state hash. CI fails if hash changes (intentional changes update
   the fixture in the same PR).
2. Property test: 200 random action sequences per engine → never throws non-AppError, money fields
   never NaN/negative-where-forbidden, view never contains secret paths (path denylist per engine).
3. Formula tests: LOANS compare must equal `/tools/loan-*` outputs to the đồng for the same inputs.
4. Every error code in §7 has at least one test that triggers it.
