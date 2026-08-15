import Decimal from "decimal.js";

// Money hard rules - doc 00 §4. VND stored as bigint đồng, serialized as JSON string.

Decimal.set({ precision: 40 });

/** Round half-up to the nearest đồng and return bigint. */
export function roundVnd(x: Decimal.Value): bigint {
  const d = new Decimal(x).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return BigInt(d.toFixed(0));
}

/** Parse an API money string ("12500000" or "-500") into bigint. Throws on bad input. */
export function parseVnd(s: string): bigint {
  if (!/^-?\d+$/.test(s)) throw new Error(`Invalid VND amount: ${s}`);
  return BigInt(s);
}

/** Serialize for the API boundary. */
export function vndToString(v: bigint): string {
  return v.toString();
}

export function dec(v: bigint | number | string): Decimal {
  return new Decimal(typeof v === "bigint" ? v.toString() : v);
}

/** Apply basis points to an amount: amount · bps/10000, rounded half-up. */
export function applyBps(amountVnd: bigint, bps: number): bigint {
  return roundVnd(dec(amountVnd).mul(bps).div(10000));
}

/** JSON.stringify replacer that turns bigint into string (doc 01 §4 step 9). */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function jsonStringify(value: unknown): string {
  return JSON.stringify(value, bigintReplacer);
}
