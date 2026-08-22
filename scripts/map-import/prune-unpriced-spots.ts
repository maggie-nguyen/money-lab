#!/usr/bin/env tsx
/** Remove food spots with no student price — OSM bulk is not map data. */
import { prisma } from "../../src/server/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const toDelete = await prisma.foodSpot.count({ where: { avgPriceVnd: null } });
  const keep = await prisma.foodSpot.count({ where: { avgPriceVnd: { not: null } } });
  console.log(JSON.stringify({ dryRun, toDelete, keep }, null, 2));
  if (dryRun || toDelete === 0) {
    await prisma.$disconnect();
    return;
  }
  const result = await prisma.foodSpot.deleteMany({ where: { avgPriceVnd: null } });
  console.log(`Deleted ${result.count} unpriced food spots (links/reviews cascade).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
