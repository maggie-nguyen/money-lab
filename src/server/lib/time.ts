// All business-day logic in Asia/Ho_Chi_Minh (UTC+7, no DST) - doc 00 §4.
const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Calendar date YYYY-MM-DD in VN time for a given instant. */
export function vnDate(at: Date): string {
  const shifted = new Date(at.getTime() + VN_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** Yesterday's VN date string relative to `at`. */
export function vnYesterday(at: Date): string {
  return vnDate(new Date(at.getTime() - 24 * 3600 * 1000));
}

/** Monday (VN) of the week containing `at`, as YYYY-MM-DD. */
export function vnWeekStart(at: Date): string {
  const shifted = new Date(at.getTime() + VN_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? 6 : dow - 1;
  shifted.setUTCDate(shifted.getUTCDate() - diff);
  return shifted.toISOString().slice(0, 10);
}

/** UTC instant of VN midnight starting the given VN date. */
export function vnDateStartUtc(dateStr: string): Date {
  return new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - VN_OFFSET_MS);
}

/** Seconds until next VN midnight (used for tutor Retry-After). */
export function secondsUntilVnMidnight(at: Date): number {
  const today = vnDate(at);
  const next = new Date(vnDateStartUtc(today).getTime() + 24 * 3600 * 1000);
  return Math.max(1, Math.ceil((next.getTime() - at.getTime()) / 1000));
}

/** Difference in whole days between two YYYY-MM-DD strings (a - b). */
export function dateDiffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000,
  );
}

/** Injected clock (doc 08 §3.2): services take `now` so tests control time. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
