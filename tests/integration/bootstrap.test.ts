import { describe, expect, it } from "vitest";
import { getBootstrap } from "@/server/services/meService";
import { questsToday } from "@/server/services/gamificationQueryService";
import { vnDate } from "@/server/lib/time";
import { makeLearner } from "../factories";

/**
 * Bootstrap and /me/quests/today both hand the client a DailyQuest, and the
 * client types them as the same thing. They drifted once: bootstrap sent
 * `target`/`progress` and no title, which rendered as an empty quest card.
 */

const NOW = new Date("2026-08-14T10:00:00.000Z");
const clock = () => NOW;

describe("getBootstrap dailyQuests", () => {
  it("carries the same quest shape as /me/quests/today", async () => {
    const learner = await makeLearner(clock);
    const boot = await getBootstrap(learner.user.id, clock);
    const today = await questsToday(learner.user.id, clock);

    expect(boot.dailyQuests.length).toBeGreaterThan(0);
    expect(boot.dailyQuests.length).toBe(today.quests.length);

    const byCode = new Map(today.quests.map((q) => [q.code, q]));
    for (const q of boot.dailyQuests) {
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.targetInt).toBeGreaterThan(0);
      expect(typeof q.progressInt).toBe("number");
      expect(q).toEqual(byCode.get(q.code));
    }
  });

  it("generates today's quests rather than waiting for a visit to /quests", async () => {
    const learner = await makeLearner(clock);
    const boot = await getBootstrap(learner.user.id, clock);
    expect(boot.dailyQuests.every((q) => q.questDate === vnDate(NOW))).toBe(true);
  });
});
