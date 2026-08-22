import { prisma } from "../src/server/db";
import { uuidv7 } from "../src/server/lib/ids";

const CHALLENGES = [
  {
    code: "NO_BUBBLE_TEA_WEEK",
    slug: "mot-tuan-khong-tra-sua",
    durationDays: 7,
    iconKey: "tea",
    badgeCode: "CHALLENGE_NO_TEA",
    order: 0,
    title: "Một tuần không trà sữa",
    description: "7 ngày không mua trà sữa, nước ngọt ngoài đường. Tiền tiết kiệm được? Ghi vào ví.",
    savingsHint: "Mỗi ly trà sữa ~25–35k. Một tuần có thể tiết kiệm 50–100k.",
  },
  {
    code: "LUNCH_UNDER_30K",
    slug: "an-trua-duoi-30k",
    durationDays: 5,
    iconKey: "rice",
    badgeCode: "CHALLENGE_CHEAP_LUNCH",
    order: 1,
    title: "Ăn trưa dưới 30k",
    description: "5 ngày liên tiếp ăn trưa ≤30k. Dùng bản đồ ăn rẻ để tìm quán.",
    savingsHint: "So với 45–50k/quán thường, tiết kiệm ~75–100k/tuần.",
  },
  {
    code: "NO_GRAB_WEEK",
    slug: "mot-tuan-khong-grab",
    durationDays: 7,
    iconKey: "transport",
    badgeCode: null,
    order: 2,
    title: "Một tuần không book xe",
    description: "Đi xe buýt, xe đạp hoặc đi bộ thay vì Grab/be.",
    savingsHint: "Mỗi chuyến Grab ngắn ~15–25k. Một tuần dễ tiết kiệm 100k+.",
  },
  {
    code: "WEEKEND_CAP_100K",
    slug: "cuoi-tuan-toi-da-100k",
    durationDays: 2,
    iconKey: "fun",
    badgeCode: null,
    order: 3,
    title: "Cuối tuần tối đa 100k",
    description: "Thứ 7 + CN tổng chi tiêu đi chơi không quá 100k.",
    savingsHint: "Đặt trần trước khi đi — dễ hơn hối hận sau.",
  },
] as const;

export async function seedChallenges(): Promise<void> {
  for (const c of CHALLENGES) {
    await prisma.savingsChallenge.upsert({
      where: { slug: c.slug },
      create: {
        id: uuidv7(),
        code: c.code,
        slug: c.slug,
        durationDays: c.durationDays,
        iconKey: c.iconKey,
        badgeCode: c.badgeCode,
        order: c.order,
        status: "PUBLISHED",
        translations: {
          create: [{ locale: "vi", title: c.title, description: c.description, savingsHint: c.savingsHint }],
        },
      },
      update: {
        durationDays: c.durationDays,
        iconKey: c.iconKey,
        badgeCode: c.badgeCode,
        order: c.order,
        translations: {
          deleteMany: {},
          create: [{ locale: "vi", title: c.title, description: c.description, savingsHint: c.savingsHint }],
        },
      },
    });
  }
  console.log(`✔ ${CHALLENGES.length} savings challenges seeded`);
}
