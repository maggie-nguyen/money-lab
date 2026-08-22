export type MapCenter = { lat: number; lng: number; zoom: number };

/** Default map centers when geolocation is unavailable. */
export const MAP_DEFAULTS = {
  hcm: { lat: 10.8015, lng: 106.7098, zoom: 15 } satisfies MapCenter,
  hanoi: { lat: 21.0368, lng: 105.7821, zoom: 15 } satisfies MapCenter,
  /** Default on load and when abroad — Hanoi (seed data also covers Saigon). */
  fallback: { lat: 21.0368, lng: 105.7821, zoom: 14 } satisfies MapCenter,
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
  source?: string;
  verified?: boolean;
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
  MAP_DEFAULTS.hanoi,
  MAP_DEFAULTS.hcm,
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

/** Rough viewport box from a center + zoom — used before the map fires its first idle event. */
export function boundsFromCenter(center: MapCenter, delta = 0.05): MapBounds {
  return {
    swLat: center.lat - delta,
    swLng: center.lng - delta,
    neLat: center.lat + delta,
    neLng: center.lng + delta,
  };
}

export function boundsCenter(bounds: MapBounds): { lat: number; lng: number } {
  return {
    lat: (bounds.swLat + bounds.neLat) / 2,
    lng: (bounds.swLng + bounds.neLng) / 2,
  };
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / 80));
}

/** SVG price-tag icon for classic Google markers (works without a Map ID). */
export function priceMarkerIconUrl(
  label: string,
  tier: ReturnType<typeof pinPriceTier>,
  selected: boolean,
): string {
  const fill = markerColor(tier);
  const stroke = selected ? "#0e3123" : "#ffffff";
  const safe = label.replace(/[<>&'"]/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="34">` +
    `<rect x="4" y="2" width="44" height="22" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    `<text x="26" y="14" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="11" font-weight="700" font-family="system-ui,sans-serif">${safe}</text>` +
    `<path d="M26 24 L20 31 L32 31 Z" fill="${fill}" stroke="${stroke}"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

/** Blue (THPT) or purple (university) school pin for classic markers. */
export function schoolMarkerIconUrl(kind: string): string {
  const fill = kind === "UNIVERSITY" ? "#5b21b6" : kind === "VOCATIONAL" ? "#0e7490" : "#1d4ed8";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">` +
    `<circle cx="14" cy="14" r="11" fill="${fill}" stroke="#fff" stroke-width="2"/>` +
    `<path d="M14 7 L8 10 v6 c0 3.5 2.8 5.5 6 6 3.2-.5 6-2.5 6-6 v-6 Z" fill="#fff" opacity="0.95"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
