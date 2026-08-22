/**
 * Database seed entrypoint.
 *
 * Default (production v2): users + map + wallet content + challenges + articles.
 * Legacy LMS: set SEED_LEGACY=true to also import courses, sims, shop, badges.
 */
import { prisma } from "../src/server/db";
import { seedV2 } from "./seed-v2";

async function main() {
  const legacy = process.env.SEED_LEGACY === "true";
  if (legacy) {
    const { seedLegacy } = await import("./seed-legacy");
    await seedLegacy();
  }
  await seedV2();
  console.log(legacy ? "Seed complete (legacy + v2)." : "Seed complete (v2 only).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
