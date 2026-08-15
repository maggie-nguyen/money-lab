import { describe, expect, it } from "vitest";
import {
  vnDate,
  vnYesterday,
  vnWeekStart,
  vnDateStartUtc,
  secondsUntilVnMidnight,
  dateDiffDays,
  systemClock,
} from "@/server/lib/time";

// Asia/Ho_Chi_Minh = UTC+7, no DST. VN midnight = 17:00 UTC previous day.

describe("vnDate", () => {
  it("rolls to the next day at 17:00 UTC", () => {
    expect(vnDate(new Date("2026-08-14T16:59:59Z"))).toBe("2026-08-14");
    expect(vnDate(new Date("2026-08-14T17:00:00Z"))).toBe("2026-08-15");
  });
  it("handles month and year boundaries", () => {
    expect(vnDate(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
    expect(vnDate(new Date("2026-02-28T18:30:00Z"))).toBe("2026-03-01");
  });
});

describe("vnYesterday", () => {
  it("is exactly one VN calendar day earlier", () => {
    expect(vnYesterday(new Date("2026-08-14T17:00:00Z"))).toBe("2026-08-14");
    expect(vnYesterday(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12-31");
  });
});

describe("vnWeekStart", () => {
  it("returns Monday of the VN week", () => {
    // 2026-08-14 is a Friday (VN) → Monday 2026-08-10
    expect(vnWeekStart(new Date("2026-08-14T04:00:00Z"))).toBe("2026-08-10");
  });
  it("Sunday belongs to the week starting the previous Monday", () => {
    // 2026-08-16 is a Sunday (VN)
    expect(vnWeekStart(new Date("2026-08-16T04:00:00Z"))).toBe("2026-08-10");
  });
  it("Monday maps to itself", () => {
    expect(vnWeekStart(new Date("2026-08-10T04:00:00Z"))).toBe("2026-08-10");
  });
});

describe("vnDateStartUtc", () => {
  it("VN midnight is 17:00 UTC the previous day", () => {
    expect(vnDateStartUtc("2026-08-14").toISOString()).toBe("2026-08-13T17:00:00.000Z");
  });
  it("round-trips with vnDate", () => {
    const start = vnDateStartUtc("2026-08-14");
    expect(vnDate(start)).toBe("2026-08-14");
    expect(vnDate(new Date(start.getTime() - 1000))).toBe("2026-08-13");
  });
});

describe("secondsUntilVnMidnight", () => {
  it("counts down to 17:00 UTC", () => {
    expect(secondsUntilVnMidnight(new Date("2026-08-14T16:59:00Z"))).toBe(60);
    // exactly at midnight → next midnight is 24h away
    expect(secondsUntilVnMidnight(new Date("2026-08-14T17:00:00Z"))).toBe(86400);
  });
  it("never returns less than 1", () => {
    expect(secondsUntilVnMidnight(new Date("2026-08-14T16:59:59.900Z"))).toBeGreaterThanOrEqual(1);
  });
});

describe("dateDiffDays", () => {
  it("computes whole-day differences", () => {
    expect(dateDiffDays("2026-08-14", "2026-08-13")).toBe(1);
    expect(dateDiffDays("2026-08-13", "2026-08-14")).toBe(-1);
    expect(dateDiffDays("2026-08-14", "2026-08-14")).toBe(0);
    expect(dateDiffDays("2027-01-01", "2026-01-01")).toBe(365);
  });
});

describe("systemClock", () => {
  it("returns the current time", () => {
    const before = Date.now();
    const t = systemClock().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });
});
