import { describe, expect, it } from "vitest";
import {
  roundVnd,
  parseVnd,
  vndToString,
  dec,
  applyBps,
  bigintReplacer,
  jsonStringify,
} from "@/server/lib/money";

// doc 08 §3: 100% branch on money.ts - this is where real-world harm lives.

describe("roundVnd", () => {
  it("rounds half-up at .5", () => {
    expect(roundVnd("2.5")).toBe(3n);
    expect(roundVnd("2.4")).toBe(2n);
    expect(roundVnd("2.6")).toBe(3n);
  });
  it("half-up on negatives goes toward positive infinity magnitude per decimal.js ROUND_HALF_UP", () => {
    // decimal.js ROUND_HALF_UP rounds away from zero on .5
    expect(roundVnd("-2.5")).toBe(-3n);
    expect(roundVnd("-2.4")).toBe(-2n);
  });
  it("passes integers through", () => {
    expect(roundVnd("123456789")).toBe(123456789n);
    expect(roundVnd(0)).toBe(0n);
  });
  it("handles large amounts beyond double precision", () => {
    expect(roundVnd("90071992547409930.4")).toBe(90071992547409930n);
  });
});

describe("parseVnd", () => {
  it("parses positive and negative integer strings", () => {
    expect(parseVnd("12500000")).toBe(12500000n);
    expect(parseVnd("-500")).toBe(-500n);
    expect(parseVnd("0")).toBe(0n);
  });
  it("rejects decimals, separators, blanks, garbage", () => {
    for (const bad of ["12.5", "1,000", "", " 5", "5 ", "1e6", "+5", "abc", "--3"]) {
      expect(() => parseVnd(bad), bad).toThrow(/Invalid VND/);
    }
  });
});

describe("vndToString / dec", () => {
  it("serializes bigint", () => {
    expect(vndToString(1234567890123n)).toBe("1234567890123");
    expect(vndToString(-42n)).toBe("-42");
  });
  it("dec accepts bigint, number, string", () => {
    expect(dec(5n).toNumber()).toBe(5);
    expect(dec(5).toNumber()).toBe(5);
    expect(dec("5").toNumber()).toBe(5);
  });
});

describe("applyBps", () => {
  it("computes basis points with half-up rounding", () => {
    expect(applyBps(1_000_000n, 40)).toBe(4000n); // 0.40%
    expect(applyBps(1_000_000n, 10000)).toBe(1_000_000n); // 100%
    expect(applyBps(333n, 5000)).toBe(167n); // 166.5 → 167
    expect(applyBps(0n, 1234)).toBe(0n);
  });
  it("handles negative bps (discounts) exactly", () => {
    expect(applyBps(1_000_000n, -6000)).toBe(-600_000n);
  });
});

describe("bigintReplacer / jsonStringify", () => {
  it("turns bigint into string, leaves everything else", () => {
    expect(bigintReplacer("k", 5n)).toBe("5");
    expect(bigintReplacer("k", "x")).toBe("x");
    expect(bigintReplacer("k", null)).toBe(null);
  });
  it("stringifies nested bigints", () => {
    expect(jsonStringify({ a: 1n, b: [2n, { c: 3n }], d: "s" })).toBe(
      '{"a":"1","b":["2",{"c":"3"}],"d":"s"}',
    );
  });
});
