import { describe, expect, it } from "vitest";
import { scoreQuestion, isValidResponseShape } from "@/server/lib/quizScoring";

// doc 05 §4 - every scoring branch for all 7 question types.

describe("null / unknown", () => {
  it("null response scores 0 for any type", () => {
    expect(scoreQuestion("SINGLE_CHOICE", { correct: "a" }, null, 5)).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
  });
  it("unknown type scores 0", () => {
    expect(scoreQuestion("ESSAY", {}, { text: "x" }, 5)).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
  });
});

describe("SINGLE_CHOICE", () => {
  it("correct / incorrect", () => {
    expect(scoreQuestion("SINGLE_CHOICE", { correct: "b" }, { choice: "b" }, 2)).toEqual({
      isCorrect: true,
      pointsAwarded: 2,
    });
    expect(scoreQuestion("SINGLE_CHOICE", { correct: "b" }, { choice: "a" }, 2)).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
  });
});

describe("TRUE_FALSE", () => {
  it("matches booleans strictly", () => {
    expect(scoreQuestion("TRUE_FALSE", { correct: true }, { value: true }, 1).isCorrect).toBe(true);
    expect(scoreQuestion("TRUE_FALSE", { correct: true }, { value: false }, 1).isCorrect).toBe(false);
    // "true" string must NOT match
    expect(scoreQuestion("TRUE_FALSE", { correct: true }, { value: "true" }, 1).isCorrect).toBe(false);
  });
});

describe("MULTI_CHOICE partial credit: max(0, right−wrong)/total · points", () => {
  const key = { correct: ["a", "b", "c"] };
  it("all right → full", () => {
    expect(scoreQuestion("MULTI_CHOICE", key, { choices: ["a", "b", "c"] }, 6)).toEqual({
      isCorrect: true,
      pointsAwarded: 6,
    });
  });
  it("2 right, 0 wrong → 4/6", () => {
    expect(scoreQuestion("MULTI_CHOICE", key, { choices: ["a", "b"] }, 6)).toEqual({
      isCorrect: false,
      pointsAwarded: 4,
    });
  });
  it("wrong picks cancel right picks", () => {
    // 2 right − 1 wrong = 1 → 1/3 · 6 = 2
    expect(scoreQuestion("MULTI_CHOICE", key, { choices: ["a", "b", "x"] }, 6).pointsAwarded).toBe(2);
  });
  it("never negative", () => {
    expect(scoreQuestion("MULTI_CHOICE", key, { choices: ["x", "y", "z"] }, 6).pointsAwarded).toBe(0);
  });
  it("all right plus one wrong is NOT full credit", () => {
    const r = scoreQuestion("MULTI_CHOICE", key, { choices: ["a", "b", "c", "x"] }, 6);
    expect(r.isCorrect).toBe(false);
    expect(r.pointsAwarded).toBe(4); // (3−1)/3 · 6
  });
  it("duplicate choices count once", () => {
    expect(scoreQuestion("MULTI_CHOICE", key, { choices: ["a", "a", "b"] }, 6).pointsAwarded).toBe(4);
  });
  it("rounds half-up", () => {
    // 1 right / 2 total · 5 = 2.5 → 3
    expect(
      scoreQuestion("MULTI_CHOICE", { correct: ["a", "b"] }, { choices: ["a"] }, 5).pointsAwarded,
    ).toBe(3);
  });
  it("empty answer key → 0", () => {
    expect(scoreQuestion("MULTI_CHOICE", { correct: [] }, { choices: ["a"] }, 5).pointsAwarded).toBe(0);
  });
  it("non-array response treated as empty", () => {
    expect(scoreQuestion("MULTI_CHOICE", key, { choices: "a" }, 6).pointsAwarded).toBe(0);
  });
});

describe("NUMERIC", () => {
  it("exact match", () => {
    expect(scoreQuestion("NUMERIC", { value: "8884879" }, { value: "8884879" }, 3).isCorrect).toBe(true);
    expect(scoreQuestion("NUMERIC", { value: "8884879" }, { value: "8884880" }, 3).isCorrect).toBe(false);
  });
  it("absolute tolerance", () => {
    const key = { value: "1000000", toleranceAbs: "1000" };
    expect(scoreQuestion("NUMERIC", key, { value: "1001000" }, 3).isCorrect).toBe(true);
    expect(scoreQuestion("NUMERIC", key, { value: "1001001" }, 3).isCorrect).toBe(false);
    expect(scoreQuestion("NUMERIC", key, { value: "999000" }, 3).isCorrect).toBe(true);
  });
  it("bps tolerance", () => {
    const key = { value: "1000000", toleranceBps: 100 }; // 1% = 10,000
    expect(scoreQuestion("NUMERIC", key, { value: "1010000" }, 3).isCorrect).toBe(true);
    expect(scoreQuestion("NUMERIC", key, { value: "1010001" }, 3).isCorrect).toBe(false);
  });
  it("negative expected values use absolute value for bps tolerance", () => {
    const key = { value: "-1000000", toleranceBps: 100 };
    expect(scoreQuestion("NUMERIC", key, { value: "-1009999" }, 3).isCorrect).toBe(true);
  });
  it("unparseable response → 0", () => {
    expect(scoreQuestion("NUMERIC", { value: "5" }, { value: "abc" }, 3)).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
  });
});

describe("ORDERING", () => {
  const key = { order: ["s1", "s2", "s3"] };
  it("exact order only", () => {
    expect(scoreQuestion("ORDERING", key, { order: ["s1", "s2", "s3"] }, 4).isCorrect).toBe(true);
    expect(scoreQuestion("ORDERING", key, { order: ["s2", "s1", "s3"] }, 4).pointsAwarded).toBe(0);
  });
  it("length mismatch fails", () => {
    expect(scoreQuestion("ORDERING", key, { order: ["s1", "s2"] }, 4).isCorrect).toBe(false);
    expect(scoreQuestion("ORDERING", key, { order: ["s1", "s2", "s3", "s3"] }, 4).isCorrect).toBe(false);
  });
  it("empty expected order never passes", () => {
    expect(scoreQuestion("ORDERING", { order: [] }, { order: [] }, 4).isCorrect).toBe(false);
  });
  it("non-array response treated as empty", () => {
    expect(scoreQuestion("ORDERING", key, { order: "s1" }, 4).pointsAwarded).toBe(0);
  });
});

describe("MATCHING partial per pair", () => {
  const key = { pairs: { l1: "r1", l2: "r2", l3: "r3", l4: "r4" } };
  it("all pairs → full", () => {
    expect(
      scoreQuestion("MATCHING", key, { pairs: { l1: "r1", l2: "r2", l3: "r3", l4: "r4" } }, 4),
    ).toEqual({ isCorrect: true, pointsAwarded: 4 });
  });
  it("half pairs → half points", () => {
    const r = scoreQuestion("MATCHING", key, { pairs: { l1: "r1", l2: "r2", l3: "r4", l4: "r3" } }, 4);
    expect(r.isCorrect).toBe(false);
    expect(r.pointsAwarded).toBe(2);
  });
  it("rounds half-up: 1/4 of 2 points = 0.5 → 1", () => {
    expect(
      scoreQuestion("MATCHING", key, { pairs: { l1: "r1" } }, 2).pointsAwarded,
    ).toBe(1);
  });
  it("empty answer key → 0", () => {
    expect(scoreQuestion("MATCHING", { pairs: {} }, { pairs: {} }, 4).pointsAwarded).toBe(0);
  });
  it("missing pairs in response → those score nothing", () => {
    expect(scoreQuestion("MATCHING", key, {}, 4).pointsAwarded).toBe(0);
  });
});

describe("SCENARIO_CHOICE best / acceptable / wrong", () => {
  const key = { best: "a", acceptable: ["b", "c"] };
  it("best → full credit and isCorrect", () => {
    expect(scoreQuestion("SCENARIO_CHOICE", key, { choice: "a" }, 5)).toEqual({
      isCorrect: true,
      pointsAwarded: 5,
    });
  });
  it("acceptable → half points (half-up), not isCorrect", () => {
    expect(scoreQuestion("SCENARIO_CHOICE", key, { choice: "b" }, 5)).toEqual({
      isCorrect: false,
      pointsAwarded: 3, // 2.5 → 3
    });
  });
  it("wrong → 0", () => {
    expect(scoreQuestion("SCENARIO_CHOICE", key, { choice: "z" }, 5).pointsAwarded).toBe(0);
  });
  it("no acceptable list → only best scores", () => {
    expect(scoreQuestion("SCENARIO_CHOICE", { best: "a" }, { choice: "b" }, 5).pointsAwarded).toBe(0);
  });
  it("non-string choice → 0", () => {
    expect(scoreQuestion("SCENARIO_CHOICE", key, { choice: 2 }, 5).pointsAwarded).toBe(0);
  });
});

describe("isValidResponseShape", () => {
  it("accepts the canonical shape per type", () => {
    expect(isValidResponseShape("SINGLE_CHOICE", { choice: "a" })).toBe(true);
    expect(isValidResponseShape("SCENARIO_CHOICE", { choice: "a" })).toBe(true);
    expect(isValidResponseShape("MULTI_CHOICE", { choices: ["a", "b"] })).toBe(true);
    expect(isValidResponseShape("TRUE_FALSE", { value: false })).toBe(true);
    expect(isValidResponseShape("NUMERIC", { value: "-12500" })).toBe(true);
    expect(isValidResponseShape("ORDERING", { order: ["a"] })).toBe(true);
    expect(isValidResponseShape("MATCHING", { pairs: { l: "r" } })).toBe(true);
  });
  it("rejects wrong shapes", () => {
    expect(isValidResponseShape("SINGLE_CHOICE", { choice: 1 })).toBe(false);
    expect(isValidResponseShape("MULTI_CHOICE", { choices: [1] })).toBe(false);
    expect(isValidResponseShape("TRUE_FALSE", { value: "true" })).toBe(false);
    expect(isValidResponseShape("NUMERIC", { value: "1.5" })).toBe(false);
    expect(isValidResponseShape("NUMERIC", { value: 15 })).toBe(false);
    expect(isValidResponseShape("ORDERING", { order: "abc" })).toBe(false);
    expect(isValidResponseShape("MATCHING", { pairs: { l: 2 } })).toBe(false);
    expect(isValidResponseShape("MATCHING", { pairs: null })).toBe(false);
    expect(isValidResponseShape("SINGLE_CHOICE", null)).toBe(false);
    expect(isValidResponseShape("SINGLE_CHOICE", "a")).toBe(false);
    expect(isValidResponseShape("ESSAY", { text: "x" })).toBe(false);
  });
});
