#!/usr/bin/env tsx
/** Delete drink-only pins (trà sữa, cà phê, nước ép...) — map shows proper meals only. */
import { prisma } from "../../src/server/db";

const DRINK_RE =
  /(tra sua|trachanh|tra gung|daoa|dua tac|ca phe|caphe|cafe|coffee|milk ?tea|bubble tea|bobapop|boba|nuoc ep|sinh to|smothie|smoothie|nuoc mia|da xay|bac xiu|yogurt|sua chua|kombucha|espresse|pepsi|coca)/i;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase();
}

async function main(): Promise<void> {
  const spots = await prisma.foodSpot.findMany({
    where: { OR: [{ source: "foody" }, { source: "manual" }] },
    select: { id: true, name: true, source: true },
  });
  let removed = 0;
  for (const s of spots) {
    if (DRINK_RE.test(normalize(s.name))) {
      console.log(`- [${s.source}] ${s.name}`);
      await prisma.foodSpot.delete({ where: { id: s.id } });
      removed++;
    }
  }
  console.log(`purged ${removed} drink-only pins`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
