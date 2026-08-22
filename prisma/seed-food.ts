import { prisma } from "../src/server/db";
import { uuidv7 } from "../src/server/lib/ids";
import { FOOD_CLUSTERS, FOOD_SPOTS } from "./food-spots-data";

/** Idempotent seed for map pins + sample community reviews. */
export async function seedFoodMap(learnerEmail = "learner@moneylab.local"): Promise<void> {
  await prisma.foodCluster.deleteMany({
    where: { slug: { in: ["hcm-binh-thanh", "hn-cau-giay"] } },
  });

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

  const seedUsers: { id: string; displayName: string }[] = [];
  const learner = await prisma.user.findUnique({ where: { email: learnerEmail } });
  if (learner) seedUsers.push({ id: learner.id, displayName: learner.displayName });

  for (const s of FOOD_SPOTS) {
    const clusterId = clusterBySlug[s.clusterSlug];
    if (!clusterId) continue;

    const existing = await prisma.foodSpot.findFirst({ where: { clusterId, name: s.name } });
    let spotId: string;
    if (existing) {
      spotId = existing.id;
      await prisma.foodSpot.update({
        where: { id: spotId },
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
    } else {
      spotId = uuidv7();
      await prisma.foodSpot.create({
        data: {
          id: spotId,
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
    }

    if (!s.reviews?.length || !seedUsers.length) continue;
    for (const r of s.reviews) {
      const user = seedUsers[0]!;
      const dup = await prisma.foodReview.findFirst({
        where: { spotId, body: r.body },
      });
      if (dup) continue;
      await prisma.foodReview.create({
        data: {
          id: uuidv7(),
          spotId,
          userId: user.id,
          rating: r.rating,
          body: r.body,
          priceVnd: r.priceVnd ?? null,
        },
      });
    }
  }

  console.log(`✔ food map seeded (${FOOD_SPOTS.length} spots)`);
}
