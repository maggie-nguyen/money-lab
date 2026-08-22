#!/usr/bin/env tsx
/** Import only OSM food entries whose name explicitly contains a VND price. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import { osmAddress, osmCoords } from "./geo";
import { parseOsmElements } from "./osm-parse";

const DATA_DIR = path.join(process.cwd(), "prisma/data/osm");

function parseExplicitPrice(name: string): bigint | null {
  // Deliberately accept only a single, unambiguous price. Ranges and vague
  // descriptions are left out rather than converted into invented averages.
  const match = name.match(/(?:^|\D)(\d{1,3})\s*(k|K|000\s*(?:đ|d|₫|vnd))(?=$|\D)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount < 1 || amount > 2000) return null;
  return BigInt(match[2]!.toLowerCase().startsWith("k") ? amount * 1000 : amount * 1000);
}

function priceName(tags: Record<string, string>): string {
  return (tags["name:vi"] ?? tags.name ?? "").trim();
}

async function main(): Promise<void> {
  let imported = 0;
  let updated = 0;
  for (const city of ["hanoi", "saigon"]) {
    const cluster = await prisma.foodCluster.findUnique({ where: { slug: city } });
    if (!cluster) continue;
    const raw = JSON.parse(await readFile(path.join(DATA_DIR, `${city}-food.json`), "utf8")) as unknown;
    const elements = parseOsmElements(raw);
    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = priceName(tags);
      const price = parseExplicitPrice(name);
      const coords = osmCoords(el);
      if (!name || price == null || !coords) continue;
      const osmType = el.type;
      const osmId = String(el.id);
      const sourceRef = `https://www.openstreetmap.org/${osmType}/${osmId}`;
      const existing = await prisma.foodSpot.findFirst({ where: { osmType, osmId } });
      if (existing) {
        if (existing.avgPriceVnd == null) {
          await prisma.foodSpot.update({ where: { id: existing.id }, data: { avgPriceVnd: price, note: `Giá ghi trong tên OSM: ${name}` } });
          updated++;
        }
        continue;
      }
      await prisma.foodSpot.create({
        data: {
          id: uuidv7(), clusterId: cluster.id, name, address: osmAddress(tags),
          lat: coords.lat, lng: coords.lng, avgPriceVnd: price,
          tags: ["osm-price-tag"], note: `Giá ghi trong tên OSM: ${name}`,
          source: "openstreetmap", sourceRef, osmType, osmId, verified: false,
          order: 1000 + imported,
        },
      });
      imported++;
    }
  }
  console.log(`OSM explicit-price spots: ${imported} imported, ${updated} existing spots priced`);
  await prisma.$disconnect();
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
