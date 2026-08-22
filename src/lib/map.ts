export type MapCenter = { lat: number; lng: number; zoom: number };

/** Default map centers when geolocation is unavailable. */
export const MAP_DEFAULTS = {
  hcm: { lat: 10.8015, lng: 106.7098, zoom: 15 } satisfies MapCenter,
  hanoi: { lat: 21.0368, lng: 105.7821, zoom: 15 } satisfies MapCenter,
  /** Fallback for unknown province — HCMC. */
  fallback: { lat: 10.8015, lng: 106.7098, zoom: 14 } satisfies MapCenter,
} as const;

export type MapBounds = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

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

export type PriceFilter = "all" | "under25" | "under35";

/** Canonical English tag slugs stored in the database (UI labels come from i18n). */
export const FoodTag = {
  RICE: "rice",
  NOODLES: "noodles",
  PHO: "pho",
  BUBBLE_TEA: "bubble-tea",
  CANTEEN: "canteen",
  BANH_MI: "banh-mi",
  SNACKS: "snacks",
  STICKY_RICE: "sticky-rice",
  DESSERT: "dessert",
  UNDER_25K: "under-25k",
  UNDER_35K: "under-35k",
  UNDER_50K: "under-50k",
} as const;

export type FoodTagId = (typeof FoodTag)[keyof typeof FoodTag];

/** Tags exposed as map filter chips (subset of FoodTag). */
export const MAP_FILTER_TAGS = [
  FoodTag.RICE,
  FoodTag.NOODLES,
  FoodTag.BUBBLE_TEA,
  FoodTag.CANTEEN,
] as const;

/** Resolve a DB tag slug to a localized label; falls back to the slug. */
export function formatFoodTag(tag: string, t: (key: string) => string): string {
  const key = `map.tag.${tag}`;
  const label = t(key);
  return label === key ? tag : label;
}

export function pinPriceTier(priceVnd: string | null): "cheap" | "mid" | "unknown" {
  if (!priceVnd) return "unknown";
  const n = Number(priceVnd);
  if (n <= 25000) return "cheap";
  if (n <= 35000) return "mid";
  return "unknown";
}

export function matchesPriceFilter(pin: FoodSpotPin, filter: PriceFilter): boolean {
  if (filter === "all") return true;
  const n = pin.avgPriceVnd ? Number(pin.avgPriceVnd) : null;
  if (n == null) return false;
  if (filter === "under25") return n <= 25000;
  return n <= 35000;
}

export function formatPinPrice(priceVnd: string | null): string {
  if (!priceVnd) return "?";
  const n = Number(priceVnd);
  if (Number.isNaN(n)) return "?";
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export const AREA_PRESETS: MapCenter[] = [
  MAP_DEFAULTS.hcm,
  MAP_DEFAULTS.hanoi,
];

/** Rough mainland bbox — used to decide whether geolocation is useful for food spots. */
export const VIETNAM_BOUNDS = {
  south: 8.0,
  north: 23.6,
  west: 102.0,
  east: 109.6,
} as const;

export function isInVietnam(lat: number, lng: number): boolean {
  return (
    lat >= VIETNAM_BOUNDS.south &&
    lat <= VIETNAM_BOUNDS.north &&
    lng >= VIETNAM_BOUNDS.west &&
    lng <= VIETNAM_BOUNDS.east
  );
}

export function markerColor(tier: ReturnType<typeof pinPriceTier>): string {
  switch (tier) {
    case "cheap":
      return "#2d6a4f";
    case "mid":
      return "#b08900";
    default:
      return "#6b7280";
  }
}
