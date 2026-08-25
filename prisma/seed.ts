/**
 * Database seed entrypoint.
 *
 * Production v2 (pillars only): users + map + wallet (jars, psychology) + challenges + articles.
 */
import { prisma } from "../src/server/db";
import { seedV2 } from "./seed-v2";

async function main() {
  await seedV2();
  console.log("Seed complete (v2).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
