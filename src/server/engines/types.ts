import type { SimType } from "@prisma/client";
import type { Rng } from "@/server/lib/rng";
import { ruleViolation } from "@/server/lib/errors";

// Common engine contract - doc 04 §1. Engines are pure state machines:
// no DB access, no Date.now, no Math.random. All randomness comes from the
// injected turnRng(seed, turnNumber); persistence is simService's job.
//
// State/config/view money values are integer đồng carried as JS numbers
// (all sim amounts ≤ 1e11, exact in doubles) and serialized as strings at
// the API boundary only where doc 03 requires (`*Vnd` view fields).

export interface ActionDescriptor {
  type: string;
  schema: object; // JSON-schema-ish hint for the client
}

export type EngineJson = Record<string, unknown>;

export interface ApplyResult {
  state: EngineJson;
  resultDelta: EngineJson;
  turnAdvanced: boolean;
  turnReport?: EngineJson;
}

export interface FinishResult {
  finished: boolean;
  status: "COMPLETED" | "FAILED";
  summary?: EngineJson & { awardBadge?: string | null };
}

export type TextBundle = Record<string, unknown>;

export interface Engine {
  type: SimType;
  /** Turn-0 state. optionsKey selects a config preset (default "default"). */
  init(config: EngineJson, seed: number, optionsKey: string): EngineJson;
  /** The ONLY serialization sent to clients - must strip the engine's secrets. */
  view(state: EngineJson, config: EngineJson, textBundle: TextBundle): EngineJson;
  availableActions(state: EngineJson, config: EngineJson): ActionDescriptor[];
  applyAction(state: EngineJson, config: EngineJson, action: EngineJson, rng: Rng): ApplyResult;
  isFinished(state: EngineJson, config: EngineJson): FinishResult;
}

/** Engine rule failure → 422 RULE_VIOLATION with machine code in details[0].message (doc 04 §7). */
export function engineError(code: string, msg?: string): never {
  throw ruleViolation(code, msg);
}

/** Config with a preset applied (doc 04 §2.1 `presets`). Unknown key → default. */
export function applyPreset(config: EngineJson, optionsKey: string): EngineJson {
  const presets = (config.presets ?? {}) as Record<string, EngineJson>;
  const preset = presets[optionsKey] ?? presets.default ?? {};
  const { presets: _drop, ...base } = config;
  return { ...base, ...preset };
}

export const num = (v: unknown): number => Number(v ?? 0);
export const str = (v: unknown): string => String(v ?? "");

/** Resolve a text key against the translation textBundle; falls back to the key. */
export function txt(bundle: TextBundle, key: string): unknown {
  return bundle[key] ?? key;
}
