/** Haversine distance in meters between two WGS84 points. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const execFileAsync = promisify(execFile);

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

/** Rough walk time at ~80 m/min (urban student pace). */
export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / 80));
}

export function slugify(input: string, maxLen = 72): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type CityImportConfig = {
  clusterSlug: string;
  /** south, west, north, east */
  bbox: [number, number, number, number];
};

export const CITY_BBOX: Record<string, CityImportConfig> = {
  hanoi: {
    clusterSlug: "hanoi",
    bbox: [20.95, 105.72, 21.12, 106.0],
  },
  saigon: {
    clusterSlug: "saigon",
    bbox: [10.68, 106.55, 10.92, 106.85],
  },
};

const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter"];

export function splitBbox(
  bbox: [number, number, number, number],
  rows: number,
  cols: number,
): [number, number, number, number][] {
  const [south, west, north, east] = bbox;
  const latStep = (north - south) / rows;
  const lngStep = (east - west) / cols;
  const cells: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push([
        south + r * latStep,
        west + c * lngStep,
        south + (r + 1) * latStep,
        west + (c + 1) * lngStep,
      ]);
    }
  }
  return cells;
}

function parseOverpassJson(data: unknown): OsmElement[] {
  if (!data || typeof data !== "object") return [];
  const elements = (data as { elements?: OsmElement[] }).elements;
  return Array.isArray(elements) ? elements : [];
}

function isOverpassErrorBody(text: string): boolean {
  return text.includes("<strong") && text.includes("Error");
}

async function fetchOverpassCurl(endpoint: string, query: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sS",
      "--http1.1",
      "-m",
      "180",
      "-X",
      "POST",
      endpoint,
      "-H",
      "Content-Type: application/x-www-form-urlencoded",
      "-H",
      "User-Agent: MoneyLab-FoodMap/1.0",
      "--data-urlencode",
      `data=${query}`,
    ],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  return stdout;
}

export async function fetchOverpass(query: string, retries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length]!;
    try {
      let text: string;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "MoneyLab-FoodMap/1.0 (education map; contact: dev@moneylab.local)",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(180_000),
        });
        text = await res.text();
        if (res.status === 429 || res.status === 504 || res.status === 503 || isOverpassErrorBody(text)) {
          await sleep(15000 + attempt * 10000);
          continue;
        }
        if (!res.ok) throw new Error(`Overpass ${res.status}: ${text.slice(0, 400)}`);
      } catch {
        text = await fetchOverpassCurl(endpoint, query);
        if (isOverpassErrorBody(text)) {
          await sleep(15000 + attempt * 10000);
          continue;
        }
      }
      if (!text.trim()) throw new Error("Overpass empty response");
      return JSON.parse(text) as unknown;
    } catch (e) {
      lastErr = e;
      await sleep(8000 + attempt * 5000);
    }
  }
  throw lastErr;
}

/** Fetch Overpass in a grid to avoid public server timeouts on large bboxes. */
export async function fetchOverpassGrid(
  buildQuery: (bbox: [number, number, number, number]) => string,
  bbox: [number, number, number, number],
  grid = { rows: 3, cols: 3 },
): Promise<{ elements: OsmElement[] }> {
  const cells = splitBbox(bbox, grid.rows, grid.cols);
  const byKey = new Map<string, OsmElement>();
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    console.log(`    overpass cell ${i + 1}/${cells.length}…`);
    let raw: unknown | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        raw = await fetchOverpass(buildQuery(cell));
        break;
      } catch (e) {
        console.warn(`      cell retry ${attempt + 1}/5:`, e instanceof Error ? e.message : e);
        await sleep(20000 + attempt * 10000);
      }
    }
    if (!raw) throw new Error(`Overpass failed for cell ${i + 1}/${cells.length}`);
    for (const el of parseOverpassJson(raw)) {
      byKey.set(`${el.type}/${el.id}`, el);
    }
    if (i < cells.length - 1) await sleep(10000);
  }
  return { elements: [...byKey.values()] };
}

export function schoolsOverpassQuery(bbox: [number, number, number, number]): string {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:180];
(
  node["amenity"~"school|university|college"](${s},${w},${n},${e});
  way["amenity"~"school|university|college"](${s},${w},${n},${e});
  relation["amenity"~"school|university|college"](${s},${w},${n},${e});
);
out center tags;
`.trim();
}

export function foodOverpassQuery(bbox: [number, number, number, number]): string {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:180];
(
  node["amenity"~"restaurant|cafe|fast_food|food_court|biergarten"](${s},${w},${n},${e});
  way["amenity"~"restaurant|cafe|fast_food|food_court|biergarten"](${s},${w},${n},${e});
  relation["amenity"~"restaurant|cafe|fast_food|food_court|biergarten"](${s},${w},${n},${e});
);
out center tags;
`.trim();
}

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export function osmCoords(el: OsmElement): { lat: number; lng: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

export function osmAddress(tags: Record<string, string>): string {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] ?? tags["addr:quarter"],
    tags["addr:district"] ?? tags["addr:city"],
  ].filter(Boolean);
  return parts.join(", ") || tags["addr:full"] || "";
}
