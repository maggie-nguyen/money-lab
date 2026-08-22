#!/usr/bin/env tsx
/**
 * Import publicly listed student-budget food spots in Saigon.
 * Sources: university canteens, Su Van Hanh / Ho Thi Ky food areas (published prices).
 * Geocodes via Nominatim; links to nearest matching school in saigon cluster.
 */
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import { distanceMeters, sleep, walkMinutes } from "./geo";
import { geocodeAddress, normalizeName } from "./shared-hcmc";

const SOURCE = "manual" as const;

type Spot = {
  name: string;
  address: string;
  priceVnd: bigint;
  tags: string[];
  note: string;
  sourceUrl: string;
};

/** Parsed from public listings (each spot has an explicit cited price). */
const SAIGON_SPOTS: Spot[] = [
  // ── University canteens (published meal prices) ─────────────────────────
  {
    name: "Bếp ăn chia sẻ sinh viên KTX khu B",
    address: "Tầng trệt nhà C5, KTX khu B, Khu đô thị ĐHQG TP.HCM, Linh Trung, Thủ Đức",
    priceVnd: 25000n,
    tags: ["canteen", "rice", "under-35k"],
    note: "25k/suất · Nguồn: Thanh Niên",
    sourceUrl: "https://thanhnien.vn/lan-dau-tien-co-bep-an-chia-se-gia-re-cho-sinh-vien-o-ky-tuc-xa-185250628192203545.htm",
  },
  {
    name: "Căng tin ĐH Khoa học Tự nhiên – cơm suất",
    address: "227 Nguyễn Văn Cừ, Phường Chợ Quán, Quận 5, TP.HCM",
    priceVnd: 20000n,
    tags: ["canteen", "rice", "under-35k"],
    note: "20k/suất cơm · Nguồn: Foody",
    sourceUrl: "https://www.foody.vn/ho-chi-minh/can-tin-dai-hoc-khoa-hoc-tu-nhien",
  },
  {
    name: "Căng tin ĐH Khoa học Tự nhiên – cơm phần",
    address: "227 Nguyễn Văn Cừ, Phường Chợ Quán, Quận 5, TP.HCM",
    priceVnd: 36000n,
    tags: ["canteen", "rice", "under-50k"],
    note: "36k/cơm phần (2 người) · Nguồn: Foody",
    sourceUrl: "https://www.foody.vn/ho-chi-minh/can-tin-dai-hoc-khoa-hoc-tu-nhien",
  },
  {
    name: "Canteen B4 – ĐH Bách Khoa TP.HCM",
    address: "Tòa B4, 268 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM",
    priceVnd: 30000n,
    tags: ["canteen", "rice", "under-35k"],
    note: "~30k/suất canteen trường · Nguồn: Youke (268 Lý Thường Kiệt)",
    sourceUrl: "https://youke.vn/google-maps/268-ly-thuong-kiet-truong-dh-bach-khoa-tp-hcm/",
  },
  {
    name: "Canteen C6 – ĐH Bách Khoa TP.HCM",
    address: "Tòa C6, 268 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM",
    priceVnd: 30000n,
    tags: ["canteen", "rice", "under-35k"],
    note: "25–40k bữa canteen khu Bách Khoa · Nguồn: Youke",
    sourceUrl: "https://youke.vn/google-maps/268-ly-thuong-kiet-truong-dh-bach-khoa-tp-hcm/",
  },
  // ── Sư Vạn Hạnh (near Q10 universities) ───────────────────────────────────
  {
    name: "Phúc Béo – Bún cá Nha Trang",
    address: "772C Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM",
    priceVnd: 35000n,
    tags: ["noodles", "under-35k"],
    note: "20–60k · Nguồn: Foody",
    sourceUrl: "https://www.foody.vn/ho-chi-minh/phuc-beo-bun-ca-nha-trang",
  },
  {
    name: "Hanuri – Kimbap",
    address: "736 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM",
    priceVnd: 35000n,
    tags: ["rice", "under-35k"],
    note: "Kimbap ~35k · Nguồn: 4sv.vn",
    sourceUrl: "https://4sv.vn/tim-duong-di/nha-hang-han-quoc-hanuri-su-van-hanh-quan-10/",
  },
  {
    name: "Hanuri – Tokbokki phô mai",
    address: "736 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM",
    priceVnd: 55000n,
    tags: ["snacks", "under-50k"],
    note: "55k · Nguồn: WebReview",
    sourceUrl: "https://webreview.vn/hanuri-quan-an-han-quoc-su-van-hanh.html",
  },
  {
    name: "Lotteria – Vạn Hạnh Mall",
    address: "Tầng B1, 11 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM",
    priceVnd: 38000n,
    tags: ["snacks", "under-50k"],
    note: "Burger tôm + Pepsi (M) 38k · Nguồn: WebReview",
    sourceUrl: "https://webreview.vn/lotteria-van-hanh-mall.html",
  },
  {
    name: "Mr. Hero – Corndog",
    address: "489 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM",
    priceVnd: 39000n,
    tags: ["snacks", "under-50k"],
    note: "Corndog từ 39k · Nguồn: Foody",
    sourceUrl: "https://www.foody.vn/ho-chi-minh/mr-hero-corndog-cheese-ball",
  },
  {
    name: "Food court Vạn Hạnh Mall – món Việt",
    address: "Tầng B1, 11 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM",
    priceVnd: 50000n,
    tags: ["rice", "noodles", "under-50k"],
    note: "Food court ~50–150k/người · Nguồn: Crescent Mall",
    sourceUrl: "https://crescent.com.vn/cam-nang-crescent/van-hanh-mall-co-gi-an.html",
  },
  // ── Hồ Thị Kỷ food street (Q10, near Hoa Sen Thanh Thai) ─────────────────
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – món chiên/nướng",
    address: "Hẻm 52 Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 14000n,
    tags: ["snacks", "under-25k"],
    note: "8–20k/món · Nguồn: VnExpress",
    sourceUrl: "https://vnexpress.net/du-mon-ngon-tren-pho-am-thuc-ho-thi-ky-4497599.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – ốc hấp sả",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 35000n,
    tags: ["snacks", "under-35k"],
    note: "35k/đĩa · Nguồn: VnExpress",
    sourceUrl: "https://vnexpress.net/du-mon-ngon-tren-pho-am-thuc-ho-thi-ky-4497599.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – ốc nhồi thịt",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 7000n,
    tags: ["snacks", "under-25k"],
    note: "7k/con · Nguồn: VnExpress",
    sourceUrl: "https://vnexpress.net/du-mon-ngon-tren-pho-am-thuc-ho-thi-ky-4497599.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – chè/giải khát",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 15000n,
    tags: ["dessert", "under-25k"],
    note: "15k/ly · Nguồn: VnExpress",
    sourceUrl: "https://vnexpress.net/du-mon-ngon-tren-pho-am-thuc-ho-thi-ky-4497599.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – nước ép chanh dây",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 27500n,
    tags: ["under-35k"],
    note: "25–30k/chai · Nguồn: VnExpress",
    sourceUrl: "https://vnexpress.net/du-mon-ngon-tren-pho-am-thuc-ho-thi-ky-4497599.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – chân gà ngâm sả tắc",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 50000n,
    tags: ["snacks", "under-50k"],
    note: "50k/đĩa · Nguồn: VnExpress",
    sourceUrl: "https://vnexpress.net/du-mon-ngon-tren-pho-am-thuc-ho-thi-ky-4497599.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – thịt xiên Hàn",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 18000n,
    tags: ["snacks", "under-25k"],
    note: "18k/xiên · Nguồn: VietnamNet",
    sourceUrl: "https://vietnamnet.vn/cam-100-000-dong-thuong-thuc-am-thuc-khap-the-gioi-o-khu-pho-tai-tp-hcm-2148676.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – chân gà sốt Thái",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 35000n,
    tags: ["snacks", "under-35k"],
    note: "35k/phần · Nguồn: VietnamNet",
    sourceUrl: "https://vietnamnet.vn/cam-100-000-dong-thuong-thuc-am-thuc-khap-the-gioi-o-khu-pho-tai-tp-hcm-2148676.html",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – món chiên nướng",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 20000n,
    tags: ["snacks", "under-35k"],
    note: "10–30k/món · Nguồn: VietnamNet",
    sourceUrl: "https://vietnamnet.vn/cam-100-000-dong-thuong-thuc-am-thuc-khap-the-gioi-o-khu-pho-tai-tp-hcm-2148676.html",
  },
  {
    name: "Súp cua ốc heo – Hồ Thị Kỷ",
    address: "57 Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 30000n,
    tags: ["noodles", "under-35k"],
    note: "30k/tô · Nguồn: Candoi",
    sourceUrl: "https://candoi.info/top-7-mon-an-ngon-nhat-khu-am-thuc-cho-ho-thi-ky-tp-ho-chi-minh/",
  },
  {
    name: "Chè Campuchia – Hồ Thị Kỷ",
    address: "57/21A Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 20000n,
    tags: ["dessert", "under-25k"],
    note: "10–30k · Nguồn: Candoi",
    sourceUrl: "https://candoi.info/top-7-mon-an-ngon-nhat-khu-am-thuc-cho-ho-thi-ky-tp-ho-chi-minh/",
  },
  {
    name: "Hột vịt lộn – Hồ Thị Kỷ",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 20000n,
    tags: ["snacks", "under-25k"],
    note: "10 quả 20k · Nguồn: Candoi",
    sourceUrl: "https://candoi.info/top-7-mon-an-ngon-nhat-khu-am-thuc-cho-ho-thi-ky-tp-ho-chi-minh/",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – bún/hủ tiếu",
    address: "Hẻm 52 Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 25000n,
    tags: ["noodles", "under-35k"],
    note: "Tô từ 25k · Nguồn: Vinpearl",
    sourceUrl: "https://vinpearl.com/en/ho-thi-ky-food-street-saigon",
  },
  {
    name: "Phố ẩm thực Hồ Thị Kỷ – bánh tráng trộn",
    address: "Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 20000n,
    tags: ["snacks", "under-35k"],
    note: "10–30k · Nguồn: Vinpearl",
    sourceUrl: "https://vinpearl.com/en/ho-thi-ky-food-street-saigon",
  },
  {
    name: "Nem nướng – Hồ Thị Kỷ",
    address: "107 Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 35000n,
    tags: ["snacks", "under-35k"],
    note: "35k/10 xiên · Nguồn: Mia.vn",
    sourceUrl: "https://mia.vn/cam-nang-du-lich/cho-am-thuc-ho-thi-ky-12237",
  },
  {
    name: "Bún Campuchia – Hồ Thị Kỷ",
    address: "57/27 Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 40000n,
    tags: ["noodles", "under-50k"],
    note: "40–60k/phần · Nguồn: Mia.vn",
    sourceUrl: "https://mia.vn/cam-nang-du-lich/cho-am-thuc-ho-thi-ky-12237",
  },
  {
    name: "Chén trứng nướng – Hồ Thị Kỷ",
    address: "87/23 Hồ Thị Kỷ, Phường 1, Quận 10, TP.HCM",
    priceVnd: 18000n,
    tags: ["snacks", "under-25k"],
    note: "16–20k/phần · Nguồn: Mia.vn",
    sourceUrl: "https://mia.vn/cam-nang-du-lich/cho-am-thuc-ho-thi-ky-12237",
  },
  {
    name: "Gỏi cuốn – Hồ Thị Kỷ",
    address: "78/10 Hồ Thị Kỷ, Phường 4, Quận 10, TP.HCM",
    priceVnd: 12500n,
    tags: ["snacks", "under-25k"],
    note: "10–15k/phần · Nguồn: Mia.vn",
    sourceUrl: "https://mia.vn/cam-nang-du-lich/cho-am-thuc-ho-thi-ky-12237",
  },
  // ── RMIT Saigon South ─────────────────────────────────────────────────────
  {
    name: "Street food near RMIT Saigon South",
    address: "702 Nguyễn Văn Linh, Phường Tân Hưng, Quận 7, TP.HCM",
    priceVnd: 50000n,
    tags: ["under-50k"],
    note: "Street food ~$2 USD · Nguồn: RMIT Living in Vietnam",
    sourceUrl: "https://www.rmit.edu.vn/study-at-rmit/international-students/living-in-vietnam",
  },
];

const SCHOOL_MATCHERS: { label: string; patterns: string[] }[] = [
  { label: "ĐH Bách Khoa", patterns: ["bach khoa", "bách khoa", "hcmut"] },
  { label: "UEH", patterns: ["kinh te", "kinh tế", "ueh", "economics"] },
  { label: "HCMUS", patterns: ["khoa hoc tu nhien", "khoa học tự nhiên", "hcmus"] },
  { label: "RMIT", patterns: ["rmit"] },
  { label: "Hoa Sen", patterns: ["hoa sen"] },
];

const LINK_RADIUS_M = 800;

function schoolMatches(name: string, patterns: string[]): boolean {
  const n = normalizeName(name);
  return patterns.some((p) => n.includes(normalizeName(p)));
}

async function loadTargetSchools(clusterId: string) {
  const all = await prisma.school.findMany({
    where: { clusterId, lat: { not: null }, lng: { not: null } },
    include: { translations: { select: { name: true } } },
  });
  const hits: { id: string; lat: number; lng: number; label: string }[] = [];
  for (const matcher of SCHOOL_MATCHERS) {
    const hit = all.find((s) => {
      const names = s.translations.map((t) => t.name);
      return names.some((nm) => schoolMatches(nm, matcher.patterns));
    });
    if (hit?.lat != null && hit.lng != null) {
      hits.push({ id: hit.id, lat: hit.lat, lng: hit.lng, label: matcher.label });
    }
  }
  return hits;
}

function nearestSchool(
  lat: number,
  lng: number,
  schools: { id: string; lat: number; lng: number; label: string }[],
): { id: string; label: string; d: number } | null {
  let best: { id: string; label: string; d: number } | null = null;
  for (const s of schools) {
    const d = distanceMeters(lat, lng, s.lat, s.lng);
    if (d <= LINK_RADIUS_M && (!best || d < best.d)) {
      best = { id: s.id, label: s.label, d };
    }
  }
  return best;
}

async function main(): Promise<void> {
  const cluster = await prisma.foodCluster.findUnique({ where: { slug: "saigon" } });
  if (!cluster) throw new Error("saigon cluster missing — run pnpm db:seed or map:import first");

  const schools = await loadTargetSchools(cluster.id);
  if (!schools.length) console.warn("  (no target schools with coords — links will be skipped)");

  let imported = 0;
  let skipped = 0;

  for (const spot of SAIGON_SPOTS) {
    const existing = await prisma.foodSpot.findFirst({
      where: { clusterId: cluster.id, name: spot.name },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const needle = normalizeName(spot.name).split(" ").filter((w) => w.length > 3).slice(0, 3).join(" ");
    const osmHit = needle
      ? await prisma.foodSpot.findFirst({
          where: {
            clusterId: cluster.id,
            source: "openstreetmap",
            lat: { gte: 10.68, lte: 10.92 },
            lng: { gte: 106.55, lte: 106.85 },
            name: { contains: spot.name.split(/[–(]/)[0]!.trim().slice(0, 12), mode: "insensitive" },
          },
        })
      : null;

    let coords: { lat: number; lng: number } | null = null;
    if (osmHit?.lat != null && osmHit.lng != null) {
      coords = { lat: osmHit.lat, lng: osmHit.lng };
      console.log(`  ~ matched OSM: ${spot.name}`);
    } else {
      coords = await geocodeAddress(spot.address, spot.name);
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
        note: `${spot.note} · ${spot.sourceUrl}`,
        source: SOURCE,
        sourceRef: spot.sourceUrl,
        verified: true,
        order: 100 + imported,
      },
    });

    const school = nearestSchool(coords.lat, coords.lng, schools);
    if (school) {
      await prisma.foodSpotSchool.create({
        data: {
          spotId: id,
          schoolId: school.id,
          isPrimary: true,
          distanceMeters: Math.round(school.d),
          walkMinutes: walkMinutes(school.d),
          note: `Gần ${school.label} — nguồn công khai`,
        },
      });
    }

    imported++;
    console.log(`  + ${spot.name}`);
  }

  console.log(`Saigon listings: ${imported} imported, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
