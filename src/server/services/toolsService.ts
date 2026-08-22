import { z } from "zod";
import { prisma } from "@/server/db";
import { ruleViolation } from "@/server/lib/errors";
import { parseVnd, vndToString } from "@/server/lib/money";
import { vnDate } from "@/server/lib/time";
import {
  budget503020,
  compoundProjection,
  compoundingValues,
  inflationImpact,
  loanSchedule,
  savingsGoalMonths,
  type Compounding,
  type LoanMethod,
  type ScheduleRow,
} from "@/server/lib/finance";

// Calculators - doc 03 §8. Pure functions; the only side effect is a best-effort
// `tool_used` analytics row when the caller sends X-Anonymous-Id.

const SCHEDULE_CAP = 360;

/** Money string: non-negative integer đồng, bounded so bad input can't blow up Decimal. */
const moneyVnd = z
  .string()
  .regex(/^\d{1,15}$/, "Số tiền phải là số nguyên không âm, tính theo đồng.");

const bps = z.number().int().min(0).max(100000);

export const compoundInterestBody = z.object({
  principalVnd: moneyVnd,
  monthlyContributionVnd: moneyVnd.optional(),
  annualRateBps: bps,
  compounding: z.enum(compoundingValues),
  years: z.number().int().min(1).max(50),
});

export const loanPaymentBody = z.object({
  principalVnd: moneyVnd,
  annualRateBps: bps,
  termMonths: z.number().int().min(1).max(600),
  method: z.enum(["ANNUITY", "DECLINING_BALANCE"]),
});

export const loanCompareBody = z.object({
  loans: z.array(loanPaymentBody.extend({ name: z.string().min(1).max(60) })).min(2).max(4),
});

export const savingsGoalBody = z.object({
  goalVnd: moneyVnd,
  currentVnd: moneyVnd,
  annualRateBps: bps,
  monthlyContributionVnd: moneyVnd,
});

export const inflationBody = z.object({
  amountVnd: moneyVnd,
  annualInflationBps: bps,
  years: z.number().int().min(1).max(50),
});

export const budget503020Body = z.object({ monthlyIncomeVnd: moneyVnd });

function scheduleDto(rows: ScheduleRow[]) {
  return rows.slice(0, SCHEDULE_CAP).map((r) => ({
    month: r.month,
    paymentVnd: vndToString(r.paymentVnd),
    principalVnd: vndToString(r.principalVnd),
    interestVnd: vndToString(r.interestVnd),
    remainingVnd: vndToString(r.remainingVnd),
  }));
}

function pct(bpsValue: number): string {
  return (bpsValue / 100).toFixed(2).replace(/\.00$/, "");
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export function compoundInterest(input: z.infer<typeof compoundInterestBody>) {
  const r = compoundProjection(
    parseVnd(input.principalVnd),
    parseVnd(input.monthlyContributionVnd ?? "0"),
    input.annualRateBps,
    input.compounding as Compounding,
    input.years,
  );
  return {
    data: {
      finalAmountVnd: vndToString(r.finalAmountVnd),
      totalContributedVnd: vndToString(r.totalContributedVnd),
      totalInterestVnd: vndToString(r.totalInterestVnd),
      yearly: r.yearly.map((y) => ({ year: y.year, balanceVnd: vndToString(y.balanceVnd) })),
    },
    meta: {
      formula:
        `Lãi kép: mỗi kỳ số dư được nhân với (1 + ${pct(input.annualRateBps)}% một năm chia theo kỳ ghép lãi), ` +
        `khoản góp hằng tháng được cộng vào cuối kỳ. Sau ${input.years} năm, tiền lãi = số dư cuối − tổng đã góp.`,
    },
  };
}

export function loanPayment(input: z.infer<typeof loanPaymentBody>) {
  const r = loanSchedule(
    parseVnd(input.principalVnd),
    input.annualRateBps,
    input.termMonths,
    input.method as LoanMethod,
  );
  return {
    data: {
      monthlyPaymentVnd: vndToString(r.monthlyPaymentVnd),
      totalPaidVnd: vndToString(r.totalPaidVnd),
      totalInterestVnd: vndToString(r.totalInterestVnd),
      schedule: scheduleDto(r.schedule),
      scheduleTruncated: r.schedule.length > SCHEDULE_CAP,
    },
    meta: { formula: loanFormula(input.method as LoanMethod, input.annualRateBps) },
  };
}

function loanFormula(method: LoanMethod, annualRateBps: number): string {
  const i = `lãi suất tháng i = ${pct(annualRateBps)}% một năm ÷ 12`;
  return method === "ANNUITY"
    ? `Trả góp đều: M = P · i / (1 − (1+i)^−n), với ${i}. Mỗi tháng lãi tính trên dư nợ còn lại, phần còn lại trừ vào gốc.`
    : `Dư nợ giảm dần: gốc trả mỗi tháng = P / n, lãi tháng k = dư nợ còn lại · i, với ${i}. Tiền trả giảm dần theo thời gian.`;
}

export function loanCompare(input: z.infer<typeof loanCompareBody>) {
  const results = input.loans.map((l) => {
    const r = loanSchedule(
      parseVnd(l.principalVnd),
      l.annualRateBps,
      l.termMonths,
      l.method as LoanMethod,
    );
    return {
      name: l.name,
      principalVnd: l.principalVnd,
      annualRateBps: l.annualRateBps,
      termMonths: l.termMonths,
      method: l.method,
      monthlyPaymentVnd: vndToString(r.monthlyPaymentVnd),
      totalPaidVnd: vndToString(r.totalPaidVnd),
      totalInterestVnd: vndToString(r.totalInterestVnd),
      _total: r.totalPaidVnd,
    };
  });

  let cheapest = results[0]!;
  for (const r of results) if (r._total < cheapest._total) cheapest = r;
  const dearest = results.reduce((a, b) => (b._total > a._total ? b : a), results[0]!);
  const spread = dearest._total - cheapest._total;

  const note =
    spread > 0n
      ? `"${cheapest.name}" rẻ nhất theo tổng số tiền phải trả, tiết kiệm ${vndToString(spread)} đ so với "${dearest.name}". Kỳ hạn dài hơn có thể trả góp nhẹ hơn mỗi tháng nhưng tổng lãi cao hơn.`
      : "Các khoản vay có tổng chi phí bằng nhau; hãy so sánh thêm phí trả trước hạn và điều kiện phạt.";

  return {
    data: {
      loans: results.map(({ _total, ...rest }) => ({
        ...rest,
        totalInterestDeltaVsCheapestVnd: vndToString(_total - cheapest._total),
      })),
      cheapestByTotal: cheapest.name,
      note,
    },
    meta: {
      formula:
        "Mỗi khoản vay được lập bảng trả nợ riêng (trả góp đều hoặc dư nợ giảm dần), " +
        "rồi so sánh bằng tổng số tiền phải trả trong toàn kỳ hạn, không so sánh bằng tiền trả hằng tháng.",
    },
  };
}

export function savingsGoal(input: z.infer<typeof savingsGoalBody>, now: Date) {
  const months = savingsGoalMonths(
    parseVnd(input.goalVnd),
    parseVnd(input.currentVnd),
    input.annualRateBps,
    parseVnd(input.monthlyContributionVnd),
  );
  if (months === null) throw ruleViolation("UNREACHABLE");

  const achieved = new Date(now.getTime());
  achieved.setUTCMonth(achieved.getUTCMonth() + months);

  return {
    data: { monthsNeeded: months, achievedDate: vnDate(achieved) },
    meta: {
      formula:
        `Mỗi tháng: số dư = số dư · (1 + ${pct(input.annualRateBps)}%/12) + khoản góp. ` +
        `Đếm số tháng cho tới khi số dư đạt mục tiêu.`,
    },
  };
}

export function inflation(input: z.infer<typeof inflationBody>) {
  const r = inflationImpact(parseVnd(input.amountVnd), input.annualInflationBps, input.years);
  return {
    data: {
      futureValueOfCashVnd: vndToString(r.futureValueOfCashVnd),
      equivalentPurchasingPowerVnd: vndToString(r.equivalentPurchasingPowerVnd),
    },
    meta: {
      formula:
        `Sức mua = số tiền ÷ (1 + ${pct(input.annualInflationBps)}%)^${input.years}. ` +
        `Tiền mặt giữ nguyên con số nhưng mua được ít hàng hóa hơn.`,
    },
  };
}

export function budgetSplit(input: z.infer<typeof budget503020Body>) {
  const r = budget503020(parseVnd(input.monthlyIncomeVnd));
  return {
    data: {
      needsVnd: vndToString(r.needsVnd),
      wantsVnd: vndToString(r.wantsVnd),
      savingsVnd: vndToString(r.savingsVnd),
    },
    meta: {
      formula:
        "Quy tắc 50/30/20: 50% cho nhu cầu thiết yếu, 30% cho mong muốn, 20% cho tiết kiệm và trả nợ. " +
        "Phần lẻ khi làm tròn được dồn vào tiết kiệm.",
    },
  };
}

// ── tool_used event (best effort, never blocks the response) ──────────────────

export async function recordToolUse(req: Request, tool: string, now: Date): Promise<void> {
  const anonymousId = req.headers.get("x-anonymous-id");
  if (!anonymousId || anonymousId.length > 64) return;
  const sessionId = req.headers.get("x-session-id")?.slice(0, 64) || anonymousId;
  try {
    await prisma.event.create({
      data: { anonymousId, sessionId, name: "tool_used", ts: now, props: { tool } },
    });
  } catch {
    // analytics must never break a calculator response
  }
}
