import { prisma } from "../../src/server/db";
import { mapVisibleSpotWhere } from "../../src/server/services/foodMapService";

async function main() {
  const [
    schools,
    osmSpots,
    manualSpots,
    foodySpots,
    links,
    hanoiSchools,
    saigonSchools,
    pricedSpots,
    mapVisibleSpots,
    schoolsWithPricedFood,
  ] = await Promise.all([
    prisma.school.count(),
    prisma.foodSpot.count({ where: { source: "openstreetmap" } }),
    prisma.foodSpot.count({ where: { source: "manual" } }),
    prisma.foodSpot.count({ where: { source: "foody" } }),
    prisma.foodSpotSchool.count(),
    prisma.school.count({ where: { cluster: { slug: "hanoi" } } }),
    prisma.school.count({ where: { cluster: { slug: "saigon" } } }),
    prisma.foodSpot.count({ where: { avgPriceVnd: { not: null } } }),
    prisma.foodSpot.count({ where: mapVisibleSpotWhere }),
    prisma.school.count({
      where: { spotLinks: { some: { spot: mapVisibleSpotWhere } } },
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        schools,
        schoolsWithPricedFood,
        hanoiSchools,
        saigonSchools,
        foodSpots: { total: osmSpots + manualSpots + foodySpots, osm: osmSpots, manual: manualSpots, foody: foodySpots },
        mapVisibleSpots,
        pricedSpots,
        links,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main();
