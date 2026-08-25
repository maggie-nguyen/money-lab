import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import {
  listFoodSpotsInBounds,
  listFoodClusters,
  listFoodSpots,
} from "@/server/services/foodMapService";
import { FoodSpotSource } from "@prisma/client";

/**
 * Map-pipeline data-integrity + resilience suite.
 * These assert the production rules enforced during the data build:
 *   - no price  -> no pin
 *   - foody pins must be verified (no ghost kitchens)
 *   - student budget ceiling (<= 60k)
 *   - pins that ARE visible always carry coords + price
 *   - cluster counts reflect only visible pins
 *   - concurrent viewport reads stay correct (no dedupe/overfetch races)
 */

const stamp = Date.now();
const slug = `stress-cluster-${stamp}`;
let clusterId = "";

const HCM_BOUNDS = {
  swLat: 10.72,
  swLng: 106.58,
  neLat: 10.87,
  neLng: 106.82,
};

/** Create a spot in the stress cluster. */
async function createSpot(overrides: Partial<{
  name: string;
  address: string;
  lat: number;
  lng: number;
  avgPriceVnd: bigint | null;
  source: FoodSpotSource;
  verified: boolean;
}> = {}) {
  const spot = await prisma.foodSpot.create({
    data: {
      id: uuidv7(),
      clusterId,
      name: overrides.name ?? `Spot-${uuidv7()}`,
      address: overrides.address ?? "123 Đường thử",
      lat: overrides.lat ?? 10.76 + Math.random() * 0.05,
      lng: overrides.lng ?? 106.62 + Math.random() * 0.05,
      avgPriceVnd: overrides.avgPriceVnd === undefined ? 25000n : overrides.avgPriceVnd,
      source: overrides.source === undefined ? FoodSpotSource.manual : overrides.source,
      verified: overrides.verified === undefined ? false : overrides.verified,
      order: 0,
    },
  });
  return spot;
}

beforeAll(async () => {
  const cluster = await prisma.foodCluster.create({
    data: {
      id: uuidv7(),
      slug,
      city: "HCM",
      order: 98,
      translations: { create: { locale: "vi", name: "Khu stress-test", description: "" } },
    },
  });
  clusterId = cluster.id;
});

describe("visible-rule: no price -> no pin", () => {
  it("excludes a priced-out-of-budget manual spot from the map", async () => {
    const over = await createSpot({ avgPriceVnd: 123000n, name: "Quán quá đắt" });
    const pins = await listFoodSpotsInBounds(HCM_BOUNDS);
    expect(pins.map((p) => p.id)).not.toContain(over.id);
  });

  it("excludes an unpriced (avgPriceVnd null) spot", async () => {
    // manual + null price must never appear (rule: price is the product)
    const unpriced = await createSpot({ avgPriceVnd: null });
    const pins = await listFoodSpotsInBounds(HCM_BOUNDS);
    const ids = pins.map((p) => p.id);
    expect(ids).not.toContain(unpriced.id);
    expect(pins.every((p) => p.avgPriceVnd != null)).toBe(true);
  });
});

describe("visible-rule: foody pins must be verified (no ghost kitchens)", () => {
  it("excludes an unverified foody spot even if priced", async () => {
    const ghost = await createSpot({
      source: FoodSpotSource.foody,
      verified: false,
      name: "Ghost kitchen - virtual",
      avgPriceVnd: 30000n,
    });
    const pins = await listFoodSpotsInBounds(HCM_BOUNDS);
    expect(pins.map((p) => p.id)).not.toContain(ghost.id);
  });

  it("includes a verified foody spot that is priced", async () => {
    const real = await createSpot({
      source: FoodSpotSource.foody,
      verified: true,
      name: "Physical shop - confirmed",
      avgPriceVnd: 35000n,
    });
    const pins = await listFoodSpotsInBounds(HCM_BOUNDS);
    expect(pins.map((p) => p.id)).toContain(real.id);
  });

  it("includes a verified foody spot only up to the 60k ceiling", async () => {
    const pricey = await createSpot({
      source: FoodSpotSource.foody,
      verified: true,
      name: "Buffet 60k",
      avgPriceVnd: 60000n,
    });
    const pins = await listFoodSpotsInBounds(HCM_BOUNDS);
    expect(pins.map((p) => p.id)).toContain(pricey.id);

    const tooPricey = await createSpot({
      source: FoodSpotSource.foody,
      verified: true,
      name: "Buffet 99k",
      avgPriceVnd: 99000n,
    });
    const pins2 = await listFoodSpotsInBounds(HCM_BOUNDS);
    expect(pins2.map((p) => p.id)).not.toContain(tooPricey.id);
  });
});

describe("pin payload integrity", () => {
  it("every returned pin has non-null coords + price + id", async () => {
    const pins = await listFoodSpotsInBounds(HCM_BOUNDS);
    for (const p of pins) {
      expect(p.id).toBeTruthy();
      expect(p.avgPriceVnd).not.toBeNull();
      expect(typeof p.lat).toBe("number");
      expect(typeof p.lng).toBe("number");
      expect(Number(p.avgPriceVnd)).toBeGreaterThan(0);
      expect(Number(p.avgPriceVnd)).toBeLessThanOrEqual(60000);
    }
  });

  it("never returns duplicate pin ids within a viewport read", async () => {
    const pins = await listFoodSpotsInBounds(HCM_BOUNDS);
    const ids = pins.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns spots strictly inside the requested bounds", async () => {
    const tight = { swLat: 10.76, swLng: 106.62, neLat: 10.77, neLng: 106.63 };
    const pins = await listFoodSpotsInBounds(tight);
    for (const p of pins) {
      expect(p.lat).toBeGreaterThanOrEqual(tight.swLat);
      expect(p.lat).toBeLessThanOrEqual(tight.neLat);
      expect(p.lng).toBeGreaterThanOrEqual(tight.swLng);
      expect(p.lng).toBeLessThanOrEqual(tight.neLng);
    }
  });
});

describe("cluster count reflects visible pins only", () => {
  it("does not count unpriced or unverified-foody spots", async () => {
    // create clearly-visible + clearly-hidden and compare
    const visible = await createSpot({
      source: FoodSpotSource.manual,
      avgPriceVnd: 20000n,
      name: "Visible for count",
    });
    await createSpot({ source: FoodSpotSource.manual, avgPriceVnd: null, name: "Hidden no-price" });
    await createSpot({
      source: FoodSpotSource.foody,
      verified: false,
      avgPriceVnd: 25000n,
      name: "Hidden ghost",
    });

    const clusters = await listFoodClusters("vi");
    const c = clusters.find((x) => x.slug === slug);
    expect(c).toBeTruthy();
    // raw rows created for this cluster exceed the visible count → proves filter applied
    const raw = await prisma.foodSpot.count({ where: { clusterId } });
    expect(c!.spotCount).toBeLessThan(raw);
    expect(c!.spotCount).toBeGreaterThan(0);
    expect(visible.id).toBeTruthy();
  });
});

describe("import idempotency: (osmType, osmId) uniqueness", () => {
  it("rejects a second foody spot with the same foody:storeId (prevents crawl re-import dupes)", async () => {
    const cluster = await prisma.foodCluster.findUniqueOrThrow({ where: { slug } });
    const first = await prisma.foodSpot.create({
      data: {
        id: uuidv7(), clusterId: cluster.id, name: "Foody store A", address: "x",
        lat: 10.78, lng: 106.68, avgPriceVnd: 25000n,
        source: FoodSpotSource.foody, osmType: "foody", osmId: "12345", order: 0,
      },
    });
    expect(first.id).toBeTruthy();
    // A duplicate import of the same store must be rejected by the unique index.
    await expect(
      prisma.foodSpot.create({
        data: {
          id: uuidv7(), clusterId: cluster.id, name: "Foody store A dup", address: "x",
          lat: 10.781, lng: 106.681, avgPriceVnd: 26000n,
          source: FoodSpotSource.foody, osmType: "foody", osmId: "12345", order: 1,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("legacy cluster endpoint also honors visibility rules", () => {
  it("does not leak ghost-kitchen or over-budget spots via listFoodSpots", async () => {
    const cluster = await prisma.foodCluster.findUniqueOrThrow({ where: { slug } });
    const ghost = await createSpot({ source: FoodSpotSource.foody, verified: false, avgPriceVnd: 25000n, name: "Ghost leak" });
    const over = await createSpot({ source: FoodSpotSource.manual, avgPriceVnd: 99000n, name: "Over leak" });
    const vis = await createSpot({ source: FoodSpotSource.manual, avgPriceVnd: 25000n, name: "Visible ok" });

    const res = await listFoodSpots(slug, "vi");
    const ids = (res?.spots ?? []).map((s) => s.id);
    expect(ids).not.toContain(ghost.id);
    expect(ids).not.toContain(over.id);
    expect(ids).toContain(vis.id);
    expect(cluster.id).toBeTruthy();
  });
});

describe("concurrent viewport reads (stress)", () => {
  it("handles 40 concurrent reads without errors or duplicate ids", async () => {
    const reads = await Promise.all(
      Array.from({ length: 40 }, () => listFoodSpotsInBounds(HCM_BOUNDS)),
    );
    expect(reads.length).toBe(40);
    for (const pins of reads) {
      const ids = pins.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(pins.every((p) => p.avgPriceVnd != null)).toBe(true);
    }
  });
});
