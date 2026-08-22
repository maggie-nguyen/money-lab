#!/usr/bin/env tsx
/**
 * Import publicly listed food spots from edu sources (read on user's behalf).
 * Source: HUST Library — https://library.hust.edu.vn/vi/node/479
 * Geocodes via Nominatim; links to nearest ĐH Bách Khoa school pin.
 */
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import { distanceMeters, sleep, walkMinutes } from "./geo";

const SOURCE_URL = "https://library.hust.edu.vn/vi/node/479";
const SOURCE = "manual" as const;

/** Parsed from public HUST library article (prices as stated on page). */
const HUST_SPOTS: {
  name: string;
  address: string;
  priceVnd: bigint;
  tags: string[];
  note: string;
}[] = [
  { name: "Nem Nướng Nha Trang – Hắt 2 Ô", address: "107A Ngõ Tự Do, Hai Bà Trưng, Hà Nội", priceVnd: 35000n, tags: ["snacks"], note: "30–40k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Phở Long (mỳ bò sốt vang)", address: "105 K9 Nguyễn Hiền, Hai Bà Trưng, Hà Nội", priceVnd: 35000n, tags: ["noodles"], note: "30–40k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Bánh gà (11 ngõ 158 Hồng Mai)", address: "11 ngõ 158 Hồng Mai, Hai Bà Trưng, Hà Nội", priceVnd: 5000n, tags: ["snacks", "under-35k"], note: "5k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Youone Hotdog", address: "7 ngõ 94 Trần Đại Nghĩa, Hai Bà Trưng, Hà Nội", priceVnd: 25000n, tags: ["snacks"], note: "~25k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Bánh tráng trộn cô Toàn", address: "A17 Tạ Quang Bửu, Hai Bà Trưng, Hà Nội", priceVnd: 20000n, tags: ["snacks"], note: "15–30k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Loan Béo (bún ngan)", address: "42 Bùi Ngọc Dương, Hai Bà Trưng, Hà Nội", priceVnd: 30000n, tags: ["noodles"], note: "30k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Changmi's Kitchen", address: "K6A Tập thể Bách Khoa, Hai Bà Trưng, Hà Nội", priceVnd: 30000n, tags: ["snacks"], note: "~30k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Bún ốc riêu (Ngõ Giếng Mứt)", address: "35 Ngõ Giếng Mứt, Bạch Mai, Hai Bà Trưng, Hà Nội", priceVnd: 35000n, tags: ["noodles"], note: "25–50k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Bún bò (107 K17 Nguyễn Hiền)", address: "107 K17 Nguyễn Hiền, Hai Bà Trưng, Hà Nội", priceVnd: 30000n, tags: ["noodles"], note: "30k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Ốc mèo mun", address: "106K3 ngõ 48 Tạ Quang Bửu, Hai Bà Trưng, Hà Nội", priceVnd: 35000n, tags: ["snacks"], note: "25–50k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Cô Lân (bánh khọt)", address: "124 Hồng Mai, Hai Bà Trưng, Hà Nội", priceVnd: 15000n, tags: ["snacks"], note: "3–30k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Bún riêu tóp mỡ Hoa Béo", address: "23 Ngõ Mai Hương, Hai Bà Trưng, Hà Nội", priceVnd: 35000n, tags: ["noodles"], note: "20–55k · Nguồn: Thư viện ĐHBK HUST" },
  { name: "Xôi Phượng", address: "48 Bạch Mai, Hai Bà Trưng, Hà Nội", priceVnd: 45000n, tags: ["sticky-rice", "rice"], note: "30–60k · Nguồn: Thư viện ĐHBK HUST" },
];

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const queries = [
    `${address}, Hai Bà Trưng, Hà Nội, Vietnam`,
    `${address}, Hanoi, Vietnam`,
  ];
  for (const q of queries) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "vn");
    const res = await fetch(url, {
      headers: { "User-Agent": "MoneyLab-FoodMap/1.0 (hust public listing geocode)" },
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { lat: string; lon: string }[];
    if (data[0]) return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
    await sleep(1100);
  }
  return null;
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main(): Promise<void> {
  const cluster = await prisma.foodCluster.findUnique({ where: { slug: "hanoi" } });
  if (!cluster) throw new Error("hanoi cluster missing");

  const bachKhoa = await prisma.school.findFirst({
    where: {
      clusterId: cluster.id,
      lat: { not: null },
      OR: [
        { translations: { some: { name: { contains: "Bách khoa", mode: "insensitive" } } } },
        { translations: { some: { name: { contains: "Bach khoa", mode: "insensitive" } } } },
      ],
    },
  });

  let imported = 0;
  let skipped = 0;

  for (const spot of HUST_SPOTS) {
    const existing = await prisma.foodSpot.findFirst({
      where: { clusterId: cluster.id, name: spot.name },
    });
    if (existing) {
      if (spot.priceVnd && !existing.avgPriceVnd) {
        await prisma.foodSpot.update({
          where: { id: existing.id },
          data: { avgPriceVnd: spot.priceVnd },
        });
        console.log(`  ~ priced: ${spot.name}`);
      }
      skipped++;
      continue;
    }

    // Prefer matching an existing OSM pin near Bách Khoa by name fragment
    const needle = normalizeName(spot.name).split(" ").filter((w) => w.length > 3).slice(0, 3).join(" ");
    const osmHit = needle
      ? await prisma.foodSpot.findFirst({
          where: {
            clusterId: cluster.id,
            source: "openstreetmap",
            lat: { gte: 21.0, lte: 21.06 },
            lng: { gte: 105.83, lte: 105.87 },
            name: { contains: spot.name.split(/[–(]/)[0]!.trim().slice(0, 12), mode: "insensitive" },
          },
        })
      : null;

    let coords: { lat: number; lng: number } | null = null;
    if (osmHit?.lat != null && osmHit.lng != null) {
      coords = { lat: osmHit.lat, lng: osmHit.lng };
      console.log(`  ~ matched OSM: ${spot.name}`);
    } else {
      coords = await geocode(spot.address);
      await sleep(1100);
    }
    if (!coords) {
      console.warn(`  skip (no geocode): ${spot.name}`);
      skipped++;
      continue;
    }

    const id = uuidv7();
    await prisma.foodSpot.create({
      data: {
        id,
        clusterId: cluster.id,
        name: spot.name,
        address: spot.address,
        lat: coords.lat,
        lng: coords.lng,
        avgPriceVnd: spot.priceVnd,
        tags: spot.tags,
        note: `${spot.note} · ${SOURCE_URL}`,
        source: SOURCE,
        sourceRef: SOURCE_URL,
        verified: true,
        order: 100 + imported,
      },
    });

    if (bachKhoa?.lat != null && bachKhoa.lng != null) {
      const d = distanceMeters(coords.lat, coords.lng, bachKhoa.lat, bachKhoa.lng);
      if (d <= 800) {
        await prisma.foodSpotSchool.create({
          data: {
            spotId: id,
            schoolId: bachKhoa.id,
            isPrimary: true,
            distanceMeters: Math.round(d),
            walkMinutes: walkMinutes(d),
            note: "Gần ĐHBK — nguồn Thư viện HUST",
          },
        });
      }
    }
    imported++;
    console.log(`  + ${spot.name}`);
  }

  console.log(`HUST listings: ${imported} imported, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
