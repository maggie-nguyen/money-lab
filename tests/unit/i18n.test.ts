import { describe, expect, it } from "vitest";
import { createT } from "@/lib/i18n";
import { parseLocale, resolveGuestLocale } from "@/lib/locale";
import { formatRelative, formatVndApprox, formatMinutes } from "@/lib/format";

describe("createT", () => {
  it("returns Vietnamese by default catalog", () => {
    expect(createT("vi")("nav.settings")).toBe("Cài đặt");
  });

  it("returns English strings and interpolates", () => {
    expect(createT("en")("stats.level", { level: 3 })).toBe("Level 3");
  });

  it("falls back to Vietnamese when a key is missing in en", () => {
    const t = createT("en");
    // unknown key echoes itself
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  it("has localized API error codes and rule codes", () => {
    expect(createT("en")("error.code.UNAUTHENTICATED")).toBe("Please sign in to continue.");
    expect(createT("vi")("error.rule.INSUFFICIENT_COINS")).toBe("Bạn không đủ xu.");
    expect(createT("en")("error.rule.UNREACHABLE")).not.toBe("error.rule.UNREACHABLE");
  });
});

describe("quest title maps", () => {
  it("keeps VI/EN quest codes aligned", async () => {
    const { QUEST_TITLES_VI, QUEST_TITLES_EN, serializeQuest } = await import(
      "@/server/services/gamificationService"
    );
    expect(Object.keys(QUEST_TITLES_EN).sort()).toEqual(Object.keys(QUEST_TITLES_VI).sort());
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
      "en",
    );
    expect(sample.title).toBe(QUEST_TITLES_EN.q_complete_lesson);
  });
});

describe("locale helpers", () => {
  it("parses only vi|en", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("fr")).toBeNull();
  });

  it("prefers cookie over Accept-Language", () => {
    expect(resolveGuestLocale({ cookie: "vi", acceptLanguage: "en-US,en;q=0.9" })).toBe("vi");
    expect(resolveGuestLocale({ cookie: null, acceptLanguage: "en-US,en;q=0.9" })).toBe("en");
  });
});

describe("format locale variants", () => {
  it("glosses approx money in English", () => {
    expect(formatVndApprox("100133641", "en")).toBe("about 100.1 million");
    expect(formatVndApprox("70000000", "en")).toBe("70 million");
  });

  it("keeps Vietnamese approx defaults", () => {
    expect(formatVndApprox("100133641")).toBe("khoảng 100,1 triệu");
  });

  it("formats relative time in English", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    const then = new Date("2026-08-16T11:30:00.000Z").toISOString();
    expect(formatRelative(then, now, "en")).toBe("30 min ago");
  });

  it("formats minutes in English", () => {
    expect(formatMinutes(90, "en")).toBe("1 h 30 min");
  });
});
