import { describe, expect, it } from "vitest";
import { mulberry32, turnRng, weightedDraw, shuffle, seedFromString } from "@/server/lib/rng";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it("differs across seeds", () => {
    expect(mulberry32(1).next()).not.toBe(mulberry32(2).next());
  });
  it("next() stays in [0, 1)", () => {
    const rng = mulberry32(777);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("int(n) stays in [0, n)", () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
  it("gauss() produces finite values with sane spread", () => {
    const rng = mulberry32(4242);
    const xs = Array.from({ length: 2000 }, () => rng.gauss());
    expect(xs.every(Number.isFinite)).toBe(true);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });
});

describe("turnRng", () => {
  it("same (seed, turn) reproduces the sequence; different turns diverge", () => {
    expect(turnRng(42, 3).next()).toBe(turnRng(42, 3).next());
    expect(turnRng(42, 3).next()).not.toBe(turnRng(42, 4).next());
  });
});

describe("weightedDraw", () => {
  it("is deterministic under a seeded rng", () => {
    const items = [
      { key: "a", weight: 1 },
      { key: "b", weight: 5 },
    ];
    const pick = (seed: number) => weightedDraw(items, mulberry32(seed)).key;
    expect(pick(1)).toBe(pick(1));
  });
  it("draws roughly proportionally to weights", () => {
    const items = [
      { key: "rare", weight: 1 },
      { key: "common", weight: 9 },
    ];
    const rng = mulberry32(2026);
    let common = 0;
    for (let i = 0; i < 2000; i++) if (weightedDraw(items, rng).key === "common") common++;
    expect(common / 2000).toBeGreaterThan(0.85);
    expect(common / 2000).toBeLessThan(0.95);
  });
  it("single item always wins", () => {
    expect(weightedDraw([{ key: "only", weight: 3 }], mulberry32(1)).key).toBe("only");
  });
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, mulberry32(5));
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("is deterministic per seed", () => {
    const input = ["a", "b", "c", "d", "e"];
    expect(shuffle(input, mulberry32(11))).toEqual(shuffle(input, mulberry32(11)));
  });
});

describe("seedFromString", () => {
  it("is stable and unsigned", () => {
    const s = seedFromString("0198f001-aaaa-bbbb-cccc-000000000001");
    expect(s).toBe(seedFromString("0198f001-aaaa-bbbb-cccc-000000000001"));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(s)).toBe(true);
  });
  it("differs for different inputs", () => {
    expect(seedFromString("a")).not.toBe(seedFromString("b"));
  });
});
