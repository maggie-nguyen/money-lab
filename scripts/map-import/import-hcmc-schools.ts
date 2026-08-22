#!/usr/bin/env tsx
/**
 * Enrich HCMC schools from public listings when available.
 * Matches official names to existing OSM schools by normalized name; creates address-only rows when no match.
 *
 * Dataset mirrors (no login): try data.gov.vn search exports saved locally.
 * Place CSV at prisma/data/hcmc-thpt.csv with columns: TenDonVi, DiaChi, QuanHuyen (optional)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import { sleep, slugify } from "./geo";

const CSV_PATH = path.join(process.cwd(), "prisma/data/hcmc-thpt.csv");
const DIRECTORY_URL = "https://thptannhontay.hcm.edu.vn/DSDonVi?codekhoi=thpt";

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

type HcmcRow = { name: string; address: string; district: string; sourceRef: string };

function parseCsv(text: string): HcmcRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const nameIdx = header.findIndex((h) => /ten|name|donvi/i.test(h));
  const addrIdx = header.findIndex((h) => /dia|address|diachi/i.test(h));
  const distIdx = header.findIndex((h) => /quan|district|huyen/i.test(h));
  if (nameIdx < 0) return [];

  const rows: HcmcRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const name = cols[nameIdx] ?? "";
    if (!name) continue;
    rows.push({
      name,
      address: addrIdx >= 0 ? (cols[addrIdx] ?? "") : "",
      district: distIdx >= 0 ? (cols[distIdx] ?? "") : "",
      sourceRef: "https://opendata.hochiminhcity.gov.vn/dataset/du-lieu-ve-danh-sach-cac-co-so-giao-duc-tren-dia-ban-thanh-pho",
    });
  }
  return rows;
}

function decodeHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fallback for the open-data portal's WAF: the HCMC education network mirrors
 * the THPT directory on hcm.edu.vn with three public HTML pages. This gives us
 * authoritative names and school-domain provenance; addresses remain blank
 * unless supplied by the CSV, so no coordinates are invented.
 */
async function fetchOfficialDirectory(): Promise<HcmcRow[]> {
  const rows: HcmcRow[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = page === 1 ? DIRECTORY_URL : `${DIRECTORY_URL}&trang=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "MoneyLab-FoodMap/1.0" } });
    if (!res.ok) throw new Error(`HCMC directory request failed: ${res.status} ${url}`);
    const html = await res.text();
    const table = html.match(/<table[^>]*GridViewStyle2[\s\S]*?<\/table>/i)?.[0] ?? "";
    const rowMatches = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    for (const rowHtml of rowMatches) {
      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decodeHtml(m[1] ?? ""));
      const name = cells[1] ?? "";
      const website = rowHtml.match(/href=['"](https?:\/\/[^'"]+\.hcm\.edu\.vn)['"]/i)?.[1] ?? "";
      if (!/^\d+$/.test(cells[0] ?? "") || !name || !website) continue;
      rows.push({ name, address: "", district: "", sourceRef: website });
    }
  }
  const unique = new Map<string, HcmcRow>();
  for (const row of rows) unique.set(normalizeName(row.name), row);
  return [...unique.values()];
}

async function fetchSchoolAddress(sourceRef: string): Promise<string> {
  const urls = [sourceRef];
  try {
    const base = new URL(sourceRef);
    urls.push(new URL("/lienhe", base).href);
  } catch {
    // Keep the original URL only.
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "MoneyLab-FoodMap/1.0" } });
      if (!res.ok) continue;
      const html = await res.text();
      const match = html.match(/"address"\s*:\s*"((?:\\.|[^"\\])*)"/i);
      if (!match?.[1]) continue;
      const address = JSON.parse(`"${match[1]}"`).replace(/\s+/g, " ").trim();
      if (address) return address;
    } catch {
      // Try the next page variant.
    }
  }
  return "";
}

/** Split multi-campus addresses and strip editorial prefixes before geocoding. */
function pickGeocodeQueries(address: string, schoolName: string): string[] {
  const toAscii = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/g, "d")
      .replace(/^So\s+/i, "")
      .replace(/^Số\s+/i, "")
      .trim();

  const segments: string[] = [];
  const parts = address.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
  for (const part of (parts.length ? parts : [address]).filter(Boolean)) {
    const cleaned = part
      .replace(/^Cơ sở \d+:\s*/i, "")
      .replace(/^Cấp [^:]+:\s*/i, "")
      .replace(/Đang cập nhật\s*-?\s*/i, "")
      .trim();
    if (cleaned.length > 8) segments.push(cleaned);
  }
  const queries: string[] = [];
  for (const segment of segments) {
    queries.push(`${segment}, Ho Chi Minh City, Vietnam`);
    queries.push(`${segment}, TP.HCM, Vietnam`);
    const ascii = toAscii(segment);
    if (ascii !== segment) {
      queries.push(`${ascii}, Ho Chi Minh City, Vietnam`);
      queries.push(`${ascii}, TP.HCM, Vietnam`);
    }
    const streetMatch = ascii.match(/^(\d+\/?\d*)\s+(.+)/);
    if (streetMatch?.[1] && streetMatch[2]) {
      queries.push(`${streetMatch[1]} ${streetMatch[2].split(",")[0]}, Ho Chi Minh City, Vietnam`);
    }
  }
  if (schoolName.trim()) queries.push(`${schoolName}, Ho Chi Minh City, Vietnam`);
  return [...new Set(queries.filter((query) => query.replace(/,\s*/g, "").trim().length > 12))];
}

async function geocode(address: string, schoolName = ""): Promise<{ lat: number; lng: number } | null> {
  const queries = pickGeocodeQueries(address, schoolName);
  for (const query of queries) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "vn");
      const res = await fetch(url, {
        headers: { "User-Agent": "MoneyLab-FoodMap/1.0 (HCMC school enrichment)" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { lat: string; lon: string }[];
      if (data[0]) return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
    } catch {
      // Try the next query variant.
    }
    if (query !== queries.at(-1)) await sleep(1100);
  }
  return null;
}

type OsmSchool = Awaited<ReturnType<typeof prisma.school.findMany>>[number] & {
  translations: { name: string }[];
};

/** Reuse coordinates from an existing OSM school when names overlap strongly. */
function findOsmSchoolCoords(
  schoolName: string,
  osmSchools: OsmSchool[],
): { lat: number; lng: number } | null {
  const norm = normalizeName(schoolName);
  if (!norm) return null;
  let best: { lat: number; lng: number; score: number } | null = null;
  for (const school of osmSchools) {
    if (school.source !== "openstreetmap" || school.lat == null || school.lng == null) continue;
    const osmName = normalizeName(school.translations[0]?.name ?? "");
    if (!osmName) continue;
    const thptHint = /thpt|thcs|pho thong|trung hoc/i.test(`${norm} ${osmName}`);
    const overlap =
      osmName.includes(norm.slice(0, 12)) ||
      norm.includes(osmName.slice(0, 12)) ||
      norm.split(" ").slice(-2).join(" ") === osmName.split(" ").slice(-2).join(" ");
    if (!overlap) continue;
    const score = thptHint ? 2 : 1;
    if (!best || score > best.score) best = { lat: school.lat, lng: school.lng, score };
  }
  return best ? { lat: best.lat, lng: best.lng } : null;
}

async function main(): Promise<void> {
  let rows: HcmcRow[];
  try {
    rows = parseCsv(await readFile(CSV_PATH, "utf8"));
    console.log(`HCMC CSV: ${rows.length} rows`);
  } catch {
    console.log(`No usable CSV at ${CSV_PATH}; using public HCMC education directory`);
    rows = await fetchOfficialDirectory();
    console.log(`HCMC education directory: ${rows.length} rows`);
  }

  const cluster = await prisma.foodCluster.findUnique({ where: { slug: "saigon" } });
  if (!cluster) {
    console.error("Run pnpm db:seed or map:import first to create saigon cluster.");
    process.exit(1);
  }

  const osmSchools = await prisma.school.findMany({
    where: { clusterId: cluster.id },
    include: { translations: true },
  });
  const byNorm = new Map<string, (typeof osmSchools)[0]>();
  for (const s of osmSchools) {
    const n = normalizeName(s.translations[0]?.name ?? "");
    if (n) byNorm.set(n, s);
  }

  let matched = 0;
  let enriched = 0;
  let created = 0;
  let geocoded = 0;
  let geoAttempts = 0;
  for (const row of rows) {
    const norm = normalizeName(row.name);
    const hit = byNorm.get(norm);
    if (hit) {
      let address = row.address;
      let lat: number | undefined;
      let lng: number | undefined;
      if (hit.source === "hcmc_opendata" && row.sourceRef.includes("hcm.edu.vn")) {
        if (!address && !hit.address) address = await fetchSchoolAddress(row.sourceRef);
        if ((!hit.lat || !hit.lng) && address && geoAttempts < 80) {
          const coords = await geocode(address, row.name);
          geoAttempts++;
          await sleep(1100);
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
            geocoded++;
          }
        }
        if (address || lat !== undefined) enriched++;
      }
      await prisma.school.update({
        where: { id: hit.id },
        data: {
          address: address || hit.address,
          district: row.district || hit.district,
          externalRef: hit.externalRef || row.sourceRef,
          source: hit.source === "openstreetmap" ? "openstreetmap" : "hcmc_opendata",
          ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
        },
      });
      matched++;
      continue;
    }

    const fuzzy = osmSchools.find((s) => {
      const osmName = normalizeName(s.translations[0]?.name ?? "");
      return osmName.includes(norm.slice(0, 12)) || norm.includes(osmName.slice(0, 12));
    });
    if (fuzzy) {
      await prisma.school.update({
        where: { id: fuzzy.id },
        data: {
          address: row.address || fuzzy.address,
          district: row.district || fuzzy.district,
        },
      });
      matched++;
      continue;
    }

    const slug = `hcmc-${slugify(row.name)}`;
    const existing = await prisma.school.findUnique({ where: { slug } });
    if (existing) {
      if (existing.source === "hcmc_opendata" && !existing.address && row.sourceRef.includes("hcm.edu.vn")) {
        const address = await fetchSchoolAddress(row.sourceRef);
        let coords: { lat: number; lng: number } | null = null;
        if (address && geoAttempts < 80) {
          coords = await geocode(address);
          geoAttempts++;
          await sleep(1100);
          if (coords) geocoded++;
        }
        if (address || coords) {
          await prisma.school.update({
            where: { id: existing.id },
            data: { address, ...(coords ? { lat: coords.lat, lng: coords.lng } : {}) },
          });
          enriched++;
        }
      }
      continue;
    }

    let address = row.address;
    let lat: number | null = null;
    let lng: number | null = null;
    if (!address && row.sourceRef.includes("hcm.edu.vn")) {
      address = await fetchSchoolAddress(row.sourceRef);
      if (address && geoAttempts < 80) {
        const coords = await geocode(address);
        geoAttempts++;
        await sleep(1100);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
          geocoded++;
        }
      }
    }

    await prisma.school.create({
      data: {
        id: uuidv7(),
        slug,
        clusterId: cluster.id,
        kind: "HIGH_SCHOOL",
        lat,
        lng,
        address,
        district: row.district,
        source: "hcmc_opendata",
        externalRef: row.sourceRef,
        order: 9000 + created,
        translations: {
          create: [{ locale: "vi", name: row.name, shortName: row.name.slice(0, 40) }],
        },
      },
    });
    created++;
  }

  // Repair records created by an earlier run even when a duplicate OSM name
  // wins the normalized-name map above.
  const pending = await prisma.school.findMany({
    where: { clusterId: cluster.id, source: "hcmc_opendata", lat: null },
    include: { translations: true },
  });
  for (const school of pending) {
    if (!school.externalRef.includes("hcm.edu.vn")) continue;
    const name = school.translations[0]?.name ?? school.slug;
    const address = school.address || (await fetchSchoolAddress(school.externalRef));
    let coords: { lat: number; lng: number } | null = null;
    if (address && geoAttempts < 80) {
      coords = await geocode(address, name);
      geoAttempts++;
      await sleep(1100);
    }
    if (!coords) coords = findOsmSchoolCoords(name, osmSchools);
    await prisma.school.update({
      where: { id: school.id },
      data: { address, ...(coords ? { lat: coords.lat, lng: coords.lng } : {}) },
    });
    if (address || coords) enriched++;
    if (coords) geocoded++;
  }

  console.log(`Matched ${matched} to OSM, enriched ${enriched}, created ${created}; geocoded ${geocoded}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
