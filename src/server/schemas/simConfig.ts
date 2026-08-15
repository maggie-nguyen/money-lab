import { z } from "zod";

// Per-engine config schemas - doc 03 §14.1: sim publish runs "engine config Zod +
// smoke simulation". Structural validation only; the smoke run catches behavioural
// problems. Money amounts are integer-VND strings (may be negative where noted).

const vnd = z.string().regex(/^\d{1,15}$/, "integer VND string");
const vndSigned = z.string().regex(/^-?\d{1,15}$/, "signed integer VND string");
const key = z.string().regex(/^[a-z0-9_]{1,40}$/);
const bps = z.number().int().min(0).max(100_000);
const weight = z.number().int().min(1).max(100);

const budgetEventChoice = z.object({
  key,
  effect: z.record(z.string(), z.unknown()).default({}),
});
const budgetEvent = z.object({
  key,
  weight,
  type: z.enum(["EXPENSE", "INCOME", "CHOICE"]),
  amountVnd: vndSigned,
  choices: z.array(budgetEventChoice).max(6).default([]),
});

export const budgetConfigSchema = z
  .object({
    months: z.number().int().min(1).max(24),
    monthlyIncomeVnd: vnd,
    openingCashVnd: vnd,
    fixedBills: z.array(z.object({ key, amountVnd: vnd })).max(10).default([]),
    categories: z
      .array(
        z.object({
          key,
          kind: z.enum(["NEED", "WANT", "SAVING"]),
          minVnd: vnd,
          recommendedVnd: vnd,
        }),
      )
      .min(1)
      .max(12),
    events: z.array(budgetEvent).max(30).default([]),
    allowDebt: z.boolean(),
    eventCountPerMonth: z
      .object({ min: z.number().int().min(0).max(10), max: z.number().int().min(0).max(10) })
      .refine((v) => v.max >= v.min, { message: "max must be >= min" }),
    savingsMonthlyInterestBps: bps,
    presets: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })
  .refine((c) => c.events.every((e) => e.type !== "CHOICE" || e.choices.length > 0), {
    message: "CHOICE events need at least one choice",
    path: ["events"],
  });

export const loansConfigSchema = z.object({
  goalKey: key,
  goalPriceVnd: vnd,
  playerCashVnd: vnd,
  monthlyBudgetVnd: vnd,
  redFlagRevealAfter: z.number().int().min(0).max(24),
  offers: z
    .array(
      z.object({
        key,
        principalVnd: vnd,
        annualRateBps: bps,
        termMonths: z.number().int().min(1).max(120),
        method: z.enum(["ANNUITY", "DECLINING_BALANCE"]),
        upfrontFeeVnd: vnd,
        earlyRepayPenaltyBps: bps,
        legit: z.boolean(),
        marketingKey: key.optional(),
        redFlags: z.array(z.string().max(60)).max(10).optional(),
      }),
    )
    .min(1)
    .max(8),
  incomeEvents: z.array(z.object({ key, weight, amountVnd: vndSigned })).max(20).default([]),
  months: z.number().int().min(1).max(60),
});

export const scamConfigSchema = z
  .object({
    rounds: z.number().int().min(1).max(50),
    timerSecondsPerRound: z.number().int().min(5).max(300).nullable(),
    livesMode: z.boolean(),
    scoring: z.object({
      correctFlag: z.number().int(),
      correctTrust: z.number().int(),
      missedScam: z.number().int(),
      falseAlarm: z.number().int(),
      cueBonusEach: z.number().int(),
    }),
    pool: z
      .array(
        z.object({
          key,
          channel: z.string().max(20),
          isScam: z.boolean(),
          scamType: z.string().max(40).optional(),
          cues: z.array(z.string().max(60)).max(10).default([]),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine((c) => c.pool.length >= c.rounds, {
    message: "pool must contain at least `rounds` messages",
    path: ["pool"],
  });

export const businessConfigSchema = z.object({
  weeks: z.number().int().min(1).max(52),
  openingCashVnd: vnd,
  product: z.object({
    key,
    unitCostVnd: vnd,
    spoilagePctBpsPerWeek: bps,
  }),
  demandCurve: z.object({
    basePriceVnd: vnd,
    baseDemandUnits: z.number().int().min(1).max(100_000),
    elasticity: z.number().max(0),
    noiseBps: bps,
  }),
  weather: z.array(z.object({ key, weight, demandMultBps: bps })).min(1).max(10),
  upgrades: z
    .array(
      z.object({
        key,
        costVnd: vnd,
        demandMultBps: bps.optional(),
        spoilageMultBps: bps.optional(),
      }),
    )
    .max(10)
    .default([]),
  fixedCostPerWeekVnd: vnd,
  events: z.array(z.object({ key, weight, costVnd: vnd })).max(20).default([]),
  priceMinVnd: vnd,
  priceMaxVnd: vnd,
});

export const investConfigSchema = z.object({
  turns: z.number().int().min(1).max(60),
  turnLabelKey: z.string().max(30),
  startingCashVnd: vnd,
  assets: z
    .array(
      z.object({
        key,
        class: z.enum(["DEPOSIT", "BOND", "STOCK", "CRYPTO"]),
        meanReturnBps: z.number().int().min(-10_000).max(10_000),
        volBps: bps,
        feeBps: bps,
        crashChanceBps: bps.optional(),
        crashSizeBps: z.number().int().min(-10_000).max(0).optional(),
      }),
    )
    .min(1)
    .max(8),
  newsEvents: z
    .array(
      z.object({
        key,
        affects: key.nullable(),
        biasBps: z.number().int().min(-10_000).max(10_000),
        weight,
      }),
    )
    .max(30)
    .default([]),
  rebalanceFeeVnd: vnd,
});

export const SIM_CONFIG_SCHEMAS: Record<
  "BUDGET" | "LOANS" | "SCAM" | "BUSINESS" | "INVEST",
  z.ZodTypeAny
> = {
  BUDGET: budgetConfigSchema,
  LOANS: loansConfigSchema,
  SCAM: scamConfigSchema,
  BUSINESS: businessConfigSchema,
  INVEST: investConfigSchema,
};
