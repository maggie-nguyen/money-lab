/**
 * Display formatting. Money always arrives from the API as a decimal string of
 * đồng and is formatted with BigInt, never parseInt (doc 06 §5).
 */

import type { Locale } from "@/lib/types";
import { DEFAULT_LOCALE } from "@/lib/locale";
import { createT } from "@/lib/i18n";

const VN_GROUP = /\B(?=(\d{3})+(?!\d))/g;

/** "12500000" → "12.500.000 ₫". Negative values keep the sign in front. */
export function formatVnd(vnd: string | bigint | null | undefined, opts?: { unit?: boolean }): string {
  if (vnd === null || vnd === undefined || vnd === "") return "-";
  let v: bigint;
  try {
    v = typeof vnd === "bigint" ? vnd : BigInt(vnd);
  } catch {
    return "-";
  }
  const neg = v < 0n;
  const digits = (neg ? -v : v).toString().replace(VN_GROUP, ".");
  const unit = opts?.unit === false ? "" : " ₫";
  return `${neg ? "-" : ""}${digits}${unit}`;
}

/** Compact money for tight cells: 12.500.000 → "12,5 tr" / "12.5M". */
export function formatVndShort(
  vnd: string | bigint | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (vnd === null || vnd === undefined || vnd === "") return "-";
  let v: bigint;
  try {
    v = typeof vnd === "bigint" ? vnd : BigInt(vnd);
  } catch {
    return "-";
  }
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const sign = neg ? "-" : "";
  const t = createT(locale);
  if (abs >= 1_000_000_000n) {
    return `${sign}${oneDecimal(abs, 1_000_000_000n)}${t("format.shortBillion")}`;
  }
  if (abs >= 1_000_000n) {
    return `${sign}${oneDecimal(abs, 1_000_000n)}${t("format.shortMillion")}`;
  }
  if (abs >= 1_000n) {
    return `${sign}${oneDecimal(abs, 1_000n)}${t("format.shortThousand")}`;
  }
  return `${sign}${abs.toString()}`;
}

/**
 * A plain language gloss for a large figure: "khoảng 100,1 triệu" / "about 100.1 million".
 *
 * Thirteen grouped digits are precise but slow to read, and a learner comparing
 * two results mostly wants the magnitude. Returns null below a million, where
 * the grouped digits are already easy enough to take in at a glance, and drops
 * the "about" prefix when the short form happens to be exact.
 */
export function formatVndApprox(
  vnd: string | bigint | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (vnd === null || vnd === undefined || vnd === "") return null;
  let v: bigint;
  try {
    v = typeof vnd === "bigint" ? vnd : BigInt(vnd);
  } catch {
    return null;
  }
  const neg = v < 0n;
  const abs = neg ? -v : v;
  if (abs < 1_000_000n) return null;
  const unit = abs >= 1_000_000_000n ? 1_000_000_000n : 1_000_000n;
  const t = createT(locale);
  const word = unit === 1_000_000_000n ? t("format.billion") : t("format.million");
  const tenths = (abs * 10n) / unit;
  const exact = (tenths * unit) / 10n === abs;
  const decimal = oneDecimal(abs, unit);
  return `${exact ? "" : t("format.about")}${neg ? "-" : ""}${decimal} ${word}`;
}

function oneDecimal(abs: bigint, unit: bigint): string {
  const whole = abs / unit;
  const tenth = ((abs % unit) * 10n) / unit;
  return tenth === 0n ? whole.toString() : `${whole},${tenth}`;
}

/** Integer bps → "12,5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1).replace(".", ",")}%`;
}

export function formatPct(pct: number, digits = 0): string {
  return `${pct.toFixed(digits).replace(".", ",")}%`;
}

export function formatInt(n: number): string {
  return Math.round(n).toString().replace(VN_GROUP, ".");
}

const VN_MONTHS = [
  "tháng 1", "tháng 2", "tháng 3", "tháng 4", "tháng 5", "tháng 6",
  "tháng 7", "tháng 8", "tháng 9", "tháng 10", "tháng 11", "tháng 12",
];
const VN_WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** "2026-08-14T…" → localized calendar date (Asia/Ho_Chi_Minh). */
export function formatDate(
  iso: string | null | undefined,
  opts?: { weekday?: boolean; locale?: Locale },
): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  const base = `${vn.getUTCDate()} ${VN_MONTHS[vn.getUTCMonth()]}, ${vn.getUTCFullYear()}`;
  return opts?.weekday ? `${VN_WEEKDAYS[vn.getUTCDay()]}, ${base}` : base;
}

/** Relative time for feeds and thread lists. */
export function formatRelative(
  iso: string | null | undefined,
  now = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const t = createT(locale);
  const sec = Math.round((now.getTime() - then) / 1000);
  if (sec < 60) return t("format.justNow");
  if (sec < 3600) return t("format.minutesAgo", { count: Math.floor(sec / 60) });
  if (sec < 86400) return t("format.hoursAgo", { count: Math.floor(sec / 3600) });
  if (sec < 7 * 86400) return t("format.daysAgo", { count: Math.floor(sec / 86400) });
  return formatDate(iso, { locale });
}

export function formatMinutes(min: number, locale: Locale = DEFAULT_LOCALE): string {
  const t = createT(locale);
  if (min < 60) return t("format.minutesOnly", { count: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? t("format.hoursOnly", { count: h }) : t("format.hoursMinutes", { h, m });
}
