/**
 * Production v2 seed — map, wallet, habits, psychology library.
 * Safe to re-run (upserts). Does NOT seed LMS courses, sims, shop, or tutor content.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash as argonHash } from "@node-rs/argon2";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";
import { env } from "../src/server/config";
import { uuidv7 } from "../src/server/lib/ids";
import { blockSchema, localeSchema, slugSchema } from "../src/server/schemas/content";

const articleSeedSchema = z.object({
  slug: slugSchema,
  category: z.enum(["GUIDE", "EXPLAINER", "NEWS", "STORY"]),
  readMinutes: z.number().int().min(1).max(60),
  authorName: z.string().min(1).max(80),
  relatedCourseSlug: slugSchema.optional(),
  publishedDaysAgo: z.number().int().min(0).max(3650),
  i18n: z.record(
    localeSchema,
    z.object({
      title: z.string().min(1).max(200),
      summary: z.string().max(500),
      seoTitle: z.string().max(70),
      seoDescription: z.string().max(160),
      blocks: z.array(blockSchema).min(1).max(60),
    }),
  ),
});

const V2_BADGES = [
  {
    code: "CHALLENGE_NO_TEA",
    kind: "SPECIAL" as const,
    coinReward: 15,
    criteria: { challenge: "NO_BUBBLE_TEA_WEEK" },
    title: "Một tuần không trà sữa",
    description: "Hoàn thành thử thách 7 ngày không trà sữa",
  },
  {
    code: "CHALLENGE_CHEAP_LUNCH",
    kind: "SPECIAL" as const,
    coinReward: 15,
    criteria: { challenge: "LUNCH_UNDER_30K" },
    title: "Ăn trưa thông minh",
    description: "Hoàn thành thử thách ăn trưa dưới 30k",
  },
] as const;

const V2_FLAGS: Array<{ key: string; enabled: boolean }> = [
  { key: "survey_prompt_enabled", enabled: false },
  { key: "map_reviews_enabled", enabled: true },
  { key: "spending_jars_enabled", enabled: true },
  { key: "savings_challenges_enabled", enabled: true },
];

export async function seedUsers(): Promise<{ learnerEmail: string }> {
  const e = env();
  const adminEmail = e.SEED_ADMIN_EMAIL ?? "admin@moneylab.local";
  const adminPassword = e.SEED_ADMIN_PASSWORD ?? "admin12345";
  const learnerEmail = e.SEED_LEARNER_EMAIL ?? "learner@moneylab.local";
  const learnerPassword = e.SEED_LEARNER_PASSWORD ?? "learner12345";

  for (const [email, password, displayName, role] of [
    [adminEmail, adminPassword, "Money&Me Admin", "ADMIN"],
    [learnerEmail, learnerPassword, "Học sinh demo", "LEARNER"],
  ] as const) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existing) {
      console.log(`✔ user exists: ${email}`);
      continue;
    }
    const user = await prisma.user.create({
      data: {
        id: uuidv7(),
        email,
        emailVerifiedAt: new Date(),
        passwordHash: await argonHash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        displayName,
        role,
        localePref: "vi",
      },
    });
    await prisma.userStats.create({ data: { userId: user.id } });
    console.log(`✔ user created: ${email}`);
  }

  return { learnerEmail };
}

async function seedFeatureFlags(): Promise<void> {
  for (const f of V2_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: { key: f.key, enabled: f.enabled },
      update: { enabled: f.enabled },
    });
  }
  console.log(`✔ ${V2_FLAGS.length} feature flags`);
}

async function seedV2Badges(): Promise<void> {
  for (const b of V2_BADGES) {
    const badge = await prisma.badge.upsert({
      where: { code: b.code },
      create: {
        id: uuidv7(),
        code: b.code,
        kind: b.kind,
        coinReward: b.coinReward,
        criteria: b.criteria as Prisma.InputJsonValue,
      },
      update: {
        kind: b.kind,
        coinReward: b.coinReward,
        criteria: b.criteria as Prisma.InputJsonValue,
      },
    });
    await prisma.badgeTranslation.upsert({
      where: { badgeId_locale: { badgeId: badge.id, locale: "vi" } },
      create: {
        badgeId: badge.id,
        locale: "vi",
        title: b.title,
        description: b.description,
      },
      update: { title: b.title, description: b.description },
    });
  }
  console.log(`✔ ${V2_BADGES.length} v2 badges`);
}

export async function seedArticlesFromJson(): Promise<void> {
  const path = join(__dirname, "..", "content", "vi", "articles.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as { articles: unknown[] };
  for (const a of raw.articles) {
    const parsed = articleSeedSchema.safeParse(a);
    if (!parsed.success) {
      console.error(`✘ invalid article seed:`, parsed.error.flatten());
      process.exit(1);
    }
    const article = parsed.data;
    const publishedAt = new Date(Date.now() - article.publishedDaysAgo * 86_400_000);
    const common = {
      status: "PUBLISHED" as const,
      category: article.category,
      readMinutes: article.readMinutes,
      authorName: article.authorName,
    };
    const row = await prisma.article.upsert({
      where: { slug: article.slug },
      create: { id: uuidv7(), slug: article.slug, publishedAt, ...common },
      update: common,
    });
    const tr = article.i18n.vi;
    if (!tr) continue;
    await prisma.articleTranslation.upsert({
      where: { articleId_locale: { articleId: row.id, locale: "vi" } },
      create: {
        articleId: row.id,
        locale: "vi",
        title: tr.title,
        summary: tr.summary,
        seoTitle: tr.seoTitle,
        seoDescription: tr.seoDescription,
        blocks: tr.blocks as unknown as Prisma.InputJsonValue,
      },
      update: {
        title: tr.title,
        summary: tr.summary,
        seoTitle: tr.seoTitle,
        seoDescription: tr.seoDescription,
        blocks: tr.blocks as unknown as Prisma.InputJsonValue,
      },
    });
  }
  console.log(`✔ ${raw.articles.length} psychology articles`);
}

/** Full v2 product seed (users must exist or be created first). */
export async function seedV2(): Promise<void> {
  const { learnerEmail } = await seedUsers();
  await seedFeatureFlags();
  await seedV2Badges();
  await seedArticlesFromJson();

  const { seedFoodMap } = await import("./seed-food");
  await seedFoodMap(learnerEmail);

  const { seedChallenges } = await import("./seed-challenges");
  await seedChallenges();

  console.log("✔ v2 seed complete (map · ví · thử thách · library)");
}
