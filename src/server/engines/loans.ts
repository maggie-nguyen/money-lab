import type { Rng } from "@/server/lib/rng";
import { weightedDraw } from "@/server/lib/rng";
import { annuityPayment, loanSchedule, monthlyRate } from "@/server/lib/finance";
import { dec, roundVnd } from "@/server/lib/money";
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

// LOANS - "Vay khôn ngoan" (doc 04 §3). Phases CHOOSE → REPAY.
// Secrets: offers' `legit` + effective rate hidden until COMPARE'd enough.

interface Offer {
  key: string;
  principalVnd: string;
  annualRateBps: number;
  termMonths: number;
  method: "ANNUITY" | "DECLINING_BALANCE";
  upfrontFeeVnd: string;
  earlyRepayPenaltyBps: number;
  legit: boolean;
  marketingKey?: string;
  redFlags?: string[];
}

interface LoansState {
  phase: "CHOOSE" | "REPAY" | "DONE";
  month: number; // repay month counter
  cash: number;
  chosenOfferKey: string | null;
  remaining: number;
  currentRateBps: number;
  currentTermMonths: number; // remaining term
  method: "ANNUITY" | "DECLINING_BALANCE";
  monthlyPayment: number;
  basePrincipalPortion: number; // for DECLINING
  earlyRepayPenaltyBps: number;
  compareCounts: Record<string, number>;
  restructures: number;
  defaulted: boolean;
  totalInterest: number;
  totalFees: number;
  waited: boolean;
  waitedMonths: number;
  history: EngineJson[];
  lastEventKey: string | null;
  [k: string]: unknown;
}

function cfg(config: EngineJson) {
  return {
    goalKey: str(config.goalKey),
    goalPrice: num(config.goalPriceVnd),
    playerCash: num(config.playerCashVnd),
    monthlyBudget: num(config.monthlyBudgetVnd),
    offers: (config.offers as Offer[]) ?? [],
    incomeEvents: (config.incomeEvents as Array<{ key: string; weight: number; amountVnd: string }>) ?? [],
    months: num(config.months),
    redFlagRevealAfter: num(config.redFlagRevealAfter ?? 2),
  };
}

/** Full-cost analysis of an offer (fees amortized) - mirrors /tools/loan-payment. */
export function analyzeOffer(offer: Offer): {
  monthlyPaymentVnd: number;
  totalCostVnd: number; // interest + fees
  effectiveAnnualRateBps: number;
} {
  const principal = BigInt(offer.principalVnd);
  const result = loanSchedule(principal, offer.annualRateBps, offer.termMonths, offer.method);
  const fee = num(offer.upfrontFeeVnd);
  const totalCost = Number(result.totalInterestVnd) + fee;
  // Effective annual rate: total cost as a simple annualized fraction of principal
  const years = offer.termMonths / 12;
  const effectiveAnnualRateBps = Math.round((totalCost / Number(principal) / years) * 10000);
  return { monthlyPaymentVnd: Number(result.monthlyPaymentVnd), totalCostVnd: totalCost, effectiveAnnualRateBps };
}

function cheapestLoanCost(c: ReturnType<typeof cfg>): number {
  return Math.min(...c.offers.map((o) => analyzeOffer(o).totalCostVnd));
}

function scheduledPayment(s: LoansState): { payment: number; interest: number; principal: number } {
  const i = monthlyRate(s.currentRateBps);
  const interest = Number(roundVnd(dec(BigInt(Math.round(s.remaining))).mul(i)));
  if (s.method === "ANNUITY") {
    let principal = s.monthlyPayment - interest;
    if (principal >= s.remaining || s.currentTermMonths <= 1) principal = s.remaining;
    return { payment: principal + interest, interest, principal };
  }
  const principal = Math.min(s.basePrincipalPortion, s.remaining);
  const final = s.currentTermMonths <= 1 ? s.remaining : principal;
  return { payment: final + interest, interest, principal: final };
}

export const loansEngine: Engine = {
  type: "LOANS",

  init(config, _seed, optionsKey) {
    const c = cfg(applyPreset(config, optionsKey));
    const state: LoansState = {
      phase: "CHOOSE",
      month: 0,
      cash: c.playerCash,
      chosenOfferKey: null,
      remaining: 0,
      currentRateBps: 0,
      currentTermMonths: 0,
      method: "ANNUITY",
      monthlyPayment: 0,
      basePrincipalPortion: 0,
      earlyRepayPenaltyBps: 0,
      compareCounts: {},
      restructures: 0,
      defaulted: false,
      totalInterest: 0,
      totalFees: 0,
      waited: false,
      waitedMonths: 0,
      history: [],
      lastEventKey: null,
    };
    return state;
  },

  view(state, config, textBundle: TextBundle) {
    const s = state as LoansState;
    const c = cfg(config);
    return {
      phase: s.phase,
      goal: { key: c.goalKey, label: txt(textBundle, c.goalKey), priceVnd: String(c.goalPrice) },
      cashVnd: String(s.cash),
      monthlyBudgetVnd: String(c.monthlyBudget),
      month: s.month,
      months: c.months,
      offers: c.offers.map((o) => {
        const compares = s.compareCounts[o.key] ?? 0;
        const revealed = compares >= 1;
        const analysis = revealed ? analyzeOffer(o) : null;
        return {
          key: o.key,
          label: txt(textBundle, o.key),
          principalVnd: o.principalVnd,
          annualRateBps: o.annualRateBps,
          termMonths: o.termMonths,
          method: o.method,
          upfrontFeeVnd: o.upfrontFeeVnd,
          ...(o.marketingKey ? { marketing: txt(textBundle, o.marketingKey) } : {}),
          // discovery pedagogy: cost analysis only after COMPARE
          ...(analysis
            ? {
                monthlyPaymentVnd: String(analysis.monthlyPaymentVnd),
                totalCostVnd: String(analysis.totalCostVnd),
                effectiveAnnualRateBps: analysis.effectiveAnnualRateBps,
              }
            : {}),
          // red flags for shady offers only after enough scrutiny
          ...(!o.legit && compares >= c.redFlagRevealAfter
            ? { redFlags: (o.redFlags ?? []).map((rf) => txt(textBundle, rf)) }
            : {}),
        };
      }),
      ...(s.phase === "REPAY"
        ? {
            loan: {
              offerKey: s.chosenOfferKey,
              remainingVnd: String(s.remaining),
              monthlyPaymentVnd: String(scheduledPayment(s).payment),
              annualRateBps: s.currentRateBps,
              termMonthsLeft: s.currentTermMonths,
              restructuresUsed: s.restructures,
            },
          }
        : {}),
      lastEvent: s.lastEventKey ? { key: s.lastEventKey, label: txt(textBundle, s.lastEventKey) } : null,
      history: s.history,
    };
  },

  availableActions(state): ActionDescriptor[] {
    const s = state as LoansState;
    if (s.phase === "CHOOSE") {
      return [
        { type: "COMPARE", schema: { offerKeys: "string[]" } },
        { type: "TAKE_LOAN", schema: { offerKey: "string" } },
        { type: "PAY_CASH_WAIT", schema: { months: "number (1..24)" } },
      ];
    }
    if (s.phase === "REPAY") {
      return [
        { type: "PAY_SCHEDULED", schema: {} },
        { type: "PAY_EXTRA", schema: { extraVnd: "stringVnd ≥ 100000" } },
        { type: "RESTRUCTURE", schema: {} },
      ];
    }
    return [];
  },

  applyAction(state, config, action, rng: Rng): ApplyResult {
    const s = structuredClone(state) as LoansState;
    const c = cfg(config);
    const type = str(action.type);

    if (type === "COMPARE") {
      if (s.phase !== "CHOOSE") engineError("WRONG_PHASE");
      const keys = (action.offerKeys as string[]) ?? [];
      if (!Array.isArray(keys) || keys.length === 0) engineError("BAD_CHOICE", "offerKeys required");
      const results: EngineJson[] = [];
      for (const key of keys) {
        const offer = c.offers.find((o) => o.key === key);
        if (!offer) engineError("BAD_CHOICE", key);
        s.compareCounts[key] = (s.compareCounts[key] ?? 0) + 1;
        const a = analyzeOffer(offer);
        results.push({
          offerKey: key,
          monthlyPaymentVnd: String(a.monthlyPaymentVnd),
          totalCostVnd: String(a.totalCostVnd),
          effectiveAnnualRateBps: a.effectiveAnnualRateBps,
          ...(!offer.legit && (s.compareCounts[key] ?? 0) >= c.redFlagRevealAfter
            ? { redFlags: offer.redFlags ?? [] }
            : {}),
        });
      }
      return { state: s, resultDelta: { compared: results }, turnAdvanced: false };
    }

    if (type === "TAKE_LOAN") {
      if (s.phase !== "CHOOSE") engineError("WRONG_PHASE");
      const offer = c.offers.find((o) => o.key === str(action.offerKey));
      if (!offer) engineError("BAD_CHOICE", str(action.offerKey));
      const principal = num(offer.principalVnd);
      const fee = num(offer.upfrontFeeVnd);
      const cashAfter = s.cash + principal - fee;
      if (cashAfter < c.goalPrice) engineError("INSUFFICIENT_CASH");
      s.cash = cashAfter - c.goalPrice;
      s.totalFees += fee;
      s.chosenOfferKey = offer.key;
      s.remaining = principal;
      s.currentRateBps = offer.annualRateBps;
      s.currentTermMonths = offer.termMonths;
      s.method = offer.method;
      s.monthlyPayment = Number(annuityPayment(BigInt(principal), offer.annualRateBps, offer.termMonths));
      s.basePrincipalPortion = Math.round(principal / offer.termMonths);
      s.earlyRepayPenaltyBps = offer.earlyRepayPenaltyBps;
      s.phase = "REPAY";
      return {
        state: s,
        resultDelta: { tookLoan: offer.key, boughtGoal: c.goalKey, cashVnd: String(s.cash) },
        turnAdvanced: true,
      };
    }

    if (type === "PAY_CASH_WAIT") {
      if (s.phase !== "CHOOSE") engineError("WRONG_PHASE");
      const months = num(action.months);
      if (!Number.isInteger(months) || months < 1 || months > 24) engineError("BAD_CHOICE", "months 1..24");
      const finalCash = s.cash + c.monthlyBudget * months;
      if (finalCash < c.goalPrice) engineError("INSUFFICIENT_CASH", "Not enough even after waiting");
      s.cash = finalCash - c.goalPrice;
      s.waited = true;
      s.waitedMonths = months;
      s.phase = "DONE";
      return {
        state: s,
        resultDelta: { waitedMonths: months, cashVnd: String(s.cash) },
        turnAdvanced: true,
      };
    }

    // ── REPAY-phase month turns ──────────────────────────────────────────────
    if (type === "PAY_SCHEDULED" || type === "PAY_EXTRA" || type === "RESTRUCTURE") {
      if (s.phase !== "REPAY") engineError("WRONG_PHASE");
      s.month += 1;
      // Monthly repay capacity arrives, then an income event may hit
      s.cash += c.monthlyBudget;
      const eventPool = [...c.incomeEvents, { key: "evt_quiet_month", weight: 4, amountVnd: "0" }];
      const drawn = weightedDraw(eventPool, rng);
      s.lastEventKey = drawn.key;
      s.cash += num(drawn.amountVnd);

      let report: EngineJson;
      if (type === "RESTRUCTURE") {
        if (s.restructures >= 1) {
          s.defaulted = true;
          s.phase = "DONE";
          report = { month: s.month, action: type, defaulted: true };
          s.history.push(report);
          return { state: s, resultDelta: { defaulted: true }, turnAdvanced: true, turnReport: report };
        }
        s.restructures += 1;
        s.currentTermMonths += 3;
        s.currentRateBps += 200;
        s.monthlyPayment = Number(
          annuityPayment(BigInt(Math.round(s.remaining)), s.currentRateBps, s.currentTermMonths),
        );
        s.basePrincipalPortion = Math.round(s.remaining / s.currentTermMonths);
        report = {
          month: s.month,
          action: type,
          eventKey: drawn.key,
          newRateBps: s.currentRateBps,
          newTermMonths: s.currentTermMonths,
          cashVnd: String(s.cash),
          remainingVnd: String(s.remaining),
        };
      } else {
        const sched = scheduledPayment(s);
        let extra = 0;
        let penalty = 0;
        if (type === "PAY_EXTRA") {
          extra = num(action.extraVnd);
          if (extra < 100000) engineError("EXTRA_TOO_SMALL");
          extra = Math.min(extra, Math.max(0, s.remaining - sched.principal));
          penalty = Math.round((extra * s.earlyRepayPenaltyBps) / 10000);
        }
        const totalDue = sched.payment + extra + penalty;
        if (s.cash < totalDue) engineError("INSUFFICIENT_CASH");
        s.cash -= totalDue;
        s.remaining -= sched.principal + extra;
        s.currentTermMonths -= 1;
        s.totalInterest += sched.interest;
        s.totalFees += penalty;
        report = {
          month: s.month,
          action: type,
          eventKey: drawn.key,
          paymentVnd: String(sched.payment),
          interestVnd: String(sched.interest),
          principalVnd: String(sched.principal + extra),
          ...(extra > 0 ? { extraVnd: String(extra), penaltyVnd: String(penalty) } : {}),
          remainingVnd: String(s.remaining),
          cashVnd: String(s.cash),
        };
        if (s.remaining <= 0) {
          s.remaining = 0;
          s.phase = "DONE";
        } else if (s.month >= c.months) {
          s.defaulted = true;
          s.phase = "DONE";
        }
      }
      s.history.push(report);
      return { state: s, resultDelta: report, turnAdvanced: true, turnReport: report };
    }

    engineError("UNKNOWN_ACTION", type);
  },

  isFinished(state, config): FinishResult {
    const s = state as LoansState;
    const c = cfg(config);
    if (s.phase !== "DONE") return { finished: false, status: "COMPLETED" };

    if (s.waited) {
      return {
        finished: true,
        status: "COMPLETED",
        summary: {
          path: "WAITED",
          monthsWaited: s.waitedMonths,
          totalInterestAndFeesVnd: "0",
          vsBestOfferDeltaVnd: String(-cheapestLoanCost(c)),
          grade: "A",
          insights: ["ins_waiting_is_free"],
          awardBadge: "SIM_LOANS_SAVER",
        },
      };
    }
    if (s.defaulted) {
      const offer = c.offers.find((o) => o.key === s.chosenOfferKey);
      return {
        finished: true,
        status: "FAILED",
        summary: {
          chosenOfferKey: s.chosenOfferKey,
          totalInterestAndFeesVnd: String(s.totalInterest + s.totalFees),
          monthsPlayed: s.month,
          grade: "D",
          insights: [
            "ins_default_cost",
            ...(offer && !offer.legit ? ["ins_black_credit"] : []),
          ],
          awardBadge: null,
        },
      };
    }

    const totalCost = s.totalInterest + s.totalFees;
    const best = cheapestLoanCost(c);
    const withinFivePct = totalCost <= best * 1.05;
    const offer = c.offers.find((o) => o.key === s.chosenOfferKey);
    const principal = offer ? num(offer.principalVnd) : 1;
    const years = Math.max(s.month, 1) / 12;
    const insights: string[] = [];
    if (s.chosenOfferKey === "offer_retail") insights.push("ins_zero_pct_trap");
    if (offer && !offer.legit) insights.push("ins_black_credit");
    if (withinFivePct) insights.push("ins_best_choice");
    return {
      finished: true,
      status: "COMPLETED",
      summary: {
        chosenOfferKey: s.chosenOfferKey,
        totalInterestAndFeesVnd: String(totalCost),
        vsBestOfferDeltaVnd: String(totalCost - best),
        monthsToClear: s.month,
        effectiveRatePaidBps: Math.round((totalCost / principal / years) * 10000),
        grade: withinFivePct ? "A" : totalCost <= best * 1.3 ? "B" : "C",
        insights,
        awardBadge: withinFivePct ? "SIM_LOANS_SAVER" : null,
      },
    };
  },
};
