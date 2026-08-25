#!/usr/bin/env tsx
/** Hard ceiling: a "student meal" pin must be ≤ 60k VND (buffets/big-group spots excluded). */
import { prisma } from "../../src/server/db";

const MAX_STUDENT_MEAL_VND = 60_000;

async function main(): Promise<void> {
  const res = await prisma.foodSpot.deleteMany({ where: { avgPriceVnd: { gt: MAX_STUDENT_MEAL_VND } } });
  console.log(`pruned ${res.count} spots over ${MAX_STUDENT_MEAL_VND / 1000}k`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
