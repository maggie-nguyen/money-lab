/**
 * Production-safe article sync.
 *
 * Unlike the full seed, this only upserts editorial articles and never touches
 * users, reviews, map data, challenges, or other user-owned records.
 */
import { prisma } from "../src/server/db";
import { seedArticlesFromJson } from "./seed-v2";

async function main(): Promise<void> {
  await seedArticlesFromJson();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
