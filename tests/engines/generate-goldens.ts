/**
 * (Re)generates tests/engines/*.golden.json - doc 04 §8.1.
 * Run when an intentional engine/config change alters outcomes, and commit the
 * updated fixtures in the same PR:
 *   pnpm exec tsx --tsconfig tsconfig.json tests/engines/generate-goldens.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ALL_TYPES, SEED_CONFIGS, runPolicy, hashState } from "./harness";

const GOLDEN_SEED = 987654321;

for (const type of ALL_TYPES) {
  const run = runPolicy(type, SEED_CONFIGS[type], GOLDEN_SEED);
  if (!run.finished) throw new Error(`${type}: policy did not finish (turn ${run.turnNumber})`);
  const fixture = {
    type,
    seed: GOLDEN_SEED,
    actions: run.actions,
    turnNumber: run.turnNumber,
    status: run.status,
    finalStateHash: hashState(run.finalState),
    summaryHash: hashState(run.summary ?? null),
  };
  const file = path.join(__dirname, `${type.toLowerCase()}.golden.json`);
  writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(`${type}: ${run.actions.length} actions, ${run.turnNumber} turns, ${run.status} → ${file}`);
}
