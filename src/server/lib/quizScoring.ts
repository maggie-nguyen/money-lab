// Question scoring - doc 05 §4. Pure functions, 100%-branch-tested.

export interface ScoreResult {
  isCorrect: boolean; // full credit
  pointsAwarded: number;
}

const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

type Json = Record<string, unknown>;

export function scoreQuestion(
  type: string,
  answerKey: Json,
  response: Json | null,
  points: number,
): ScoreResult {
  if (!response) return { isCorrect: false, pointsAwarded: 0 };
  switch (type) {
    case "SINGLE_CHOICE": {
      const ok = response.choice === answerKey.correct;
      return { isCorrect: ok, pointsAwarded: ok ? points : 0 };
    }
    case "TRUE_FALSE": {
      const ok = response.value === answerKey.correct;
      return { isCorrect: ok, pointsAwarded: ok ? points : 0 };
    }
    case "MULTI_CHOICE": {
      // partial: max(0, right − wrong) / rightTotal · points, round half-up
      const correct = new Set((answerKey.correct as string[]) ?? []);
      const chosen = Array.isArray(response.choices) ? (response.choices as string[]) : [];
      const chosenSet = new Set(chosen);
      let right = 0;
      let wrong = 0;
      for (const c of chosenSet) {
        if (correct.has(c)) right++;
        else wrong++;
      }
      const total = correct.size;
      if (total === 0) return { isCorrect: false, pointsAwarded: 0 };
      const awarded = roundHalfUp((Math.max(0, right - wrong) / total) * points);
      return { isCorrect: right === total && wrong === 0, pointsAwarded: awarded };
    }
    case "NUMERIC": {
      const expected = BigInt(String(answerKey.value));
      let got: bigint;
      try {
        got = BigInt(String(response.value));
      } catch {
        return { isCorrect: false, pointsAwarded: 0 };
      }
      const diff = got > expected ? got - expected : expected - got;
      const tolAbs = answerKey.toleranceAbs !== undefined ? BigInt(String(answerKey.toleranceAbs)) : 0n;
      const tolBps =
        answerKey.toleranceBps !== undefined
          ? (absBig(expected) * BigInt(Number(answerKey.toleranceBps))) / 10000n
          : 0n;
      const ok = diff <= tolAbs || (tolBps > 0n && diff <= tolBps);
      return { isCorrect: ok, pointsAwarded: ok ? points : 0 };
    }
    case "ORDERING": {
      const expected = (answerKey.order as string[]) ?? [];
      const got = Array.isArray(response.order) ? (response.order as string[]) : [];
      const ok =
        expected.length > 0 &&
        expected.length === got.length &&
        expected.every((k, i) => got[i] === k);
      return { isCorrect: ok, pointsAwarded: ok ? points : 0 };
    }
    case "MATCHING": {
      // partial per correct pair
      const pairs = (answerKey.pairs as Record<string, string>) ?? {};
      const got = (response.pairs as Record<string, string>) ?? {};
      const total = Object.keys(pairs).length;
      if (total === 0) return { isCorrect: false, pointsAwarded: 0 };
      let right = 0;
      for (const [l, r] of Object.entries(pairs)) if (got[l] === r) right++;
      const awarded = roundHalfUp((right / total) * points);
      return { isCorrect: right === total, pointsAwarded: awarded };
    }
    case "SCENARIO_CHOICE": {
      // best=full, acceptable=half (round half-up), else 0
      const choice = response.choice;
      if (choice === answerKey.best) return { isCorrect: true, pointsAwarded: points };
      const acceptable = (answerKey.acceptable as string[]) ?? [];
      if (typeof choice === "string" && acceptable.includes(choice)) {
        return { isCorrect: false, pointsAwarded: roundHalfUp(points / 2) };
      }
      return { isCorrect: false, pointsAwarded: 0 };
    }
    default:
      return { isCorrect: false, pointsAwarded: 0 };
  }
}

function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

/** Zod-free structural check of a response for a question type (VALIDATION_ERROR upstream). */
export function isValidResponseShape(type: string, response: unknown): boolean {
  if (typeof response !== "object" || response === null) return false;
  const r = response as Json;
  switch (type) {
    case "SINGLE_CHOICE":
    case "SCENARIO_CHOICE":
      return typeof r.choice === "string";
    case "MULTI_CHOICE":
      return Array.isArray(r.choices) && r.choices.every((c) => typeof c === "string");
    case "TRUE_FALSE":
      return typeof r.value === "boolean";
    case "NUMERIC":
      return typeof r.value === "string" && /^-?\d+$/.test(r.value);
    case "ORDERING":
      return Array.isArray(r.order) && r.order.every((c) => typeof c === "string");
    case "MATCHING":
      return (
        typeof r.pairs === "object" &&
        r.pairs !== null &&
        Object.values(r.pairs).every((v) => typeof v === "string")
      );
    default:
      return false;
  }
}
