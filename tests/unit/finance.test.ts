import { describe, expect, it } from "vitest";
import {
  monthlyRate,
  annuityPayment,
  loanSchedule,
  compoundProjection,
  savingsGoalMonths,
  inflationImpact,
  budget503020,
} from "@/server/lib/finance";

// Exact fixtures from doc 03 §8 - asserted to the đồng.

describe("annuity fixture: P=100,000,000 @ 12% p.a., 12 months", () => {
  const P = 100_000_000n;

  it("M = 8,884,879 đ", () => {
    expect(annuityPayment(P, 1200, 12)).toBe(8_884_879n);
  });

  it("schedule self-consistent: Σprincipal = P, Σpayment = totalPaid, last payment adjusted", () => {
    const r = loanSchedule(P, 1200, 12, "ANNUITY");
    expect(r.totalInterestVnd).toBe(6_618_545n);
    expect(r.schedule).toHaveLength(12);
    const sumPrincipal = r.schedule.reduce((s, row) => s + row.principalVnd, 0n);
    const sumPayment = r.schedule.reduce((s, row) => s + row.paymentVnd, 0n);
    const sumInterest = r.schedule.reduce((s, row) => s + row.interestVnd, 0n);
    expect(sumPrincipal).toBe(P);
    expect(sumPayment).toBe(r.totalPaidVnd);
    expect(sumInterest).toBe(r.totalInterestVnd);
    expect(r.schedule[11]!.paymentVnd).toBe(8_884_876n); // last payment clears exactly
    expect(r.schedule[11]!.remainingVnd).toBe(0n);
  });

  it("totalInterest ≠ M·n − P (per-month rounding is the truth)", () => {
    const naive = 8_884_879n * 12n - P;
    expect(naive).toBe(6_618_548n);
    expect(loanSchedule(P, 1200, 12, "ANNUITY").totalInterestVnd).not.toBe(naive);
  });
});

describe("annuity edge cases", () => {
  it("0% rate → P/n, zero interest", () => {
    expect(annuityPayment(12_000_000n, 0, 12)).toBe(1_000_000n);
    const r = loanSchedule(12_000_000n, 0, 12, "ANNUITY");
    expect(r.totalInterestVnd).toBe(0n);
    expect(r.totalPaidVnd).toBe(12_000_000n);
  });
  it("1-month term pays everything at once", () => {
    const r = loanSchedule(10_000_000n, 1200, 1, "ANNUITY");
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0]!.principalVnd).toBe(10_000_000n);
    expect(r.schedule[0]!.interestVnd).toBe(100_000n); // 1% monthly
    expect(r.schedule[0]!.remainingVnd).toBe(0n);
  });
});

describe("declining balance", () => {
  it("month 1 interest = P·i, constant principal portion", () => {
    const r = loanSchedule(12_000_000n, 1200, 12, "DECLINING_BALANCE");
    expect(r.schedule[0]!.interestVnd).toBe(120_000n); // 12M · 1%
    expect(r.schedule[0]!.principalVnd).toBe(1_000_000n);
    expect(r.monthlyPaymentVnd).toBe(1_120_000n); // first month
    // Interest strictly decreases as the balance declines
    for (let m = 1; m < r.schedule.length; m++) {
      expect(r.schedule[m]!.interestVnd).toBeLessThan(r.schedule[m - 1]!.interestVnd);
    }
    const sumPrincipal = r.schedule.reduce((s, row) => s + row.principalVnd, 0n);
    expect(sumPrincipal).toBe(12_000_000n);
    expect(r.schedule[11]!.remainingVnd).toBe(0n);
  });
  it("declining costs less total interest than annuity at the same rate", () => {
    const ann = loanSchedule(100_000_000n, 1200, 12, "ANNUITY");
    const dec = loanSchedule(100_000_000n, 1200, 12, "DECLINING_BALANCE");
    expect(dec.totalInterestVnd).toBeLessThan(ann.totalInterestVnd);
  });
});

describe("compound fixture: 10M + 500k/mo @ 6% p.a. monthly, 10y", () => {
  it("final = 100,133,641 đ (±1)", () => {
    const r = compoundProjection(10_000_000n, 500_000n, 600, "MONTHLY", 10);
    const diff = r.finalAmountVnd - 100_133_641n;
    expect(diff <= 1n && diff >= -1n).toBe(true);
    expect(r.totalContributedVnd).toBe(10_000_000n + 500_000n * 120n);
    expect(r.totalInterestVnd).toBe(r.finalAmountVnd - r.totalContributedVnd);
    expect(r.yearly).toHaveLength(10);
    expect(r.yearly[9]!.balanceVnd).toBe(r.finalAmountVnd);
  });
  it("yearly balances strictly increase with positive rate", () => {
    const r = compoundProjection(10_000_000n, 500_000n, 600, "MONTHLY", 10);
    for (let y = 1; y < r.yearly.length; y++) {
      expect(r.yearly[y]!.balanceVnd).toBeGreaterThan(r.yearly[y - 1]!.balanceVnd);
    }
  });
  it("0% rate → pure contributions", () => {
    const r = compoundProjection(1_000_000n, 100_000n, 0, "MONTHLY", 2);
    expect(r.finalAmountVnd).toBe(1_000_000n + 100_000n * 24n);
    expect(r.totalInterestVnd).toBe(0n);
  });
  it("quarterly and annual compounding yield less than monthly", () => {
    const m = compoundProjection(10_000_000n, 0n, 600, "MONTHLY", 5).finalAmountVnd;
    const q = compoundProjection(10_000_000n, 0n, 600, "QUARTERLY", 5).finalAmountVnd;
    const a = compoundProjection(10_000_000n, 0n, 600, "ANNUALLY", 5).finalAmountVnd;
    expect(q).toBeLessThan(m);
    expect(a).toBeLessThan(q);
  });
});

describe("savingsGoalMonths", () => {
  it("already reached → 0", () => {
    expect(savingsGoalMonths(1_000_000n, 1_000_000n, 0, 0n)).toBe(0);
  });
  it("unreachable (no contribution, no rate) → null", () => {
    expect(savingsGoalMonths(1_000_000n, 0n, 0, 0n)).toBeNull();
  });
  it("exact division without interest", () => {
    expect(savingsGoalMonths(12_000_000n, 0n, 0, 1_000_000n)).toBe(12);
  });
  it("interest shortens the horizon", () => {
    const without = savingsGoalMonths(100_000_000n, 0n, 0, 2_000_000n)!;
    const withRate = savingsGoalMonths(100_000_000n, 0n, 600, 2_000_000n)!;
    expect(withRate).toBeLessThan(without);
  });
  it(">100 years → null", () => {
    expect(savingsGoalMonths(10_000_000_000n, 0n, 0, 1000n)).toBeNull();
  });
});

describe("inflationImpact", () => {
  it("5% for 1 year: 1,000,000 buys 952,381 of today's goods", () => {
    const r = inflationImpact(1_000_000n, 500, 1);
    expect(r.futureValueOfCashVnd).toBe(1_000_000n);
    expect(r.equivalentPurchasingPowerVnd).toBe(952_381n); // 1e6/1.05 half-up
  });
  it("0% inflation changes nothing", () => {
    expect(inflationImpact(5_000_000n, 0, 10).equivalentPurchasingPowerVnd).toBe(5_000_000n);
  });
});

describe("budget503020", () => {
  it("splits 10M into 5M/3M/2M", () => {
    expect(budget503020(10_000_000n)).toEqual({
      needsVnd: 5_000_000n,
      wantsVnd: 3_000_000n,
      savingsVnd: 2_000_000n,
    });
  });
  it("parts always sum exactly (savings takes the remainder)", () => {
    for (const income of [1n, 3n, 999_999n, 7_777_777n]) {
      const { needsVnd, wantsVnd, savingsVnd } = budget503020(income);
      expect(needsVnd + wantsVnd + savingsVnd).toBe(income);
    }
  });
});

describe("monthlyRate", () => {
  it("1200 bps → 1% monthly", () => {
    expect(monthlyRate(1200).toNumber()).toBeCloseTo(0.01, 12);
  });
});

describe("loanSchedule edge branches", () => {
  it("annuity clears early when rounding overshoots (tiny principal)", () => {
    // P=2 over 3 months at 0%: M=round(0.67)=1 → balance hits 0 in month 2
    const r = loanSchedule(2n, 0, 3, "ANNUITY");
    expect(r.schedule).toHaveLength(2);
    expect(r.schedule[1]!.remainingVnd).toBe(0n);
    expect(r.schedule.reduce((s, row) => s + row.principalVnd, 0n)).toBe(2n);
  });

  it("declining balance clears early when the rounded base portion overshoots", () => {
    // P=9 over 6 months: base=round(1.5)=2 → remaining 7,5,3,1, then base 2 > 1
    // caps the month-5 principal at the balance and the schedule ends early.
    const r = loanSchedule(9n, 0, 6, "DECLINING_BALANCE");
    expect(r.schedule).toHaveLength(5);
    expect(r.schedule[4]!.principalVnd).toBe(1n);
    expect(r.schedule[4]!.remainingVnd).toBe(0n);
    expect(r.schedule.reduce((s, row) => s + row.principalVnd, 0n)).toBe(9n);
  });
});
