import type { SimType } from "@prisma/client";
import type { Engine } from "@/server/engines/types";
import { budgetEngine } from "@/server/engines/budget";
import { loansEngine } from "@/server/engines/loans";
import { scamEngine } from "@/server/engines/scam";
import { businessEngine } from "@/server/engines/business";
import { investEngine } from "@/server/engines/invest";

const ENGINES: Record<SimType, Engine> = {
  BUDGET: budgetEngine,
  LOANS: loansEngine,
  SCAM: scamEngine,
  BUSINESS: businessEngine,
  INVEST: investEngine,
};

export function getEngine(type: SimType): Engine {
  return ENGINES[type];
}

/** Per-engine view-secret denylist - property tests assert these paths never
 *  appear in view() output (doc 04 §1.3). */
export const SECRET_PATHS: Record<SimType, string[]> = {
  BUDGET: [],
  LOANS: ["legit"],
  SCAM: ["isScam", "scamType"], // of the current undecided item
  BUSINESS: ["elasticity", "noiseBps", "demandMultBps"],
  INVEST: ["pricePath", "newsPath"],
};
