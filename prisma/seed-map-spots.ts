/**
 * Production-safe map seed — clusters + priced food spots only.
 *
 * Idempotent upserts; never touches users, reviews, wallet, or articles.
 * Run against production:
 *   vercel env run -e production -- pnpm content:seed:map
 */
import { prisma } from "../src/server/db";
import { uuidv7 } from "../src/server/lib/ids";
import { FOOD_CLUSTERS, FOOD_SPOTS } from "./food-spots-data";

async function main(): Promise<void> {
  for (const c of FOOD_CLUSTERS) {
    await prisma.foodCluster.upsert({
      where: { slug: c.slug },
      create: {
        id: uuidv7(),
        slug: c.slug,
        city: c.city,
        order: c.order,
        lat: c.lat,
        lng: c.lng,
        translations: {
          create: [{ locale: "vi", name: c.name, description: c.description }],
        },
      },
      update: {
        city: c.city,
        order: c.order,
        lat: c.lat,
        lng: c.lng,
        translations: {
          deleteMany: {},
          create: [{ locale: "vi", name: c.name, description: c.description }],
        },
      },
    });
  }

  const clusterBySlug = Object.fromEntries(
    (await prisma.foodCluster.findMany({ where: { slug: { in: FOOD_CLUSTERS.map((c) => c.slug) } } })).map(
      (c) => [c.slug, c.id],
    ),
  );

  let created = 0;
  let updated = 0;

  for (const s of FOOD_SPOTS) {
    const clusterId = clusterBySlug[s.clusterSlug];
    if (!clusterId) continue;

    const existing = await prisma.foodSpot.findFirst({ where: { clusterId, name: s.name } });
    if (existing) {
      await prisma.foodSpot.update({
        where: { id: existing.id },
        data: {
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          avgPriceVnd: s.avgPriceVnd,
          tags: s.tags,
          note: s.note,
          order: s.order,
        },
      });
      updated++;
    } else {
      await prisma.foodSpot.create({
        data: {
          id: uuidv7(),
          clusterId,
          name: s.name,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          avgPriceVnd: s.avgPriceVnd,
          tags: s.tags,
          note: s.note,
          order: s.order,
        },
      });
      created++;
    }
  }

  const priced = await prisma.foodSpot.count({ where: { avgPriceVnd: { not: null } } });
  console.log(
    JSON.stringify(
      {
        clusters: FOOD_CLUSTERS.length,
        spotsUpserted: FOOD_SPOTS.length,
        created,
        updated,
        pricedSpotsTotal: priced,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
