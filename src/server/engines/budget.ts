import type { Rng } from "@/server/lib/rng";
import { weightedDraw } from "@/server/lib/rng";
import {
  type Engine,
  type EngineJson,
  type ApplyResult,
  type FinishResult,
  type ActionDescriptor,
  type TextBundle,
  engineError,
  applyPreset,
  num,
  str,
  txt,
} from "@/server/engines/types";

// BUDGET - "Tháng lương đầu tiên" (doc 04 §2). One month = one turn, 3 phases.

interface Category {
  key: string;
  kind: "NEED" | "WANT" | "SAVING";
  minVnd: string;
  recommendedVnd: string;
}
interface EventDef {
  key: string;
  weight: number;
  type: "EXPENSE" | "INCOME" | "CHOICE";
  amountVnd: string;
  choices: Array<{ key: string; effect: Record<string, unknown> }>;
}

interface BudgetState {
  month: number;
  phase: "ALLOCATE" | "EVENTS" | "REVIEW";
  cash: number;
  savings: number;
  allocations: Record<string, number>;
  pendingEvents: Array<{ key: string }>;
  resolvedEvents: Array<{ key: string; choiceKey: string | null; cashDelta: number }>;
  carryoverExtra: number;
  pendingRepays: Array<{ month: number; amount: number; chanceBps: number }>;
  everNegative: boolean;
  failed: boolean;
  totalIncome: number;
  history: EngineJson[];
  [k: string]: unknown;
}

function cfg(config: EngineJson) {
  return {
    months: num(config.months),
    income: num(config.monthlyIncomeVnd),
    opening: num(config.openingCashVnd),
    bills: (config.fixedBills as Array<{ key: string; amountVnd: string }>) ?? [],
    categories: (config.categories as Category[]) ?? [],
    events: (config.events as EventDef[]) ?? [],
    allowDebt: Boolean(config.allowDebt),
    evtMin: num((config.eventCountPerMonth as EngineJson)?.min),
    evtMax: num((config.eventCountPerMonth as EngineJson)?.max),
    savingsInterestBps: num(config.savingsMonthlyInterestBps),
  };
}

export const budgetEngine: Engine = {
  type: "BUDGET",

  init(config, _seed, optionsKey) {
    const c = cfg(applyPreset(config, optionsKey));
    const state: BudgetState = {
      month: 1,
      phase: "ALLOCATE",
      cash: c.opening,
      savings: 0,
      allocations: {},
      pendingEvents: [],
      resolvedEvents: [],
      carryoverExtra: 0,
      pendingRepays: [],
      everNegative: false,
      failed: false,
      totalIncome: 0,
      history: [],
    };
    return state;
  },

  view(state, config, textBundle: TextBundle) {
    const s = state as BudgetState;
    const c = cfg(config);
    // Rule-based canned hint (doc 04 §2.5)
    let hint: string | null = null;
    const fun = s.allocations["cat_fun"] ?? 0;
    if (s.phase === "REVIEW" && fun > c.income * 0.3) hint = "hint_wants_high";
    if (s.phase === "ALLOCATE" && s.month > 1 && s.savings === 0) hint = "hint_start_saving";

    return {
      month: s.month,
      months: c.months,
      phase: s.phase,
      cashVnd: String(s.cash),
      savingsVnd: String(s.savings),
      monthlyIncomeVnd: String(c.income),
      fixedBills: c.bills.map((b) => ({ key: b.key, label: txt(textBundle, b.key), amountVnd: b.amountVnd })),
      categories: c.categories.map((cat) => ({
        key: cat.key,
        label: txt(textBundle, cat.key),
        kind: cat.kind,
        minVnd: cat.minVnd,
        recommendedVnd: cat.recommendedVnd,
        allocatedVnd: String(s.allocations[cat.key] ?? 0),
      })),
      carryoverExtraVnd: String(s.carryoverExtra),
      pendingEvents: s.pendingEvents.map((e) => {
        const def = c.events.find((d) => d.key === e.key);
        return {
          key: e.key,
          label: txt(textBundle, e.key),
          amountVnd: def?.amountVnd ?? "0",
          choices: (def?.choices ?? []).map((ch) => ({ key: ch.key, label: txt(textBundle, ch.key) })),
        };
      }),
      resolvedEvents: s.resolvedEvents,
      history: s.history,
      hint,
    };
  },

  availableActions(state): ActionDescriptor[] {
    const s = state as BudgetState;
    if (s.phase === "ALLOCATE") {
      return [
        {
          type: "SET_ALLOCATIONS",
          schema: { allocations: "Record<categoryKey, stringVnd> (all categories required)" },
        },
      ];
    }
    if (s.phase === "EVENTS") {
      return [{ type: "RESOLVE_EVENT", schema: { eventKey: "string", choiceKey: "string" } }];
    }
    return [{ type: "END_MONTH", schema: {} }];
  },

  applyAction(state, config, action, rng: Rng): ApplyResult {
    const s = structuredClone(state) as BudgetState;
    const c = cfg(config);
    const type = str(action.type);

    if (type === "SET_ALLOCATIONS") {
      if (s.phase !== "ALLOCATE") engineError("WRONG_PHASE");
      const raw = (action.allocations ?? {}) as Record<string, string>;
      const allocations: Record<string, number> = {};
      let sum = 0;
      for (const cat of c.categories) {
        const v = raw[cat.key];
        if (v === undefined || !/^\d+$/.test(String(v))) {
          engineError("ALLOC_BELOW_MIN", `Missing or invalid allocation for ${cat.key}`);
        }
        const n = Number(v);
        if (cat.kind === "NEED" && n < num(cat.minVnd)) {
          engineError("ALLOC_BELOW_MIN", cat.key);
        }
        allocations[cat.key] = n;
        sum += n;
      }
      if (sum > s.cash + c.income) engineError("OVERSPEND_LIMIT");

      // income → bills → carryover → repays → allocations reserve (doc 04 §2.3)
      s.cash += c.income;
      s.totalIncome += c.income;
      for (const b of c.bills) s.cash -= num(b.amountVnd);
      s.cash -= s.carryoverExtra;
      s.carryoverExtra = 0;
      s.resolvedEvents = [];
      const dueRepays = s.pendingRepays.filter((r) => r.month === s.month);
      s.pendingRepays = s.pendingRepays.filter((r) => r.month !== s.month);
      for (const r of dueRepays) {
        const repaid = rng.next() * 10000 < r.chanceBps;
        if (repaid) s.cash += r.amount;
        s.resolvedEvents.push({ key: repaid ? "evt_repaid" : "evt_not_repaid", choiceKey: null, cashDelta: repaid ? r.amount : 0 });
      }
      s.allocations = allocations;
      s.cash -= sum; // reserved for the month

      // Draw this month's events
      const count = c.evtMin + rng.int(c.evtMax - c.evtMin + 1);
      const pool = [...c.events];
      for (let i = 0; i < count && pool.length > 0; i++) {
        const drawn = weightedDraw(pool, rng);
        pool.splice(pool.indexOf(drawn), 1);
        if (drawn.choices.length === 0) {
          const delta = drawn.type === "INCOME" ? num(drawn.amountVnd) : -num(drawn.amountVnd);
          s.cash += delta;
          s.resolvedEvents.push({ key: drawn.key, choiceKey: null, cashDelta: delta });
        } else {
          s.pendingEvents.push({ key: drawn.key });
        }
      }
      s.phase = s.pendingEvents.length > 0 ? "EVENTS" : "REVIEW";
      return {
        state: s,
        resultDelta: { allocated: String(sum), eventsDrawn: s.pendingEvents.length + s.resolvedEvents.length },
        turnAdvanced: false,
      };
    }

    if (type === "RESOLVE_EVENT") {
      if (s.phase !== "EVENTS") engineError("WRONG_PHASE");
      const eventKey = str(action.eventKey);
      const idx = s.pendingEvents.findIndex((e) => e.key === eventKey);
      if (idx < 0) engineError("EVENT_NOT_PENDING", eventKey);
      const def = cfg(config).events.find((d) => d.key === eventKey)!;
      const choice = def.choices.find((ch) => ch.key === str(action.choiceKey));
      if (!choice) engineError("BAD_CHOICE", str(action.choiceKey));

      const effect = choice.effect;
      const cashDelta = num(effect.cashVnd);
      s.cash += cashDelta;
      if (effect.nextMonthExtraVnd !== undefined) s.carryoverExtra += num(effect.nextMonthExtraVnd);
      if (effect.repayChanceBps !== undefined) {
        s.pendingRepays.push({
          month: s.month + num(effect.repayMonthOffset ?? 1),
          amount: Math.abs(cashDelta),
          chanceBps: num(effect.repayChanceBps),
        });
      }
      s.pendingEvents.splice(idx, 1);
      s.resolvedEvents.push({ key: eventKey, choiceKey: choice.key, cashDelta });
      if (s.pendingEvents.length === 0) s.phase = "REVIEW";
      return { state: s, resultDelta: { eventKey, choiceKey: choice.key, cashDelta: String(cashDelta) }, turnAdvanced: false };
    }

    if (type === "END_MONTH") {
      if (s.phase !== "REVIEW") engineError("WRONG_PHASE");
      // Actual spend per NEED/WANT category: 85–100% of the allocation (RNG);
      // the unspent remainder returns to cash. SAVING moves to savings + interest.
      const spentByCategory: Record<string, string> = {};
      let saved = 0;
      for (const cat of c.categories) {
        const alloc = s.allocations[cat.key] ?? 0;
        if (cat.kind === "SAVING") {
          saved += alloc;
          spentByCategory[cat.key] = String(alloc);
        } else {
          const ratio = 0.85 + rng.next() * 0.15;
          const spent = Math.round(alloc * ratio);
          spentByCategory[cat.key] = String(spent);
          s.cash += alloc - spent; // unspent returns
        }
      }
      s.savings += saved;
      const interest = Math.round((s.savings * c.savingsInterestBps) / 10000);
      s.savings += interest;

      if (s.cash < 0) {
        s.everNegative = true;
        if (!c.allowDebt) s.failed = true;
      }
      const report = {
        month: s.month,
        incomeVnd: String(c.income),
        spentByCategory,
        savedVnd: String(saved),
        savingsInterestVnd: String(interest),
        cashEndVnd: String(s.cash),
        events: s.resolvedEvents,
      };
      s.history.push(report);
      const finishedMonths = s.month >= c.months;
      if (!s.failed && !finishedMonths) {
        s.month += 1;
        s.phase = "ALLOCATE";
        s.allocations = {};
      }
      return { state: s, resultDelta: { monthClosed: s.history.length }, turnAdvanced: true, turnReport: report };
    }

    engineError("UNKNOWN_ACTION", type);
  },

  isFinished(state, config): FinishResult {
    const s = state as BudgetState;
    const c = cfg(config);
    if (s.failed) {
      return {
        finished: true,
        status: "FAILED",
        summary: {
          finalNetWorthVnd: String(s.cash + s.savings),
          savingsRatePct: 0,
          monthsSurvived: s.history.length,
          grade: "D",
          tips: ["tip_emergency_fund", "tip_needs_first"],
          awardBadge: null,
        },
      };
    }
    if (s.history.length >= c.months) {
      const savingsRatePct = s.totalIncome > 0 ? Math.floor((s.savings / s.totalIncome) * 100) : 0;
      const grade = savingsRatePct >= 20 && !s.everNegative ? "A" : savingsRatePct >= 10 ? "B" : "C";
      return {
        finished: true,
        status: "COMPLETED",
        summary: {
          finalNetWorthVnd: String(s.cash + s.savings),
          savingsRatePct,
          eventsHandled: s.history.reduce((n, h) => n + ((h.events as unknown[])?.length ?? 0), 0),
          grade,
          tips: savingsRatePct < 20 ? ["tip_pay_yourself_first"] : ["tip_keep_it_up"],
          awardBadge: savingsRatePct >= 20 ? "SIM_BUDGET_SURPLUS" : null,
        },
      };
    }
    return { finished: false, status: "COMPLETED" };
  },
};
