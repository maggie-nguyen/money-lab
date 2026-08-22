#!/usr/bin/env tsx
/** Rebuild food_spot_school links for all clusters (500 m radius). */
import { prisma } from "../../src/server/db";
import { distanceMeters, walkMinutes } from "./geo";

const LINK_RADIUS_M = 500;

async function linkCluster(clusterId: string): Promise<number> {
  const schools = await prisma.school.findMany({
    where: { clusterId, lat: { not: null }, lng: { not: null } },
    select: { id: true, lat: true, lng: true },
  });
  const spots = await prisma.foodSpot.findMany({
    where: { clusterId, lat: { not: null }, lng: { not: null } },
    select: { id: true, lat: true, lng: true },
  });

  let links = 0;
  for (const spot of spots) {
    const lat = spot.lat!;
    const lng = spot.lng!;
    const nearby = schools
      .map((s) => ({ schoolId: s.id, d: distanceMeters(lat, lng, s.lat!, s.lng!) }))
      .filter((x) => x.d <= LINK_RADIUS_M)
      .sort((a, b) => a.d - b.d);
    if (!nearby.length) continue;

    await prisma.foodSpotSchool.deleteMany({ where: { spotId: spot.id } });
    for (let i = 0; i < nearby.length; i++) {
      const { schoolId, d } = nearby[i]!;
      await prisma.foodSpotSchool.create({
        data: {
          spotId: spot.id,
          schoolId,
          isPrimary: i === 0,
          distanceMeters: Math.round(d),
          walkMinutes: walkMinutes(d),
        },
      });
      links++;
    }
  }
  return links;
}

async function main(): Promise<void> {
  const clusters = await prisma.foodCluster.findMany({ select: { id: true, slug: true } });
  let total = 0;
  for (const c of clusters) {
    const n = await linkCluster(c.id);
    console.log(`${c.slug}: ${n} links`);
    total += n;
  }
  console.log(`Total links: ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
