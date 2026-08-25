#!/usr/bin/env tsx
/**
 * Cross-match foody pins against OSM POI caches (independently surveyed data).
 * Match (same name within 150m) => verified=true.
 * Unmatched pins stay visible but remain verified=false — OSM coverage is partial,
 * so absence is not proof of a virtual store; it flags spots for community confirmation.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/server/db";

const DATA_DIR = path.join(process.cwd(), "prisma/data/osm");
const MATCH_RADIUS_M = 150;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type OsmPoi = { name: string; lat: number; lng: number };

async function loadOsm(city: string): Promise<OsmPoi[]> {
  const raw = JSON.parse(await readFile(path.join(DATA_DIR, `${city}-food.json`), "utf8")) as {
    elements?: { lat?: number; latlng?: number; center?: { lat: number; lon: number }; latLng?: unknown; lon?: number; tags?: { name?: string } }[];
  };
  const out: OsmPoi[] = [];
  for (const el of raw.elements ?? []) {
    const name = el.tags?.name;
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    out.push({ name: normalize(name), lat, lng });
  }
  return out;
}

function tokenOverlap(a: string, b: string): boolean {
  const at = new Set(a.split(" "));
  const bt = new Set(b.split(" "));
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter++;
  return inter > 0 && inter / Math.max(1, Math.min(at.size, bt.size)) >= 0.5;
}

async function main(): Promise<void> {
  const osmByCity: Record<string, OsmPoi[]> = {};
  for (const [city, slug] of [["hanoi", "hanoi"], ["saigon", "saigon"]] as const) {
    osmByCity[slug] = await loadOsm(city);
  }

  const spots = await prisma.foodSpot.findMany({
    where: { source: "foody" },
    select: { id: true, name: true, lat: true, lng: true, cluster: { select: { slug: true } } },
  });

  let matched = 0;
  for (const s of spots) {
    if (s.lat == null || s.lng == null) continue;
    const pool = osmByCity[s.cluster.slug] ?? [];
    let hit = false;
    for (const poi of pool) {
      if (Math.abs(poi.lat - s.lat!) > 0.0015 || Math.abs(poi.lng - s.lng!) > 0.0015) continue;
      if (distanceMeters(s.lat!, s.lng!, poi.lat, poi.lng) <= MATCH_RADIUS_M && tokenOverlap(normalize(s.name), poi.name)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      await prisma.foodSpot.update({ where: { id: s.id }, data: { verified: true } });
      matched++;
    }
  }
  console.log(`OSM cross-match: ${matched}/${spots.length} foody pins verified against independently surveyed POIs`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
