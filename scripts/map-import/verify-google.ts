#!/usr/bin/env tsx
/**
 * Verify foody pins against Google Places Text Search (New) — resumable.
 * A pin is confirmed physical (verified=true) when Google returns a place whose
 * name overlaps the pin name within 300 m; captures placeId + photo refs so the
 * pin carries a Google link and an embedded photo strip (references only).
 *
 * Uses the Maps Demo key in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. That key is capped
 * (~100 units/day, Text Search ≈ 10×), so expect roughly ~10 confirmed pins per
 * run. Aborts cleanly on quota (429) and is resumable — re-run tomorrow.
 */
import { prisma } from "../../src/server/db";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MATCH_RADIUS_M = 300;
const CONCURRENCY = 2;
const DELAY_MS = 600;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenOverlap(a: string, b: string): number {
  const at = a.split(" ").filter((t) => t.length > 1);
  const bt = new Set(b.split(" "));
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter++;
  return at.length ? inter / at.length : 0;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Place = { id?: string; displayName?: { text?: string }; location?: { latitude: number; longitude: number }; photos?: { name: string }[] };

class QuotaExhausted extends Error {}

async function searchPlaces(query: string): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "vi", regionCode: "VN", maxResultCount: 3 }),
  });
  if (res.status === 429) throw new QuotaExhausted("Google Places daily quota exhausted — re-run after reset (resumable)");
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: Place[] };
  return data.places ?? [];
}

async function verifySpot(spot: { id: string; name: string; address: string; lat: number | null; lng: number | null }): Promise<{ verified: boolean; googlePlaceId?: string; gallery: string[] }> {
  if (spot.lat == null || spot.lng == null) return { verified: false, gallery: [] };
  const places = await searchPlaces(`${spot.name}, ${spot.address}`);
  const nName = normalize(spot.name);
  for (const p of places) {
    if (!p.location || !p.displayName?.text) continue;
    if (distanceMeters(spot.lat, spot.lng, p.location.latitude, p.location.longitude) <= MATCH_RADIUS_M && tokenOverlap(nName, normalize(p.displayName.text)) >= 0.5) {
      return { verified: true, googlePlaceId: p.id, gallery: (p.photos ?? []).slice(0, 4).map((ph) => ph.name) };
    }
  }
  return { verified: false, gallery: [] };
}

async function main(): Promise<void> {
  if (!KEY) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing");
  const spots = await prisma.foodSpot.findMany({
    where: { source: "foody", verified: false },
    select: { id: true, name: true, address: true, lat: true, lng: true },
  });
  console.log(`verifying ${spots.length} pins (resumable; Demo key ≈ 10/day)…`);

  let done = 0;
  let confirmed = 0;
  let cursor = 0;
  let quotaDead = false;

  async function worker(): Promise<void> {
    while (cursor < spots.length && !quotaDead) {
      const spot = spots[cursor++]!;
      let result: { verified: boolean; googlePlaceId?: string; gallery: string[] } = { verified: false, gallery: [] };
      try {
        result = await verifySpot(spot);
      } catch (e) {
        if (e instanceof QuotaExhausted) {
          quotaDead = true;
          console.error(e.message);
          break;
        }
      }
      if (result.verified) {
        confirmed++;
        await prisma.foodSpot.update({
          where: { id: spot.id },
          data: { verified: true, googlePlaceId: result.googlePlaceId ?? null, gallery: result.gallery },
        });
      }
      done++;
      if (done % 25 === 0) console.log(`progress: ${done}/${spots.length} — confirmed ${confirmed} (quotaDead=${quotaDead})`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`Google verification: ${confirmed} confirmed, ${quotaDead ? "stopped on quota" : "done"}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
