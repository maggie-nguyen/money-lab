#!/usr/bin/env tsx
/**
 * Import MOET THPT catalog (gov PDF extract) — enriches school names/addresses.
 * Geocodes address-only schools via Nominatim (OSM, 1 req/s).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import { sleep } from "./geo";

const DATA = path.join(process.cwd(), "prisma/data/moet-thpt-hanoi-hcm.json");
const GEOCODE_LIMIT = 80;

type MoetRow = {
  clusterSlug: string;
  moetCode: string;
  name: string;
  address: string;
  districtName: string;
};

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

async function geocode(address: string, city: string): Promise<{ lat: number; lng: number } | null> {
  const q = `${address}, ${city}, Vietnam`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "vn");
  const res = await fetch(url, {
    headers: { "User-Agent": "MoneyLab-FoodMap/1.0 (moet school geocode)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data[0]) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

async function main(): Promise<void> {
  const raw = JSON.parse(await readFile(DATA, "utf8")) as { rows: MoetRow[] };
  const rows = raw.rows;
  console.log(`MOET import: ${rows.length} THPT rows`);

  let matched = 0;
  let created = 0;
  let geocoded = 0;
  let geoAttempts = 0;

  for (const row of rows) {
    const cluster = await prisma.foodCluster.findUnique({ where: { slug: row.clusterSlug } });
    if (!cluster) continue;

    const norm = normalizeName(row.name);
    const schools = await prisma.school.findMany({
      where: { clusterId: cluster.id },
      include: { translations: true },
    });

    const hit =
      schools.find((s) => s.externalRef === row.moetCode) ??
      schools.find((s) => normalizeName(s.translations[0]?.name ?? "") === norm) ??
      schools.find((s) => {
        const n = normalizeName(s.translations[0]?.name ?? "");
        return n.includes(norm.slice(0, 14)) || norm.includes(n.slice(0, 14));
      });

    if (hit) {
      await prisma.school.update({
        where: { id: hit.id },
        data: {
          address: row.address || hit.address,
          district: row.districtName || hit.district,
          externalRef: row.moetCode,
          source: hit.source === "openstreetmap" ? "openstreetmap" : "moet",
        },
      });
      matched++;
      continue;
    }

    let lat: number | null = null;
    let lng: number | null = null;
    if (geoAttempts < GEOCODE_LIMIT && row.address) {
      const city = row.clusterSlug === "hanoi" ? "Hà Nội" : "TP Hồ Chí Minh";
      const coords = await geocode(row.address, city);
      await sleep(1100);
      geoAttempts++;
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
        geocoded++;
      }
    }

    const slug = `moet-${row.moetCode}`;
    if (await prisma.school.findUnique({ where: { slug } })) continue;

    await prisma.school.create({
      data: {
        id: uuidv7(),
        slug,
        clusterId: cluster.id,
        kind: "HIGH_SCHOOL",
        lat,
        lng,
        address: row.address,
        district: row.districtName,
        source: "moet",
        externalRef: row.moetCode,
        order: 8000 + created,
        translations: {
          create: [{ locale: "vi", name: row.name, shortName: row.name.slice(0, 40) }],
        },
      },
    });
    created++;
  }

  console.log(`Matched ${matched}, created ${created} (${geocoded} geocoded via Nominatim)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
