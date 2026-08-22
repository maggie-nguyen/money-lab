#!/usr/bin/env tsx
/**
 * Import universities / high schools from Wikidata (CC0) for Hanoi & HCMC bboxes.
 * Complements OSM import when Overpass is busy.
 */
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import { CITY_BBOX, slugify } from "./geo";

type WdRow = {
  item: { value: string };
  itemLabel: { value: string };
  lat: { value: string };
  lon: { value: string };
};

const QUERIES: { city: string; kind: "UNIVERSITY" | "HIGH_SCHOOL"; wdType: string }[] = [
  { city: "hanoi", kind: "UNIVERSITY", wdType: "wd:Q3918" },
  { city: "hanoi", kind: "HIGH_SCHOOL", wdType: "wd:Q9826" },
  { city: "saigon", kind: "UNIVERSITY", wdType: "wd:Q3918" },
  { city: "saigon", kind: "HIGH_SCHOOL", wdType: "wd:Q9826" },
];

async function sparql(bbox: [number, number, number, number], wdType: string): Promise<WdRow[]> {
  const [south, west, north, east] = bbox;
  const query = `
SELECT ?item ?itemLabel ?lat ?lon WHERE {
  SERVICE wikibase:label { bd:serviceParam wikibase:language "vi,en". }
  ?item wdt:P31/wdt:P279* ${wdType}; wdt:P17 wd:Q881; wdt:P625 ?coord.
  BIND(geof:latitude(?coord) AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  FILTER(?lat > ${south} && ?lat < ${north} && ?lon > ${west} && ?lon < ${east})
}`;
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "MoneyLab-FoodMap/1.0 (wikidata school import)",
    },
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const json = (await res.json()) as { results: { bindings: WdRow[] } };
  return json.results.bindings;
}

async function main(): Promise<void> {
  let total = 0;
  for (const q of QUERIES) {
    const cfg = CITY_BBOX[q.city];
    if (!cfg) continue;
    const cluster = await prisma.foodCluster.findUnique({ where: { slug: cfg.clusterSlug } });
    if (!cluster) {
      console.warn(`Cluster ${cfg.clusterSlug} missing — run db:seed first`);
      continue;
    }

    console.log(`Wikidata ${q.kind} in ${q.city}…`);
    const rows = await sparql(cfg.bbox, q.wdType);
    console.log(`  ${rows.length} rows`);

    for (const row of rows) {
      const name = row.itemLabel.value.trim();
      const lat = Number(row.lat.value);
      const lng = Number(row.lon.value);
      const wdId = row.item.value.split("/").pop()!;
      const osmId = wdId;
      const osmType = "wikidata";

      const existing = await prisma.school.findFirst({
        where: { OR: [{ externalRef: wdId }, { osmType, osmId }] },
      });
      if (existing) {
        await prisma.school.update({
          where: { id: existing.id },
          data: { lat, lng, source: "wikidata", externalRef: wdId },
        });
        continue;
      }

      const slug = `wd-${slugify(name)}-${wdId}`;
      if (await prisma.school.findUnique({ where: { slug } })) continue;

      await prisma.school.create({
        data: {
          id: uuidv7(),
          slug,
          clusterId: cluster.id,
          kind: q.kind,
          lat,
          lng,
          source: "wikidata",
          osmType,
          osmId,
          externalRef: wdId,
          order: 5000 + total,
          translations: { create: [{ locale: "vi", name, shortName: name.slice(0, 40) }] },
        },
      });
      total++;
    }
  }
  console.log(`Wikidata import done (+${total} new schools)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
