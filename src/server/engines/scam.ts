import { mulberry32, shuffle } from "@/server/lib/rng";
import {
  type Engine,
  type EngineJson,
  type ApplyResult,
  type FinishResult,
  type ActionDescriptor,
  type TextBundle,
  engineError,
  applyPreset,
  num,
  str,
  txt,
} from "@/server/engines/types";

// SCAM - "Nhận diện lừa đảo" (doc 04 §4). One round = one turn; no FAILED state.
// SECRET: isScam/scamType/cues of the CURRENT undecided item never in view.

interface PoolItem {
  key: string;
  channel: string;
  isScam: boolean;
  scamType?: string;
  cues: string[];
}

interface Decision {
  key: string;
  verdict: "SCAM" | "SAFE";
  correct: boolean;
  isScam: boolean;
  scamType: string | null;
  cueHits: number;
  pointsDelta: number;
}

interface ScamState {
  round: number; // 1-based, current undecided round
  order: string[]; // drawn item keys, fixed at init
  decisions: Decision[];
  score: number;
  [k: string]: unknown;
}

function cfg(config: EngineJson) {
  const scoring = (config.scoring ?? {}) as Record<string, number>;
  return {
    rounds: num(config.rounds),
    pool: (config.pool as PoolItem[]) ?? [],
    scoring: {
      correctFlag: num(scoring.correctFlag),
      correctTrust: num(scoring.correctTrust),
      missedScam: num(scoring.missedScam),
      falseAlarm: num(scoring.falseAlarm),
      cueBonusEach: num(scoring.cueBonusEach),
    },
  };
}

export const scamEngine: Engine = {
  type: "SCAM",

  init(config, seed, optionsKey) {
    const c = cfg(applyPreset(config, optionsKey));
    // Draw `rounds` items without replacement, deterministic from the session seed
    const order = shuffle(c.pool.map((p) => p.key), mulberry32(seed)).slice(0, c.rounds);
    const state: ScamState = { round: 1, order, decisions: [], score: 0 };
    return state;
  },

  view(state, config, textBundle: TextBundle) {
    const s = state as ScamState;
    const c = cfg(config);
    const currentKey = s.order[s.round - 1];
    const item = c.pool.find((p) => p.key === currentKey);
    const text = (txt(textBundle, currentKey ?? "") ?? {}) as { sender?: string; text?: string };
    return {
      round: s.round,
      rounds: c.rounds,
      score: s.score,
      // Current item: display info ONLY - truth fields stripped (doc 04 §4.1)
      current:
        item && s.round <= c.rounds
          ? {
              key: item.key,
              channel: item.channel,
              sender: typeof text === "object" ? (text.sender ?? "") : "",
              text: typeof text === "object" ? (text.text ?? "") : String(text),
            }
          : null,
      // Past decisions with revealed truth + explanations (the feedback loop)
      decisions: s.decisions.map((d) => ({
        ...d,
        explanation: txt(textBundle, `expl_${d.key}`),
        cues: d.isScam ? (c.pool.find((p) => p.key === d.key)?.cues ?? []).map((cue) => txt(textBundle, cue)) : [],
      })),
    };
  },

  availableActions(state, config): ActionDescriptor[] {
    const s = state as ScamState;
    if (s.round > cfg(config).rounds) return [];
    return [
      { type: "DECIDE", schema: { verdict: '"SCAM" | "SAFE"', cueKeys: "string[] (optional)" } },
    ];
  },

  applyAction(state, config, action): ApplyResult {
    const s = structuredClone(state) as ScamState;
    const c = cfg(config);
    const type = str(action.type);
    if (type !== "DECIDE") engineError("UNKNOWN_ACTION", type);
    if (s.round > c.rounds) engineError("WRONG_PHASE");
    const verdict = str(action.verdict);
    if (verdict !== "SCAM" && verdict !== "SAFE") engineError("BAD_CHOICE", "verdict");

    const key = s.order[s.round - 1]!;
    if (s.decisions.some((d) => d.key === key)) engineError("DECIDE_DUPLICATE");
    const item = c.pool.find((p) => p.key === key)!;

    const cueKeys = Array.isArray(action.cueKeys) ? (action.cueKeys as string[]) : [];
    let points = 0;
    let cueHits = 0;
    const correct = (verdict === "SCAM") === item.isScam;
    if (item.isScam && verdict === "SCAM") {
      cueHits = cueKeys.filter((k) => item.cues.includes(k)).length;
      points = c.scoring.correctFlag + cueHits * c.scoring.cueBonusEach;
    } else if (!item.isScam && verdict === "SAFE") {
      points = c.scoring.correctTrust;
    } else if (item.isScam) {
      points = c.scoring.missedScam;
    } else {
      points = c.scoring.falseAlarm;
    }

    const decision: Decision = {
      key,
      verdict,
      correct,
      isScam: item.isScam,
      scamType: item.scamType ?? null,
      cueHits,
      pointsDelta: points,
    };
    s.decisions.push(decision);
    s.score += points;
    s.round += 1;

    return {
      state: s,
      // immediate feedback is the core loop (doc 04 §4.2)
      resultDelta: {
        correct,
        isScam: item.isScam,
        scamType: item.scamType ?? null,
        cues: item.cues,
        explanationKey: `expl_${key}`,
        pointsDelta: points,
      },
      turnAdvanced: true,
      turnReport: { round: decision.key, ...decision },
    };
  },

  isFinished(state, config): FinishResult {
    const s = state as ScamState;
    const c = cfg(config);
    if (s.round <= c.rounds) return { finished: false, status: "COMPLETED" };

    const maxScore = s.order.reduce((sum, key) => {
      const item = c.pool.find((p) => p.key === key)!;
      return sum + (item.isScam ? c.scoring.correctFlag + item.cues.length * c.scoring.cueBonusEach : c.scoring.correctTrust);
    }, 0);
    const correct = s.decisions.filter((d) => d.correct).length;
    const accuracyPct = Math.floor((correct / c.rounds) * 100);

    const byType = new Map<string, { seen: number; caught: number }>();
    for (const d of s.decisions) {
      if (!d.isScam) continue;
      const t = byType.get(d.scamType ?? "?") ?? { seen: 0, caught: 0 };
      t.seen += 1;
      if (d.correct) t.caught += 1;
      byType.set(d.scamType ?? "?", t);
    }
    return {
      finished: true,
      status: "COMPLETED",
      summary: {
        score: s.score,
        maxScore,
        accuracyPct,
        byScamType: [...byType.entries()].map(([type, v]) => ({ type, ...v })),
        missedKeys: s.decisions.filter((d) => d.isScam && !d.correct).map((d) => d.key),
        grade: accuracyPct >= 90 ? "A" : accuracyPct >= 70 ? "B" : accuracyPct >= 50 ? "C" : "D",
        awardBadge: accuracyPct >= 90 && c.rounds >= 10 ? "SIM_SCAM_DETECTIVE" : null,
      },
    };
  },
};
