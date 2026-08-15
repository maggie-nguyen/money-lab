import { describe, expect, it } from "vitest";
import { AppError } from "@/server/lib/errors";
import { getEngine, SECRET_PATHS } from "@/server/engines";
import { applyPreset, type EngineJson } from "@/server/engines/types";
import { turnRng } from "@/server/lib/rng";
import { ALL_TYPES, SEED_CONFIGS, randomAction, propertyRng, stableStringify } from "./harness";
import type { SimType } from "@prisma/client";

// doc 04 §8.2 - 200 random action sequences per engine:
//   · engines never throw anything but AppError (422 RULE_VIOLATION)
//   · view() never leaks secret paths (doc 04 §1.3 denylist)
//   · money fields never NaN/Infinity

const CASES = 200;
const MAX_STEPS = 30;

function assertNoSecrets(type: SimType, view: EngineJson): void {
  const json = stableStringify(view);
  expect(json).not.toMatch(/"NaN"|"-?Infinity"/);
  if (type === "SCAM") {
    // Past decisions legitimately reveal truth; only the CURRENT item is secret.
    const current = (view as { current?: Record<string, unknown> | null }).current;
    if (current) {
      expect(Object.keys(current).sort()).toEqual(["channel", "key", "sender", "text"]);
    }
    return;
  }
  for (const secret of SECRET_PATHS[type]) {
    expect(json, `secret path "${secret}" leaked in ${type} view`).not.toContain(`"${secret}"`);
  }
}

describe.each(ALL_TYPES)("%s property run", (type) => {
  it(`${CASES} random sequences: only AppError, no secret leaks, no NaN`, () => {
    const engine = getEngine(type);
    const config = SEED_CONFIGS[type];
    const cfg = applyPreset(config, "default");

    for (let c = 0; c < CASES; c++) {
      const rng = propertyRng(c * 31 + ALL_TYPES.indexOf(type));
      const seed = 1000 + c;
      let state = engine.init(config, seed, "default");
      let turnNumber = 0;
      assertNoSecrets(type, engine.view(state, cfg, {}));

      for (let step = 0; step < MAX_STEPS; step++) {
        if (engine.isFinished(state, cfg).finished) break;
        if (engine.availableActions(state, cfg).length === 0) break;
        const action = randomAction(type, state, cfg, rng);
        try {
          const res = engine.applyAction(state, cfg, action, turnRng(seed, turnNumber));
          state = res.state;
          if (res.turnAdvanced) turnNumber += 1;
        } catch (e) {
          if (!(e instanceof AppError)) {
            throw new Error(
              `${type} case ${c} step ${step} threw non-AppError on ${JSON.stringify(action)}: ${String(e)}`,
            );
          }
          continue; // rejected action, state unchanged - keep playing
        }
        assertNoSecrets(type, engine.view(state, cfg, {}));
      }

      // Terminal summary must also be secret-free and NaN-free
      const fin = engine.isFinished(state, cfg);
      if (fin.finished && fin.summary) {
        expect(stableStringify(fin.summary)).not.toMatch(/"NaN"|"-?Infinity"/);
      }
    }
  });
});

describe("LOANS discovery pedagogy", () => {
  it("effectiveAnnualRateBps hidden before COMPARE, revealed after", () => {
    const engine = getEngine("LOANS");
    const config = SEED_CONFIGS.LOANS;
    const cfg = applyPreset(config, "default");
    const state = engine.init(config, 7, "default");
    expect(stableStringify(engine.view(state, cfg, {}))).not.toContain("effectiveAnnualRateBps");
    const res = engine.applyAction(
      state, cfg,
      { type: "COMPARE", offerKeys: ["offer_bank"] },
      turnRng(7, 0),
    );
    const after = stableStringify(engine.view(res.state, cfg, {}));
    expect(after).toContain("effectiveAnnualRateBps");
    expect(after).not.toContain('"legit"'); // never, even after compare
  });
});
