import Decimal from "decimal.js";
import { roundVnd, dec } from "@/server/lib/money";

// Financial formulas - doc 03 §8. All money bigint đồng, rates integer bps.
// Round half-up only at the end (annuity) / on each ledger line (schedules).

export type LoanMethod = "ANNUITY" | "DECLINING_BALANCE";

/** Monthly rate as a Decimal: annualRateBps / 120000. */
export function monthlyRate(annualRateBps: number): Decimal {
  return new Decimal(annualRateBps).div(120000);
}

/** Annuity payment M = P·i/(1−(1+i)^−n), rounded half-up at the end. i=0 → P/n. */
export function annuityPayment(principalVnd: bigint, annualRateBps: number, termMonths: number): bigint {
  const P = dec(principalVnd);
  if (annualRateBps === 0) return roundVnd(P.div(termMonths));
  const i = monthlyRate(annualRateBps);
  const denom = new Decimal(1).minus(new Decimal(1).plus(i).pow(-termMonths));
  return roundVnd(P.mul(i).div(denom));
}

export interface ScheduleRow {
  month: number;
  paymentVnd: bigint;
  principalVnd: bigint;
  interestVnd: bigint;
  remainingVnd: bigint;
}

export interface LoanResult {
  monthlyPaymentVnd: bigint; // first month for DECLINING_BALANCE
  totalPaidVnd: bigint;
  totalInterestVnd: bigint;
  schedule: ScheduleRow[];
}

/** Full amortization schedule. Last row always clears the balance exactly. */
export function loanSchedule(
  principalVnd: bigint,
  annualRateBps: number,
  termMonths: number,
  method: LoanMethod,
): LoanResult {
  const i = monthlyRate(annualRateBps);
  const schedule: ScheduleRow[] = [];
  let remaining = principalVnd;
  let totalPaid = 0n;
  let totalInterest = 0n;

  if (method === "ANNUITY") {
    const M = annuityPayment(principalVnd, annualRateBps, termMonths);
    for (let m = 1; m <= termMonths; m++) {
      const interest = roundVnd(dec(remaining).mul(i));
      let principal = M - interest;
      let payment = M;
      if (m === termMonths || principal >= remaining) {
        principal = remaining; // clear
        payment = principal + interest;
      }
      remaining -= principal;
      totalPaid += payment;
      totalInterest += interest;
      schedule.push({ month: m, paymentVnd: payment, principalVnd: principal, interestVnd: interest, remainingVnd: remaining });
      if (remaining === 0n && m < termMonths) break;
    }
    return { monthlyPaymentVnd: M, totalPaidVnd: totalPaid, totalInterestVnd: totalInterest, schedule };
  }

  // DECLINING_BALANCE: constant principal portion P/n (rounded), interest on remaining
  const basePrincipal = roundVnd(dec(principalVnd).div(termMonths));
  for (let m = 1; m <= termMonths; m++) {
    const interest = roundVnd(dec(remaining).mul(i));
    const principal = m === termMonths ? remaining : basePrincipal > remaining ? remaining : basePrincipal;
    const payment = principal + interest;
    remaining -= principal;
    totalPaid += payment;
    totalInterest += interest;
    schedule.push({ month: m, paymentVnd: payment, principalVnd: principal, interestVnd: interest, remainingVnd: remaining });
    if (remaining === 0n && m < termMonths) break;
  }
  return {
    monthlyPaymentVnd: schedule[0]!.paymentVnd, // termMonths ≥ 1 everywhere (Zod-gated)
    totalPaidVnd: totalPaid,
    totalInterestVnd: totalInterest,
    schedule,
  };
}

export const compoundingValues = ["MONTHLY", "QUARTERLY", "ANNUALLY"] as const;
export type Compounding = (typeof compoundingValues)[number];

const PERIODS_PER_YEAR: Record<Compounding, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUALLY: 1 };

export interface CompoundResult {
  finalAmountVnd: bigint;
  totalContributedVnd: bigint;
  totalInterestVnd: bigint;
  yearly: Array<{ year: number; balanceVnd: bigint }>;
}

/**
 * Compound growth with monthly contributions at period end.
 * Iterates months; interest credited each compounding period; round only outputs.
 */
export function compoundProjection(
  principalVnd: bigint,
  monthlyContributionVnd: bigint,
  annualRateBps: number,
  compounding: Compounding,
  years: number,
): CompoundResult {
  const periods = PERIODS_PER_YEAR[compounding];
  const monthsPerPeriod = 12 / periods;
  const periodRate = new Decimal(annualRateBps).div(10000).div(periods);
  let balance = dec(principalVnd);
  let contributed = dec(principalVnd);
  const yearly: Array<{ year: number; balanceVnd: bigint }> = [];

  for (let month = 1; month <= years * 12; month++) {
    // interest credited on the period boundary, THEN the contribution lands
    // (annuity-immediate: this month's deposit earns from next period)
    if (month % monthsPerPeriod === 0) {
      balance = balance.mul(new Decimal(1).plus(periodRate));
    }
    balance = balance.plus(dec(monthlyContributionVnd));
    contributed = contributed.plus(dec(monthlyContributionVnd));
    if (month % 12 === 0) {
      yearly.push({ year: month / 12, balanceVnd: roundVnd(balance) });
    }
  }
  const finalAmount = roundVnd(balance);
  const totalContributed = roundVnd(contributed);
  return {
    finalAmountVnd: finalAmount,
    totalContributedVnd: totalContributed,
    totalInterestVnd: finalAmount - totalContributed,
    yearly,
  };
}

/** Months to reach a savings goal; null = unreachable. */
export function savingsGoalMonths(
  goalVnd: bigint,
  currentVnd: bigint,
  annualRateBps: number,
  monthlyContributionVnd: bigint,
): number | null {
  if (currentVnd >= goalVnd) return 0;
  if (monthlyContributionVnd <= 0n && annualRateBps <= 0) return null;
  const i = monthlyRate(annualRateBps);
  let balance = dec(currentVnd);
  const goal = dec(goalVnd);
  for (let m = 1; m <= 1200; m++) {
    balance = balance.mul(new Decimal(1).plus(i)).plus(dec(monthlyContributionVnd));
    if (balance.gte(goal)) return m;
  }
  return null; // >100 years - treat as unreachable
}

export interface InflationResult {
  futureValueOfCashVnd: bigint; // nominal (unchanged)
  equivalentPurchasingPowerVnd: bigint; // what today's amount buys after N years
}

export function inflationImpact(amountVnd: bigint, annualInflationBps: number, years: number): InflationResult {
  const factor = new Decimal(1).plus(new Decimal(annualInflationBps).div(10000)).pow(years);
  return {
    futureValueOfCashVnd: amountVnd,
    equivalentPurchasingPowerVnd: roundVnd(dec(amountVnd).div(factor)),
  };
}

export interface Budget503020 {
  needsVnd: bigint;
  wantsVnd: bigint;
  savingsVnd: bigint;
}

/** 50/30/20 split; savings takes the rounding remainder so the parts sum exactly. */
export function budget503020(monthlyIncomeVnd: bigint): Budget503020 {
  const needs = roundVnd(dec(monthlyIncomeVnd).mul(50).div(100));
  const wants = roundVnd(dec(monthlyIncomeVnd).mul(30).div(100));
  return { needsVnd: needs, wantsVnd: wants, savingsVnd: monthlyIncomeVnd - needs - wants };
}
