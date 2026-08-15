import { describe, expect, it } from "vitest";
import { AppError } from "@/server/lib/errors";
import { getEngine } from "@/server/engines";
import { applyPreset, type EngineJson } from "@/server/engines/types";
import { turnRng } from "@/server/lib/rng";
import { SEED_CONFIGS } from "./harness";
import type { SimType } from "@prisma/client";

// doc 04 §7 - every engine error code has at least one triggering test.
// Engines return 422 RULE_VIOLATION with the machine code in details[0].message.

function expectCode(code: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    const err = e as AppError;
    expect(err.code).toBe("RULE_VIOLATION");
    expect(err.details?.[0]?.message).toBe(code);
    return;
  }
  throw new Error(`expected RULE_VIOLATION ${code}, but no error was thrown`);
}

function fresh(type: SimType, configOverride?: EngineJson) {
  const config = { ...SEED_CONFIGS[type], ...(configOverride ?? {}) };
  const engine = getEngine(type);
  const cfg = applyPreset(config, "default");
  const state = engine.init(config, 42, "default");
  const apply = (s: EngineJson, action: EngineJson, turn = 0) =>
    engine.applyAction(s, cfg, action, turnRng(42, turn));
  return { engine, cfg, state, apply, config };
}

// A BUDGET config that always draws exactly one CHOICE event (deterministic EVENTS phase)
const BUDGET_ONE_CHOICE_EVENT: EngineJson = {
  eventCountPerMonth: { min: 1, max: 1 },
  events: [
    {
      key: "evt_choice_only",
      weight: 1,
      type: "CHOICE",
      amountVnd: "100000",
      choices: [{ key: "ch_ok", effect: {} }],
    },
  ],
};

const VALID_BUDGET_ALLOCATIONS = {
  cat_food: "1200000",
  cat_transport: "300000",
  cat_fun: "0",
  cat_clothes: "0",
  cat_savings: "0",
};

describe("BUDGET", () => {
  it("ALLOC_BELOW_MIN - missing category", () => {
    const { state, apply } = fresh("BUDGET");
    expectCode("ALLOC_BELOW_MIN", () =>
      apply(state, { type: "SET_ALLOCATIONS", allocations: { cat_food: "1200000" } }),
    );
  });
  it("ALLOC_BELOW_MIN - NEED below its minimum", () => {
    const { state, apply } = fresh("BUDGET");
    expectCode("ALLOC_BELOW_MIN", () =>
      apply(state, {
        type: "SET_ALLOCATIONS",
        allocations: { ...VALID_BUDGET_ALLOCATIONS, cat_food: "1" },
      }),
    );
  });
  it("OVERSPEND_LIMIT - sum exceeds cash + income", () => {
    const { state, apply } = fresh("BUDGET");
    expectCode("OVERSPEND_LIMIT", () =>
      apply(state, {
        type: "SET_ALLOCATIONS",
        allocations: { ...VALID_BUDGET_ALLOCATIONS, cat_savings: "999999999" },
      }),
    );
  });
  it("WRONG_PHASE - END_MONTH during ALLOCATE", () => {
    const { state, apply } = fresh("BUDGET");
    expectCode("WRONG_PHASE", () => apply(state, { type: "END_MONTH" }));
  });
  it("EVENT_NOT_PENDING - resolving a key that was not drawn", () => {
    const { state, apply } = fresh("BUDGET", BUDGET_ONE_CHOICE_EVENT);
    const inEvents = apply(state, { type: "SET_ALLOCATIONS", allocations: VALID_BUDGET_ALLOCATIONS }).state;
    expect((inEvents as { phase: string }).phase).toBe("EVENTS");
    expectCode("EVENT_NOT_PENDING", () =>
      apply(inEvents, { type: "RESOLVE_EVENT", eventKey: "evt_ghost", choiceKey: "ch_ok" }),
    );
  });
  it("BAD_CHOICE - pending event, unknown choice", () => {
    const { state, apply } = fresh("BUDGET", BUDGET_ONE_CHOICE_EVENT);
    const inEvents = apply(state, { type: "SET_ALLOCATIONS", allocations: VALID_BUDGET_ALLOCATIONS }).state;
    expectCode("BAD_CHOICE", () =>
      apply(inEvents, { type: "RESOLVE_EVENT", eventKey: "evt_choice_only", choiceKey: "ch_ghost" }),
    );
  });
  it("UNKNOWN_ACTION", () => {
    const { state, apply } = fresh("BUDGET");
    expectCode("UNKNOWN_ACTION", () => apply(state, { type: "HACK_THE_BANK" }));
  });
});

describe("LOANS", () => {
  it("BAD_CHOICE - unknown offer", () => {
    const { state, apply } = fresh("LOANS");
    expectCode("BAD_CHOICE", () => apply(state, { type: "TAKE_LOAN", offerKey: "offer_ghost" }));
  });
  it("INSUFFICIENT_CASH - principal minus fee still cannot buy the goal", () => {
    const { state, apply } = fresh("LOANS", { playerCashVnd: "0", goalPriceVnd: "99000000" });
    expectCode("INSUFFICIENT_CASH", () => apply(state, { type: "TAKE_LOAN", offerKey: "offer_bank" }));
  });
  it("WRONG_PHASE - PAY_SCHEDULED before taking a loan", () => {
    const { state, apply } = fresh("LOANS");
    expectCode("WRONG_PHASE", () => apply(state, { type: "PAY_SCHEDULED" }));
  });
  it("EXTRA_TOO_SMALL - PAY_EXTRA below 100,000 đ", () => {
    const { state, apply } = fresh("LOANS");
    const repay = apply(state, { type: "TAKE_LOAN", offerKey: "offer_bank" }).state;
    expectCode("EXTRA_TOO_SMALL", () => apply(repay, { type: "PAY_EXTRA", extraVnd: "99999" }, 1));
  });
  it("INSUFFICIENT_CASH - scheduled payment unaffordable", () => {
    // Cash exactly covers goal+fee (18M+0.2M−14M loan = 4.2M), leaving 0 đ; with no
    // monthly budget or income, the ~1.26M scheduled payment cannot be met.
    const { state, apply } = fresh("LOANS", {
      playerCashVnd: "4200000",
      monthlyBudgetVnd: "0",
      incomeEvents: [],
    });
    const repay = apply(state, { type: "TAKE_LOAN", offerKey: "offer_bank" }).state;
    expectCode("INSUFFICIENT_CASH", () => apply(repay, { type: "PAY_SCHEDULED" }, 1));
  });
  it("second RESTRUCTURE defaults the loan (doc 04 §3.2 - FAILED, not an error)", () => {
    const { engine, cfg, state, apply } = fresh("LOANS");
    let s = apply(state, { type: "TAKE_LOAN", offerKey: "offer_bank" }).state;
    s = apply(s, { type: "RESTRUCTURE" }, 1).state;
    const res = apply(s, { type: "RESTRUCTURE" }, 2);
    expect(res.resultDelta.defaulted).toBe(true);
    const fin = engine.isFinished(res.state, cfg);
    expect(fin.finished).toBe(true);
    expect(fin.status).toBe("FAILED");
  });
  it("BAD_CHOICE - COMPARE with empty offerKeys", () => {
    const { state, apply } = fresh("LOANS");
    expectCode("BAD_CHOICE", () => apply(state, { type: "COMPARE", offerKeys: [] }));
  });
  it("PAY_CASH_WAIT - BAD_CHOICE on months out of 1..24", () => {
    const { state, apply } = fresh("LOANS");
    expectCode("BAD_CHOICE", () => apply(state, { type: "PAY_CASH_WAIT", months: 0 }));
    expectCode("BAD_CHOICE", () => apply(state, { type: "PAY_CASH_WAIT", months: 25 }));
  });
  it("UNKNOWN_ACTION", () => {
    const { state, apply } = fresh("LOANS");
    expectCode("UNKNOWN_ACTION", () => apply(state, { type: "REFINANCE" }));
  });
});

describe("SCAM", () => {
  it("BAD_CHOICE - verdict outside SCAM|SAFE", () => {
    const { state, apply } = fresh("SCAM");
    expectCode("BAD_CHOICE", () => apply(state, { type: "DECIDE", verdict: "MAYBE" }));
  });
  it("DECIDE_DUPLICATE - same round decided twice (stale-state guard)", () => {
    const { state, apply } = fresh("SCAM");
    const after = apply(state, { type: "DECIDE", verdict: "SAFE" }).state;
    // Simulate a stale/duplicated state where the round did not advance
    const stale = { ...(after as Record<string, unknown>), round: 1 };
    expectCode("DECIDE_DUPLICATE", () => apply(stale, { type: "DECIDE", verdict: "SAFE" }, 1));
  });
  it("WRONG_PHASE - deciding after all rounds done", () => {
    const { state, apply } = fresh("SCAM");
    const done = { ...(state as Record<string, unknown>), round: 99 };
    expectCode("WRONG_PHASE", () => apply(done, { type: "DECIDE", verdict: "SAFE" }));
  });
  it("UNKNOWN_ACTION", () => {
    const { state, apply } = fresh("SCAM");
    expectCode("UNKNOWN_ACTION", () => apply(state, { type: "REPORT" }));
  });
});

describe("BUSINESS", () => {
  it("PRICE_OUT_OF_RANGE - below min and above max", () => {
    const { state, apply } = fresh("BUSINESS");
    expectCode("PRICE_OUT_OF_RANGE", () =>
      apply(state, { type: "PLAN_WEEK", priceVnd: "500", unitsToStock: 10 }),
    );
    expectCode("PRICE_OUT_OF_RANGE", () =>
      apply(state, { type: "PLAN_WEEK", priceVnd: "200000", unitsToStock: 10 }),
    );
  });
  it("STOCK_NEGATIVE", () => {
    const { state, apply } = fresh("BUSINESS");
    expectCode("STOCK_NEGATIVE", () =>
      apply(state, { type: "PLAN_WEEK", priceVnd: "15000", unitsToStock: -1 }),
    );
  });
  it("BAD_CHOICE - unknown upgrade key", () => {
    const { state, apply } = fresh("BUSINESS");
    expectCode("BAD_CHOICE", () =>
      apply(state, { type: "PLAN_WEEK", priceVnd: "15000", unitsToStock: 5, buyUpgradeKeys: ["up_ghost"] }),
    );
  });
  it("INSUFFICIENT_CASH - stocking more than cash allows", () => {
    const { state, apply } = fresh("BUSINESS");
    expectCode("INSUFFICIENT_CASH", () =>
      apply(state, { type: "PLAN_WEEK", priceVnd: "15000", unitsToStock: 1_000_000 }),
    );
  });
  it("UNKNOWN_ACTION", () => {
    const { state, apply } = fresh("BUSINESS");
    expectCode("UNKNOWN_ACTION", () => apply(state, { type: "CLOSE_SHOP" }));
  });
});

describe("INVEST", () => {
  it("BAD_ASSET - order for an unknown asset", () => {
    const { state, apply } = fresh("INVEST");
    expectCode("BAD_ASSET", () =>
      apply(state, { type: "REBALANCE", orders: [{ assetKey: "as_ghost", action: "BUY", amountVnd: "1000000" }] }),
    );
  });
  it("SELL_EXCEEDS_HOLDING - selling with zero holdings", () => {
    const { state, apply } = fresh("INVEST");
    expectCode("SELL_EXCEEDS_HOLDING", () =>
      apply(state, { type: "REBALANCE", orders: [{ assetKey: "as_bond", action: "SELL", amountVnd: "1000000" }] }),
    );
  });
  it("INSUFFICIENT_CASH - buying more than cash", () => {
    const { state, apply } = fresh("INVEST");
    expectCode("INSUFFICIENT_CASH", () =>
      apply(state, { type: "REBALANCE", orders: [{ assetKey: "as_bond", action: "BUY", amountVnd: "999999999999" }] }),
    );
  });
  it("BAD_CHOICE - non-positive amount and bad order action", () => {
    const { state, apply } = fresh("INVEST");
    expectCode("BAD_CHOICE", () =>
      apply(state, { type: "REBALANCE", orders: [{ assetKey: "as_bond", action: "BUY", amountVnd: "0" }] }),
    );
    expectCode("BAD_CHOICE", () =>
      apply(state, { type: "REBALANCE", orders: [{ assetKey: "as_bond", action: "SHORT", amountVnd: "1000" }] }),
    );
  });
  it("WRONG_PHASE - rebalance after final turn", () => {
    const { state, apply } = fresh("INVEST");
    const done = { ...(state as Record<string, unknown>), turn: 99 };
    expectCode("WRONG_PHASE", () => apply(done, { type: "REBALANCE", orders: [] }));
  });
  it("UNKNOWN_ACTION", () => {
    const { state, apply } = fresh("INVEST");
    expectCode("UNKNOWN_ACTION", () => apply(state, { type: "YOLO" }));
  });
});
