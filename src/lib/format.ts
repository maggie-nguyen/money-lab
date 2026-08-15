/**
 * Display formatting. Money always arrives from the API as a decimal string of
 * đồng and is formatted with BigInt, never parseInt (doc 06 §5).
 */

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

/** Compact money for tight cells: 12.500.000 → "12,5 tr". */
export function formatVndShort(vnd: string | bigint | null | undefined): string {
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
  if (abs >= 1_000_000_000n) return `${sign}${oneDecimal(abs, 1_000_000_000n)} tỷ`;
  if (abs >= 1_000_000n) return `${sign}${oneDecimal(abs, 1_000_000n)} tr`;
  if (abs >= 1_000n) return `${sign}${oneDecimal(abs, 1_000n)} n`;
  return `${sign}${abs.toString()}`;
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

/** "2026-08-14T…" → "14 tháng 8, 2026" (Asia/Ho_Chi_Minh). */
export function formatDate(iso: string | null | undefined, opts?: { weekday?: boolean }): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  const base = `${vn.getUTCDate()} ${VN_MONTHS[vn.getUTCMonth()]}, ${vn.getUTCFullYear()}`;
  return opts?.weekday ? `${VN_WEEKDAYS[vn.getUTCDay()]}, ${base}` : base;
}

/** Relative time in Vietnamese, for feeds and thread lists. */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const sec = Math.round((now.getTime() - then) / 1000);
  if (sec < 60) return "vừa xong";
  if (sec < 3600) return `${Math.floor(sec / 60)} phút trước`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} giờ trước`;
  if (sec < 7 * 86400) return `${Math.floor(sec / 86400)} ngày trước`;
  return formatDate(iso);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}
