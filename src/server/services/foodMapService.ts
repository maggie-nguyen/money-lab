import type { Locale } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { parseVnd, vndToString } from "@/server/lib/money";

const moneyVnd = z
  .string()
  .regex(/^\d{1,15}$/, "Amount must be a non-negative integer in VND (dong).");

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
      _count: { select: { spots: true } },
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
    include: { translations: true, spots: { orderBy: { order: "asc" }, include: { reviews: true } } },
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
  };
}

/** Spots with coordinates inside a map viewport. Caps at 200 pins per request. */
export async function listFoodSpotsInBounds(bounds: MapBounds): Promise<FoodSpotPin[]> {
  const { swLat, swLng, neLat, neLng } = bounds;
  const spots = await prisma.foodSpot.findMany({
    where: {
      lat: { not: null, gte: Math.min(swLat, neLat), lte: Math.max(swLat, neLat) },
      lng: { not: null, gte: Math.min(swLng, neLng), lte: Math.max(swLng, neLng) },
    },
    include: { reviews: { select: { rating: true } } },
    take: 200,
    orderBy: { order: "asc" },
  });
  return spots.map(spotToPin).filter((p): p is FoodSpotPin => p != null);
}

export const foodReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(800),
  priceVnd: moneyVnd.optional(),
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
  return {
    id: review.id,
    rating: review.rating,
    body: review.body,
    priceVnd: review.priceVnd != null ? vndToString(review.priceVnd) : null,
    authorName: review.user.displayName,
    createdAt: review.createdAt.toISOString(),
  };
}
