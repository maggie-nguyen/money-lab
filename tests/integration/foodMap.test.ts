import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import {
  createCommunityFoodSpot,
  createFoodReview,
  getFoodSpot,
  listFoodSpotsInBounds,
} from "@/server/services/foodMapService";
import { makeLearner } from "../factories";

/**
 * Food map reviews carry optional student prices. When a learner submits
 * priceVnd, the spot's avgPriceVnd is recomputed as the minimum across all
 * priced reviews — the cheapest reported meal wins for map visibility.
 */

const stamp = Date.now();
const clusterSlug = `food-cluster-${stamp}`;

let spotId = "";

beforeAll(async () => {
  const cluster = await prisma.foodCluster.create({
    data: {
      id: uuidv7(),
      slug: clusterSlug,
      city: "HCM",
      order: 99,
      translations: {
        create: { locale: "vi", name: "Khu ăn thử", description: "Mô tả" },
      },
    },
  });
  const spot = await prisma.foodSpot.create({
    data: {
      id: uuidv7(),
      clusterId: cluster.id,
      name: "Quán thử nghiệm",
      address: "123 Đường thử",
      lat: 10.77,
      lng: 106.69,
      order: 1,
    },
  });
  spotId = spot.id;
});

describe("listFoodSpotsInBounds", () => {
  const bounds = {
    swLat: 10.765,
    swLng: 106.685,
    neLat: 10.775,
    neLng: 106.695,
  };

  it("only returns spots with avgPriceVnd (mapVisibleSpotWhere)", async () => {
    const cluster = await prisma.foodCluster.findUniqueOrThrow({ where: { slug: clusterSlug } });

    const unpriced = await prisma.foodSpot.create({
      data: {
        id: uuidv7(),
        clusterId: cluster.id,
        name: "Quán chưa có giá",
        address: "124 Đường thử",
        lat: 10.768,
        lng: 106.688,
        order: 2,
        avgPriceVnd: null,
      },
    });
    const priced = await prisma.foodSpot.create({
      data: {
        id: uuidv7(),
        clusterId: cluster.id,
        name: "Quán có giá",
        address: "125 Đường thử",
        lat: 10.769,
        lng: 106.689,
        order: 3,
        avgPriceVnd: 15000n,
      },
    });

    const pins = await listFoodSpotsInBounds(bounds);
    const ids = pins.map((p) => p.id);

    expect(ids).toContain(priced.id);
    expect(ids).not.toContain(unpriced.id);
    expect(pins.every((p) => p.avgPriceVnd != null)).toBe(true);
  });
});

describe("createFoodReview avgPriceVnd", () => {
  it("keeps price optional for the legacy review screen", async () => {
    const { user } = await makeLearner();
    const review = await createFoodReview(user.id, spotId, {
      rating: 4,
      body: "Không ghi lại giá hôm nay.",
    });

    expect(review.priceVnd).toBeNull();
  });

  it("sets avgPriceVnd from the first priced review", async () => {
    const { user } = await makeLearner();
    const review = await createFoodReview(user.id, spotId, {
      rating: 4,
      body: "Rẻ và ngon, phù hợp sinh viên.",
      priceVnd: "25000",
    });

    expect(review.priceVnd).toBe("25000");

    const spot = await prisma.foodSpot.findUnique({ where: { id: spotId } });
    expect(spot?.avgPriceVnd?.toString()).toBe("25000");

    const detail = await getFoodSpot(spotId, "vi");
    expect(detail?.avgPriceVnd).toBe("25000");
  });

  it("lowers avgPriceVnd when a cheaper priced review is added", async () => {
    const { user } = await makeLearner();
    await createFoodReview(user.id, spotId, {
      rating: 5,
      body: "Hôm nay khuyến mãi, chỉ hai mươi nghìn.",
      priceVnd: "20000",
    });

    const spot = await prisma.foodSpot.findUnique({ where: { id: spotId } });
    expect(spot?.avgPriceVnd?.toString()).toBe("20000");
  });

  it("keeps avgPriceVnd at the minimum when a higher priced review is added", async () => {
    const { user } = await makeLearner();
    await createFoodReview(user.id, spotId, {
      rating: 3,
      body: "Hôm nay đắt hơn bình thường, ba mươi nghìn.",
      priceVnd: "30000",
    });

    const spot = await prisma.foodSpot.findUnique({ where: { id: spotId } });
    expect(spot?.avgPriceVnd?.toString()).toBe("20000");
  });
});

describe("community food spot safeguards", () => {
  it("rejects coordinates outside the selected city", async () => {
    const { user } = await makeLearner();
    await prisma.foodCluster.upsert({
      where: { slug: "hanoi" },
      create: {
        id: uuidv7(), slug: "hanoi", city: "Hanoi", order: 1,
        translations: { create: { locale: "vi", name: "Hà Nội", description: "" } },
      },
      update: {},
    });
    await expect(
      createCommunityFoodSpot(user.id, {
        name: "Quán ngoài khu vực",
        address: "123 Đường thử",
        lat: 35.6762,
        lng: 139.6503,
        priceVnd: "25000",
        clusterSlug: "hanoi",
      }),
    ).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  });
});
