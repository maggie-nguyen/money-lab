/**
 * Shared engine-test harness - doc 04 §8.
 * Mirrors simService exactly: rng = turnRng(seed, turnNumber), turnNumber
 * increments only when applyAction reports turnAdvanced.
 */
import { createHash } from "node:crypto";
import { getEngine } from "@/server/engines";
import { applyPreset, type EngineJson } from "@/server/engines/types";
import { turnRng, mulberry32, type Rng } from "@/server/lib/rng";
import {
  BUDGET_CONFIG,
  LOANS_CONFIG,
  SCAM_CONFIG,
  BUSINESS_CONFIG,
  INVEST_CONFIG,
} from "@/server/engines/defaultConfigs";
import type { SimType } from "@prisma/client";

export const SEED_CONFIGS: Record<SimType, EngineJson> = {
  BUDGET: BUDGET_CONFIG as unknown as EngineJson,
  LOANS: LOANS_CONFIG as unknown as EngineJson,
  SCAM: SCAM_CONFIG as unknown as EngineJson,
  BUSINESS: BUSINESS_CONFIG as unknown as EngineJson,
  INVEST: INVEST_CONFIG as unknown as EngineJson,
};

export const ALL_TYPES: SimType[] = ["BUDGET", "LOANS", "SCAM", "BUSINESS", "INVEST"];

/** JSON with recursively sorted object keys - stable across runs and Node versions. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as object).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${body}}`;
}

export function hashState(state: unknown): string {
  return createHash("sha256").update(stableStringify(state)).digest("hex");
}

export interface RunResult {
  actions: EngineJson[];
  finalState: EngineJson;
  turnNumber: number;
  finished: boolean;
  status: "COMPLETED" | "FAILED";
  summary: EngineJson | undefined;
}

/** Replay a fixed action list the way simService would. Throws what the engine throws. */
export function replayActions(type: SimType, config: EngineJson, seed: number, actions: EngineJson[]): RunResult {
  const engine = getEngine(type);
  const cfg = applyPreset(config, "default");
  let state = engine.init(config, seed, "default");
  let turnNumber = 0;
  for (const action of actions) {
    const res = engine.applyAction(state, cfg, action, turnRng(seed, turnNumber));
    state = res.state;
    if (res.turnAdvanced) turnNumber += 1;
  }
  const fin = engine.isFinished(state, cfg);
  return {
    actions,
    finalState: state,
    turnNumber,
    finished: fin.finished,
    status: fin.status,
    summary: fin.summary,
  };
}

/** A deterministic "sensible player" action for the current state, per engine. */
export function policyAction(type: SimType, state: EngineJson, config: EngineJson, step: number): EngineJson {
  const s = state as Record<string, unknown>;
  switch (type) {
    case "BUDGET": {
      if (s.phase === "ALLOCATE") {
        const cats = (config.categories ?? []) as Array<{ key: string; kind: string; minVnd: string; recommendedVnd: string }>;
        const allocations: Record<string, string> = {};
        for (const c of cats) allocations[c.key] = c.kind === "NEED" ? c.minVnd : c.kind === "SAVING" ? c.recommendedVnd : "0";
        return { type: "SET_ALLOCATIONS", allocations };
      }
      if (s.phase === "EVENTS") {
        const pending = (s.pendingEvents ?? []) as Array<{ key: string }>;
        const defs = (config.events ?? []) as Array<{ key: string; choices?: Array<{ key: string }> }>;
        const ev = pending[0];
        const choice = defs.find((d) => d.key === ev?.key)?.choices?.[0];
        return { type: "RESOLVE_EVENT", eventKey: ev?.key ?? "", choiceKey: choice?.key ?? "" };
      }
      return { type: "END_MONTH" };
    }
    case "LOANS": {
      if (s.phase === "CHOOSE") {
        const offers = (config.offers ?? []) as Array<{ key: string }>;
        if (step === 0) return { type: "COMPARE", offerKeys: offers.map((o) => o.key) };
        return { type: "TAKE_LOAN", offerKey: offers[0]!.key };
      }
      return { type: "PAY_SCHEDULED" };
    }
    case "SCAM":
      // alternate verdicts deterministically - correctness doesn't matter for replay
      return { type: "DECIDE", verdict: step % 2 === 0 ? "SCAM" : "SAFE" };
    case "BUSINESS":
      return {
        type: "PLAN_WEEK",
        priceVnd: "15000",
        unitsToStock: 40,
        ...(step === 0 ? { buyUpgradeKeys: ["up_sign"] } : {}),
      };
    case "INVEST": {
      if (step === 0) {
        const assets = (config.assets ?? []) as Array<{ key: string }>;
        return {
          type: "REBALANCE",
          orders: assets.map((a) => ({ assetKey: a.key, action: "BUY", amountVnd: "4000000" })),
        };
      }
      return { type: "REBALANCE", orders: [] };
    }
  }
}

/** Play the deterministic policy to completion (safety cap prevents infinite loops). */
export function runPolicy(type: SimType, config: EngineJson, seed: number, maxSteps = 200): RunResult {
  const engine = getEngine(type);
  const cfg = applyPreset(config, "default");
  let state = engine.init(config, seed, "default");
  let turnNumber = 0;
  const actions: EngineJson[] = [];
  for (let step = 0; step < maxSteps; step++) {
    if (engine.isFinished(state, cfg).finished) break;
    if (engine.availableActions(state, cfg).length === 0) break;
    const action = policyAction(type, state, cfg, step);
    const res = engine.applyAction(state, cfg, action, turnRng(seed, turnNumber));
    actions.push(action);
    state = res.state;
    if (res.turnAdvanced) turnNumber += 1;
  }
  const fin = engine.isFinished(state, cfg);
  return { actions, finalState: state, turnNumber, finished: fin.finished, status: fin.status, summary: fin.summary };
}

/** Random-but-seeded action generator for property tests (mix of valid and junk). */
export function randomAction(type: SimType, state: EngineJson, config: EngineJson, rng: Rng): EngineJson {
  // 1 in 6: throw a structurally weird action at the engine
  if (rng.int(6) === 0) {
    const junk = [
      { type: "HACK" },
      {},
      { type: "SET_ALLOCATIONS" },
      { type: "REBALANCE", orders: [{ assetKey: "nope", action: "BUY", amountVnd: "-5" }] },
      { type: "DECIDE", verdict: "MAYBE" },
      { type: "PLAN_WEEK", priceVnd: "1", unitsToStock: -3 },
    ];
    return junk[rng.int(junk.length)]!;
  }
  const s = state as Record<string, unknown>;
  switch (type) {
    case "BUDGET": {
      if (s.phase === "ALLOCATE") {
        const cats = (config.categories ?? []) as Array<{ key: string; kind: string; minVnd: string; recommendedVnd: string }>;
        const allocations: Record<string, string> = {};
        for (const c of cats) {
          const min = Number(c.minVnd);
          allocations[c.key] = String(min + rng.int(500_000));
        }
        return { type: "SET_ALLOCATIONS", allocations };
      }
      if (s.phase === "EVENTS") {
        const pending = (s.pendingEvents ?? []) as Array<{ key: string }>;
        const defs = (config.events ?? []) as Array<{ key: string; choices?: Array<{ key: string }> }>;
        const ev = pending[rng.int(Math.max(1, pending.length))];
        const choices = defs.find((d) => d.key === ev?.key)?.choices ?? [];
        const choice = choices[rng.int(Math.max(1, choices.length))];
        return { type: "RESOLVE_EVENT", eventKey: ev?.key ?? "ghost", choiceKey: choice?.key ?? "ghost" };
      }
      return { type: "END_MONTH" };
    }
    case "LOANS": {
      if (s.phase === "CHOOSE") {
        const offers = (config.offers ?? []) as Array<{ key: string }>;
        const roll = rng.int(3);
        if (roll === 0) return { type: "COMPARE", offerKeys: [offers[rng.int(offers.length)]!.key] };
        if (roll === 1) return { type: "PAY_CASH_WAIT", months: 1 + rng.int(24) };
        return { type: "TAKE_LOAN", offerKey: offers[rng.int(offers.length)]!.key };
      }
      const roll = rng.int(3);
      if (roll === 0) return { type: "PAY_EXTRA", extraVnd: String(50_000 + rng.int(2_000_000)) };
      if (roll === 1) return { type: "RESTRUCTURE" };
      return { type: "PAY_SCHEDULED" };
    }
    case "SCAM":
      return {
        type: "DECIDE",
        verdict: rng.int(2) === 0 ? "SCAM" : "SAFE",
        ...(rng.int(2) === 0 ? { cueKeys: ["cue_urgent", "cue_fake"] } : {}),
      };
    case "BUSINESS":
      return {
        type: "PLAN_WEEK",
        priceVnd: String(1000 + rng.int(30_000)),
        unitsToStock: rng.int(300),
        ...(rng.int(4) === 0 ? { buyUpgradeKeys: ["up_sign", "up_fridge"] } : {}),
      };
    case "INVEST": {
      const assets = (config.assets ?? []) as Array<{ key: string }>;
      const n = rng.int(3);
      const orders = Array.from({ length: n }, () => ({
        assetKey: assets[rng.int(assets.length)]!.key,
        action: rng.int(2) === 0 ? "BUY" : "SELL",
        amountVnd: String(rng.int(10_000_000)),
      }));
      return { type: "REBALANCE", orders };
    }
  }
}

export function propertyRng(caseSeed: number): Rng {
  return mulberry32(0xabc0 + caseSeed);
}
