import type { Locale, Prisma } from "@prisma/client";
import { FoodSpotSource } from "@prisma/client";
import { z } from "zod";
import { distanceMeters, walkMinutes } from "@/lib/map";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { AppError, notFound, ruleViolation } from "@/server/lib/errors";
import { parseVnd, vndToString } from "@/server/lib/money";

const moneyVnd = z
  .string()
  .regex(/^\d{1,15}$/, "Amount must be a non-negative integer in VND (dong).");

/** Hard product ceiling: a student-meal pin is never more than 60k VND. */
export const MAX_STUDENT_MEAL_VND = 60_000n;

function pickTranslation<T extends { locale: Locale }>(rows: T[], locale: Locale): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "vi") ?? rows[0];
}

export interface FoodClusterSummary {
  id: string;
  slug: string;
  city: string;
  name: string;
  description: string;
  spotCount: number;
  lat: number | null;
  lng: number | null;
}

export interface FoodReviewView {
  id: string;
  rating: number;
  body: string;
  priceVnd: string | null;
  authorName: string;
  createdAt: string;
}

export interface FoodSpotView {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  avgPriceVnd: string | null;
  tags: string[];
  note: string;
  reviewCount: number;
  avgRating: number | null;
  googlePlaceId?: string | null;
  gallery?: string[];
}

/** Lightweight pin payload for the map viewport API. */
export interface FoodSpotPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  avgPriceVnd: string | null;
  tags: string[];
  note: string;
  address: string;
  reviewCount: number;
  avgRating: number | null;
  source?: string;
  verified?: boolean;
  googlePlaceId?: string | null;
  gallery?: string[];
}

export interface SchoolPin {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  address: string;
  nearbySpotCount: number;
}

export interface FoodSpotDetail extends FoodSpotView {
  clusterSlug: string;
  clusterName: string;
  reviews: FoodReviewView[];
}

export async function listFoodClusters(locale: Locale): Promise<FoodClusterSummary[]> {
  const clusters = await prisma.foodCluster.findMany({
    orderBy: { order: "asc" },
    include: {
      translations: true,
      _count: { select: { spots: { where: mapVisibleSpotWhere } } },
    },
  });
  return clusters.map((c) => {
    const tr = pickTranslation(c.translations, locale);
    return {
      id: c.id,
      slug: c.slug,
      city: c.city,
      name: tr?.name ?? c.slug,
      description: tr?.description ?? "",
      spotCount: c._count.spots,
      lat: c.lat,
      lng: c.lng,
    };
  });
}

export async function listFoodSpots(clusterSlug: string, locale: Locale): Promise<{ cluster: FoodClusterSummary; spots: FoodSpotView[] } | null> {
  const cluster = await prisma.foodCluster.findUnique({
    where: { slug: clusterSlug },
    include: {
      translations: true,
      spots: {
        where: mapVisibleSpotWhere,
        orderBy: { order: "asc" },
        include: { reviews: true },
      },
    },
  });
  if (!cluster) return null;
  const tr = pickTranslation(cluster.translations, locale);
  const clusterSummary: FoodClusterSummary = {
    id: cluster.id,
    slug: cluster.slug,
    city: cluster.city,
    name: tr?.name ?? cluster.slug,
    description: tr?.description ?? "",
    spotCount: cluster.spots.length,
    lat: cluster.lat,
    lng: cluster.lng,
  };
  const spots: FoodSpotView[] = cluster.spots.map((s) => {
    const ratings = s.reviews.map((r) => r.rating);
    const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      avgPriceVnd: s.avgPriceVnd != null ? vndToString(s.avgPriceVnd) : null,
      tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
      note: s.note,
      reviewCount: s.reviews.length,
      avgRating,
      googlePlaceId: s.googlePlaceId,
      gallery: Array.isArray(s.gallery) ? (s.gallery as string[]) : [],
    };
  });
  return { cluster: clusterSummary, spots };
}

export async function getFoodSpot(spotId: string, locale: Locale): Promise<FoodSpotDetail | null> {
  const spot = await prisma.foodSpot.findUnique({
    where: { id: spotId },
    include: {
      cluster: { include: { translations: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { user: { select: { displayName: true } } },
      },
    },
  });
  if (!spot) return null;
  const tr = pickTranslation(spot.cluster.translations, locale);
  const ratings = spot.reviews.map((r) => r.rating);
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
  return {
    id: spot.id,
    name: spot.name,
    address: spot.address,
    lat: spot.lat,
    lng: spot.lng,
    avgPriceVnd: spot.avgPriceVnd != null ? vndToString(spot.avgPriceVnd) : null,
    tags: Array.isArray(spot.tags) ? (spot.tags as string[]) : [],
    note: spot.note,
    reviewCount: spot.reviews.length,
    avgRating,
    googlePlaceId: spot.googlePlaceId,
    gallery: Array.isArray(spot.gallery) ? (spot.gallery as string[]) : [],
    clusterSlug: spot.cluster.slug,
    clusterName: tr?.name ?? spot.cluster.slug,
    reviews: spot.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      priceVnd: r.priceVnd != null ? vndToString(r.priceVnd) : null,
      authorName: r.user.displayName,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export interface MapBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

function spotToPin(s: {
  id: string;
  name: string;
  address: string;
  note: string;
  lat: number | null;
  lng: number | null;
  avgPriceVnd: bigint | null;
  tags: unknown;
  source?: string;
  verified?: boolean;
  reviews: { rating: number }[];
}): FoodSpotPin | null {
  if (s.lat == null || s.lng == null) return null;
  const ratings = s.reviews.map((r) => r.rating);
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
  return {
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    avgPriceVnd: s.avgPriceVnd != null ? vndToString(s.avgPriceVnd) : null,
    tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
    note: s.note,
    address: s.address,
    reviewCount: s.reviews.length,
    avgRating,
    source: s.source,
    verified: s.verified,
  };
}

/**
 * Spots eligible for map pins: must have a known student price AND be a trusted
 * physical storefront. Curated + OSM sources are manually researched/surveyed;
 * Foody spots must be marked verified (OSM/Google-confirmed) because Foody lists
 * virtual/ghost kitchens that have no walk-in location.
 */
export const mapVisibleSpotWhere: Prisma.FoodSpotWhereInput = {
  avgPriceVnd: { not: null, lte: MAX_STUDENT_MEAL_VND },
  NOT: { source: FoodSpotSource.foody, verified: false },
};

/** Spots with coordinates inside a map viewport. Caps at 500 pins per request. */
export async function listFoodSpotsInBounds(bounds: MapBounds): Promise<FoodSpotPin[]> {
  const { swLat, swLng, neLat, neLng } = bounds;
  const spots = await prisma.foodSpot.findMany({
    where: {
      ...mapVisibleSpotWhere,
      lat: { not: null, gte: Math.min(swLat, neLat), lte: Math.max(swLat, neLat) },
      lng: { not: null, gte: Math.min(swLng, neLng), lte: Math.max(swLng, neLng) },
    },
    include: { reviews: { select: { rating: true } } },
    take: 500,
    orderBy: [{ avgPriceVnd: "asc" }, { order: "asc" }],
  });
  return spots.map(spotToPin).filter((p): p is FoodSpotPin => p != null);
}

/** Schools with at least one priced food spot linked — anchors the “cheapest meal near campus” map. */
export async function listSchoolsInBounds(bounds: MapBounds): Promise<SchoolPin[]> {
  const { swLat, swLng, neLat, neLng } = bounds;
  const schools = await prisma.school.findMany({
    where: {
      lat: { not: null, gte: Math.min(swLat, neLat), lte: Math.max(swLat, neLat) },
      lng: { not: null, gte: Math.min(swLng, neLng), lte: Math.max(swLng, neLng) },
      spotLinks: {
        some: { spot: mapVisibleSpotWhere },
      },
    },
    include: {
      translations: true,
      spotLinks: {
        where: { spot: mapVisibleSpotWhere },
        select: { spotId: true },
      },
    },
    take: 300,
    orderBy: { order: "asc" },
  });
  return schools
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => {
      const tr = pickTranslation(s.translations, "vi");
      return {
        id: s.id,
        name: tr?.name ?? s.slug,
        kind: s.kind,
        lat: s.lat!,
        lng: s.lng!,
        address: s.address,
        nearbySpotCount: s.spotLinks.length,
      };
    });
}

export const foodReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(5).max(800),
  priceVnd: moneyVnd
    .refine((v) => parseVnd(v) >= 1n, "Price must be at least 1 VND.")
    .optional(),
});

export async function createFoodReview(
  userId: string,
  spotId: string,
  input: z.infer<typeof foodReviewBodySchema>,
): Promise<FoodReviewView> {
  const spot = await prisma.foodSpot.findUnique({ where: { id: spotId } });
  if (!spot) throw new Error("NOT_FOUND");
  const review = await prisma.foodReview.create({
    data: {
      id: uuidv7(),
      spotId,
      userId,
      rating: input.rating,
      body: input.body,
      priceVnd: input.priceVnd ? parseVnd(input.priceVnd) : null,
    },
    include: { user: { select: { displayName: true } } },
  });
  if (input.priceVnd) {
    const priced = await prisma.foodReview.findMany({
      where: { spotId, priceVnd: { not: null } },
      select: { priceVnd: true },
    });
    const minPrice = priced.reduce(
      (min, row) => (row.priceVnd != null && row.priceVnd < min ? row.priceVnd : min),
      parseVnd(input.priceVnd!),
    );
    await prisma.foodSpot.update({
      where: { id: spotId },
      data: { avgPriceVnd: minPrice },
    });
  }
  return {
    id: review.id,
    rating: review.rating,
    body: review.body,
    priceVnd: review.priceVnd != null ? vndToString(review.priceVnd) : null,
    authorName: review.user.displayName,
    createdAt: review.createdAt.toISOString(),
  };
}

export const communityFoodSpotBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  priceVnd: moneyVnd
    .refine((v) => parseVnd(v) >= 1_000n, "Giá tối thiểu 1.000 đồng.")
    .refine((v) => parseVnd(v) <= MAX_STUDENT_MEAL_VND, `Giá tối đa ${Number(MAX_STUDENT_MEAL_VND) / 1000}.000 đồng (bữa ăn sinh viên).`),
  clusterSlug: z.enum(["hanoi", "saigon"]),
  note: z.string().trim().max(400).optional(),
});

export async function createCommunityFoodSpot(
  userId: string,
  input: z.infer<typeof communityFoodSpotBodySchema>,
): Promise<FoodSpotPin> {
  const cluster = await prisma.foodCluster.findUnique({ where: { slug: input.clusterSlug } });
  if (!cluster) throw notFound("Resource");

  const cityBounds = input.clusterSlug === "hanoi"
    ? { south: 20.7, north: 21.4, west: 105.4, east: 106.1 }
    : { south: 10.3, north: 11.2, west: 106.3, east: 107.1 };
  if (
    input.lat < cityBounds.south || input.lat > cityBounds.north ||
    input.lng < cityBounds.west || input.lng > cityBounds.east
  ) {
    throw ruleViolation("SPOT_OUTSIDE_CITY", "Vị trí phải nằm trong thành phố đã chọn.");
  }

  return prisma.$transaction(async (tx) => {
    const spot = await tx.foodSpot.create({
      data: {
        id: uuidv7(), clusterId: cluster.id, name: input.name, address: input.address,
        lat: input.lat, lng: input.lng, avgPriceVnd: parseVnd(input.priceVnd),
        tags: ["under-35k"], note: input.note?.trim() || "Giá do cộng đồng gửi",
        source: "manual", verified: false, order: 9000,
      },
      include: { reviews: { select: { rating: true } } },
    });
    const schools = await tx.school.findMany({
      where: { clusterId: cluster.id, lat: { not: null }, lng: { not: null } },
      select: { id: true, lat: true, lng: true },
    });
    const nearby = schools
      .map((s) => ({ schoolId: s.id, d: distanceMeters(input.lat, input.lng, s.lat!, s.lng!) }))
      .filter((x) => x.d <= 500)
      .sort((a, b) => a.d - b.d);
    if (nearby[0]) {
      await tx.foodSpotSchool.create({
        data: {
          spotId: spot.id, schoolId: nearby[0].schoolId, isPrimary: true,
          distanceMeters: Math.round(nearby[0].d), walkMinutes: walkMinutes(nearby[0].d),
          note: "Gần trường — do cộng đồng gửi",
        },
      });
    }
    await tx.foodReview.create({
      data: {
        id: uuidv7(), spotId: spot.id, userId, rating: 4,
        body: input.note?.trim() || "Quán mới trên bản đồ.", priceVnd: parseVnd(input.priceVnd),
      },
    });
    const pin = spotToPin(spot);
    if (!pin) throw new AppError("INTERNAL", "Invalid coordinates");
    return pin;
  });
}
