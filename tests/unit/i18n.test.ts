import { describe, expect, it } from "vitest";
import { createT } from "@/lib/i18n";
import { parseLocale, resolveGuestLocale } from "@/lib/locale";
import { formatRelative, formatVndApprox, formatMinutes } from "@/lib/format";

describe("createT", () => {
  it("returns Vietnamese strings", () => {
    expect(createT("vi")("nav.settings")).toBe("Cài đặt");
  });

  it("interpolates variables", () => {
    expect(createT("vi")("stats.level", { level: 3 })).toBe("Cấp 3");
  });

  it("echoes unknown keys", () => {
    expect(createT("vi")("does.not.exist")).toBe("does.not.exist");
  });

  it("has localized API error codes and rule codes", () => {
    expect(createT("vi")("error.rule.INSUFFICIENT_COINS")).toBe("Bạn không đủ xu.");
    expect(createT("vi")("error.code.UNAUTHENTICATED")).toBe("Bạn cần đăng nhập để tiếp tục.");
  });
});

describe("quest title maps", () => {
  it("serializes quests with Vietnamese titles", async () => {
    const { QUEST_TITLES_VI, serializeQuest } = await import("@/server/services/gamificationService");
    const sample = serializeQuest(
      {
        id: "q1",
        code: "q_complete_lesson",
        questDate: "2026-08-17",
        targetInt: 1,
        progressInt: 0,
        completedAt: null,
        xpReward: 15,
        coinReward: 5,
      },
      "vi",
    );
    expect(sample.title).toBe(QUEST_TITLES_VI.q_complete_lesson);
  });
});

describe("locale helpers", () => {
  it("always resolves to vi", () => {
    expect(parseLocale("en")).toBe("vi");
    expect(parseLocale("fr")).toBe("vi");
    expect(resolveGuestLocale({ cookie: null, acceptLanguage: "en-US,en;q=0.9" })).toBe("vi");
  });
});

describe("format locale variants", () => {
  it("glosses approx money in Vietnamese", () => {
    expect(formatVndApprox("100133641")).toBe("khoảng 100,1 triệu");
    expect(formatVndApprox("70000000")).toBe("70 triệu");
  });

  it("formats relative time in Vietnamese", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    const then = new Date("2026-08-16T11:30:00.000Z").toISOString();
    expect(formatRelative(then, now)).toBe("30 phút trước");
  });

  it("formats minutes in Vietnamese", () => {
    expect(formatMinutes(90)).toBe("1 giờ 30 phút");
  });
});
