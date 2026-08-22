#!/usr/bin/env tsx
/**
 * Import school coords from OpenStreetMap (Overpass API).
 * Food spots are not bulk-imported — use curated seeds or student price submissions.
 * Usage: pnpm map:import [--dry-run] [--city hanoi|saigon|all]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import {
  CITY_BBOX,
  distanceMeters,
  fetchOverpassGrid,
  osmAddress,
  osmCoords,
  schoolsOverpassQuery,
  walkMinutes,
  type OsmElement,
} from "./geo";
import { classifySchool, parseOsmElements, schoolDisplayName } from "./osm-parse";

const DATA_DIR = path.join(process.cwd(), "prisma/data/osm");
const LINK_RADIUS_M = 500;

type Args = { dryRun: boolean; cities: string[]; fromCache: boolean; refresh: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const fromCache = argv.includes("--from-cache");
  const refresh = argv.includes("--refresh");
  const cityIdx = argv.indexOf("--city");
  const cityArg = cityIdx >= 0 ? argv[cityIdx + 1] : "all";
  const cities =
    !cityArg || cityArg === "all" ? Object.keys(CITY_BBOX) : cityArg.split(",").map((c) => c.trim());
  return { dryRun, cities, fromCache, refresh };
}

async function ensureCluster(slug: string): Promise<string> {
  const existing = await prisma.foodCluster.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const meta =
    slug === "hanoi"
      ? { city: "hanoi", order: 1, lat: 21.0368, lng: 105.7821, name: "Hà Nội", description: "Quán ăn quanh trường THPT & đại học." }
      : {
          city: "saigon",
          order: 0,
          lat: 10.8015,
          lng: 106.7098,
          name: "Sài Gòn",
          description: "Quán ăn quanh trường THPT & đại học.",
        };
  const row = await prisma.foodCluster.create({
    data: {
      id: uuidv7(),
      slug,
      city: meta.city,
      order: meta.order,
      lat: meta.lat,
      lng: meta.lng,
      translations: { create: [{ locale: "vi", name: meta.name, description: meta.description }] },
    },
  });
  return row.id;
}

async function saveRaw(city: string, kind: string, data: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${city}-${kind}.json`);
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
  console.log(`  saved ${file}`);
}

async function upsertSchool(
  clusterId: string,
  el: OsmElement,
  order: number,
  dryRun: boolean,
): Promise<string | null> {
  const tags = el.tags ?? {};
  const kind = classifySchool(tags);
  if (!kind) return null;
  const name = schoolDisplayName(tags);
  if (!name) return null;
  const coords = osmCoords(el);
  if (!coords) return null;

  const osmType = el.type;
  const osmId = String(el.id);
  const slug = `osm-${osmType}-${osmId}`;
  const address = osmAddress(tags);
  const district = tags["addr:district"] ?? tags["addr:suburb"] ?? "";

  if (dryRun) return slug;

  const existing = await prisma.school.findFirst({
    where: { osmType, osmId },
  });

  if (existing) {
    await prisma.school.update({
      where: { id: existing.id },
      data: {
        kind,
        lat: coords.lat,
        lng: coords.lng,
        address: address || existing.address,
        district: district || existing.district,
        source: "openstreetmap",
        order,
      },
    });
    await prisma.schoolTranslation.upsert({
      where: { schoolId_locale: { schoolId: existing.id, locale: "vi" } },
      create: { schoolId: existing.id, locale: "vi", name, shortName: name.slice(0, 40) },
      update: { name, shortName: name.slice(0, 40) },
    });
    return existing.id;
  }

  const id = uuidv7();
  await prisma.school.create({
    data: {
      id,
      slug,
      clusterId,
      kind,
      lat: coords.lat,
      lng: coords.lng,
      address,
      district,
      source: "openstreetmap",
      osmType,
      osmId,
      externalRef: `https://www.openstreetmap.org/${osmType}/${osmId}`,
      order,
      translations: { create: [{ locale: "vi", name, shortName: name.slice(0, 40) }] },
    },
  });
  return id;
}

async function linkSpotsToSchools(clusterId: string, dryRun: boolean): Promise<number> {
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
      .map((s) => ({
        schoolId: s.id,
        d: distanceMeters(lat, lng, s.lat!, s.lng!),
      }))
      .filter((x) => x.d <= LINK_RADIUS_M)
      .sort((a, b) => a.d - b.d);

    if (!nearby.length) continue;

    if (dryRun) {
      links += nearby.length;
      continue;
    }

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

async function loadCached(city: string, kind: string): Promise<unknown | null> {
  try {
    const file = path.join(DATA_DIR, `${city}-${kind}.json`);
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function loadOrFetch(
  cityKey: string,
  kind: "schools" | "food",
  label: string,
  fetchFn: () => Promise<{ elements: OsmElement[] }>,
  opts: { fromCache: boolean; refresh: boolean },
): Promise<unknown> {
  if (opts.fromCache || !opts.refresh) {
    const cached = await loadCached(cityKey, kind);
    if (cached) {
      console.log(`  using cached ${cityKey}-${kind}.json`);
      return cached;
    }
    if (opts.fromCache) {
      throw new Error(`Missing cache: prisma/data/osm/${cityKey}-${kind}.json`);
    }
  }

  console.log(`Fetching OSM ${label} (grid)…`);
  const raw = await fetchFn();
  await saveRaw(cityKey, kind, raw);
  return raw;
}

async function importCity(
  cityKey: string,
  dryRun: boolean,
  opts: { fromCache: boolean; refresh: boolean },
): Promise<void> {
  const cfg = CITY_BBOX[cityKey];
  if (!cfg) {
    console.warn(`Unknown city: ${cityKey}`);
    return;
  }

  console.log(`\n=== ${cityKey} (${cfg.clusterSlug}) ===`);

  const schoolRaw = await loadOrFetch(
    cityKey,
    "schools",
    "schools",
    () => fetchOverpassGrid(schoolsOverpassQuery, cfg.bbox, { rows: 3, cols: 3 }),
    opts,
  );

  const schoolEls = parseOsmElements(schoolRaw);
  console.log(`  raw schools: ${schoolEls.length} (food POIs skipped — student-budget map needs prices, not OSM bulk)`);

  if (dryRun) {
    let schoolCount = 0;
    for (const el of schoolEls) {
      if (classifySchool(el.tags ?? {}) && schoolDisplayName(el.tags ?? {}) && osmCoords(el)) schoolCount++;
    }
    console.log(`  would import ~${schoolCount} schools`);
    return;
  }

  const clusterId = await ensureCluster(cfg.clusterSlug);

  let si = 0;
  let importedSchools = 0;
  for (const el of schoolEls) {
    const id = await upsertSchool(clusterId, el, si, false);
    if (id) {
      importedSchools++;
      si++;
    }
  }

  console.log(`  imported ${importedSchools} schools`);
  const links = await linkSpotsToSchools(clusterId, false);
  console.log(`  spot↔school links: ${links}`);
}

async function main(): Promise<void> {
  const { dryRun, cities, fromCache, refresh } = parseArgs();
  console.log(
    `Map import (dryRun=${dryRun}, fromCache=${fromCache}, refresh=${refresh}, cities=${cities.join(",")})`,
  );

  for (const city of cities) {
    await importCity(city, dryRun, { fromCache, refresh });
  }

  if (!dryRun) {
    const [schools, pricedSpots, links] = await Promise.all([
      prisma.school.count(),
      prisma.foodSpot.count({ where: { avgPriceVnd: { not: null } } }),
      prisma.foodSpotSchool.count(),
    ]);
    console.log(`\nTotals: ${schools} schools, ${pricedSpots} priced food spots, ${links} links`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
