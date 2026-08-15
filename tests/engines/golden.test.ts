import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TYPES, SEED_CONFIGS, replayActions, hashState } from "./harness";
import type { EngineJson } from "@/server/engines/types";

// doc 04 §8.1 - golden replay: replaying the recorded action list against the
// same config+seed MUST reproduce the exact final state. Intentional engine or
// config changes regenerate fixtures via tests/engines/generate-goldens.ts in
// the same PR.

interface Golden {
  type: string;
  seed: number;
  actions: EngineJson[];
  turnNumber: number;
  status: "COMPLETED" | "FAILED";
  finalStateHash: string;
  summaryHash: string;
}

describe.each(ALL_TYPES)("%s golden replay", (type) => {
  const golden = JSON.parse(
    readFileSync(path.join(__dirname, `${type.toLowerCase()}.golden.json`), "utf8"),
  ) as Golden;

  it("reproduces the exact final state hash", () => {
    const run = replayActions(type, SEED_CONFIGS[type], golden.seed, golden.actions);
    expect(run.finished).toBe(true);
    expect(run.status).toBe(golden.status);
    expect(run.turnNumber).toBe(golden.turnNumber);
    expect(hashState(run.finalState)).toBe(golden.finalStateHash);
    expect(hashState(run.summary ?? null)).toBe(golden.summaryHash);
  });

  it("is idempotent - a second replay matches the first byte-for-byte", () => {
    const a = replayActions(type, SEED_CONFIGS[type], golden.seed, golden.actions);
    const b = replayActions(type, SEED_CONFIGS[type], golden.seed, golden.actions);
    expect(hashState(a.finalState)).toBe(hashState(b.finalState));
  });

  it("a different seed diverges (RNG actually feeds the engine)", () => {
    // SCAM/INVEST draw at init; BUDGET/LOANS/BUSINESS draw per turn - either
    // way the final state must depend on the seed.
    let other: string | null = null;
    try {
      other = hashState(replayActions(type, SEED_CONFIGS[type], golden.seed + 1, golden.actions).finalState);
    } catch {
      // action list may be invalid under another seed (e.g. different pending
      // events) - that is itself divergence.
    }
    expect(other).not.toBe(golden.finalStateHash);
  });
});
