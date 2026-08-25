#!/usr/bin/env tsx
/**
 * Import Foody.vn crawled stores (prisma/data/foody/*.json) as priced food spots.
 * Only imports stores with a crawled price range whose midpoint is within the
 * cheap budget band. Dedupe key: (osmType="foody", osmId=storeId).
 *
 * Run `pnpm map:import:link` afterwards to rebuild school links.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";

const DATA_DIR = path.join(process.cwd(), "prisma/data/foody");
const CHEAP_MAX_VND = 60_000;

const BBOX: Record<string, [number, number, number, number]> = {
  hanoi: [20.95, 105.72, 21.12, 106.0],
  saigon: [10.68, 106.55, 10.92, 106.85],
};

/** Drink-only stalls (trà sữa, cà phê, nước ép...) are not meals — excluded from the map. */
const DRINK_RE =
  /(tra sua|trachanh|tra gung|daoa|dua tac|ca phe|caphe|cafe|coffee|milk ?tea|bubble tea|boba|nuoc ep|sinh to|smothie|smoothie|nuoc mia|da xay|bac xiu|yogurt|sua chua|kombucha|espresse|pepsi|coca)/i;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase();
}

const CITY_CLUSTER: Record<string, string> = {
  "ho-chi-minh": "saigon",
  "ha-noi": "hanoi",
};

type Store = {
  id: number;
  name: string;
  address: string;
  district: string | null;
  lat: number | null;
  lng: number | null;
  detailUrl: string;
  cuisines: string[];
  avgRating: string | null;
  totalReview: number;
};

type PriceInfo = { min: number; max: number };

function cuisineTag(cuisines: string[]): string | null {
  const map: Record<string, string> = {
    "Món Việt": "vietnamese",
    "Món Á": "asian",
    "Món Âu": "european",
    "Món Hàn": "korean",
    "Món Nhật": "japanese",
    "Món Trung": "chinese",
    "Món Thái": "thai",
    "Ẩm thực đường phố": "street-food",
  };
  for (const c of cuisines) if (map[c]) return map[c]!;
  return null;
}

async function main(): Promise<void> {
  let imported = 0;
  let skippedCheapFilter = 0;
  let skippedNoPrice = 0;
  let skippedNoCoords = 0;
  let skippedBadPrice = 0;
  let skippedNotPhysical = 0;
  let skippedDrink = 0;

  for (const [citySlug, clusterSlug] of Object.entries(CITY_CLUSTER)) {
    const cluster = await prisma.foodCluster.findUnique({ where: { slug: clusterSlug } });
    if (!cluster) {
      console.warn(`skip (no cluster ${clusterSlug})`);
      continue;
    }
    const storesPath = path.join(DATA_DIR, `stores-${citySlug}.json`);
    const pricesPath = path.join(DATA_DIR, `prices-${citySlug}.json`);
    let stores: Record<string, Store> = {};
    let prices: Record<string, PriceInfo> = {};
    try {
      stores = JSON.parse(readFileSync(storesPath, "utf8"));
    } catch {
      console.warn(`no store cache for ${citySlug}`);
      continue;
    }
    try {
      prices = JSON.parse(readFileSync(pricesPath, "utf8"));
    } catch {
      /* no prices yet */
    }

    for (const store of Object.values(stores)) {
      const price = prices[String(store.id)];
      if (!price || !(price.min > 0)) {
        skippedNoPrice++;
        continue;
      }
      const avg = Math.round((price.min + price.max) / 2);
      if (avg > CHEAP_MAX_VND) {
        skippedCheapFilter++;
        continue;
      }
      if (avg < 1_000) {
        skippedBadPrice++;
        continue;
      }
      const text = `${store.name} ${store.address}`.toLowerCase();
      if (text.includes("online")) {
        skippedNotPhysical++;
        continue;
      }
      if (DRINK_RE.test(normalize(store.name))) {
        skippedDrink++;
        continue;
      }
      const bbox = BBOX[clusterSlug]!;
      if (
        store.lat == null ||
        store.lng == null ||
        store.lat < bbox[0] ||
        store.lng < bbox[1] ||
        store.lat > bbox[2] ||
        store.lng > bbox[3]
      ) {
        skippedNoCoords++;
        continue;
      }

      const existing = await prisma.foodSpot.findUnique({
        where: { osmType_osmId: { osmType: "foody", osmId: String(store.id) } },
      });
      if (existing) continue;

      const tags: string[] = [];
      const ct = cuisineTag(store.cuisines);
      if (ct) tags.push(ct);
      if (avg <= 25_000) tags.push("under-25k");
      else if (avg <= 35_000) tags.push("under-35k");

      const rangeLabel =
        price.min === price.max ? `${Math.round(price.min / 1000)}k` : `${Math.round(price.min / 1000)}–${Math.round(price.max / 1000)}k`;

      await prisma.foodSpot.create({
        data: {
          id: uuidv7(),
          clusterId: cluster.id,
          name: store.name,
          address: [store.address, store.district].filter(Boolean).join(", "),
          lat: store.lat,
          lng: store.lng,
          avgPriceVnd: BigInt(avg),
          tags,
          note: `Giá bình quân đầu người ${rangeLabel} · Nguồn: Foody`,
          source: "foody",
          sourceRef: `https://www.foody.vn${store.detailUrl}`,
          verified: false,
          order: 500 + imported,
        },
      });
      imported++;
      if (imported % 50 === 0) console.log(`imported so far: ${imported}`);
    }
  }

  console.log(
    `Foody import: ${imported} imported, ${skippedCheapFilter} over ${CHEAP_MAX_VND / 1000}k, ${skippedNoPrice} unpriced, ${skippedBadPrice} bad price, ${skippedNotPhysical} online-only, ${skippedDrink} drink-only, ${skippedNoCoords} no coords/out of city`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
