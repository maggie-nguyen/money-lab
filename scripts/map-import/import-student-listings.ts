#!/usr/bin/env tsx
/**
 * Import publicly listed cheap-eat spots near student areas (read on user's behalf).
 * Sources: Vietnamese food guides/listicles with stated prices (see note per spot).
 * Geocodes via Nominatim; run `pnpm map:import:link` afterwards to rebuild links.
 */
import { prisma } from "../../src/server/db";
import { uuidv7 } from "../../src/server/lib/ids";
import { CITY_BBOX, sleep } from "./geo";

type Listing = {
  cluster: "hanoi" | "saigon";
  name: string;
  address: string;
  priceVnd: bigint;
  tags: string[];
  note: string;
  sourceUrl: string;
};

const LISTINGS: Listing[] = [
  // ── Hà Nội — ngõ 130 Xuân Thủy / Cầu Giấy ──────────────────────────────
  { cluster: "hanoi", name: "Nem nướng Gia Huy", address: "20H1 ngõ 130 Xuân Thủy, Cầu Giấy", priceVnd: 30000n, tags: ["snacks"], note: "Nem nướng Nha Trang 30k/suất · Nguồn: tapchiamthuc.net", sourceUrl: "https://tapchiamthuc.net/thien-duong-am-thuc-sinh-vien-ngo-130-xuan-thuy/" },
  { cluster: "hanoi", name: "Gà không lối thoát mini", address: "ngõ 130 Xuân Thủy, Cầu Giấy", priceVnd: 5000n, tags: ["snacks"], note: "Xôi gà chiên 5k/cái · Nguồn: tapchiamthuc.net", sourceUrl: "https://tapchiamthuc.net/thien-duong-am-thuc-sinh-vien-ngo-130-xuan-thuy/" },
  { cluster: "hanoi", name: "Tào phớ thập cẩm ngõ 130", address: "13H1 ngõ 130 Xuân Thủy, Cầu Giấy", priceVnd: 5000n, tags: ["desserts"], note: "Tào phớ thập cẩm 5k · Nguồn: tapchiamthuc.net", sourceUrl: "https://tapchiamthuc.net/thien-duong-am-thuc-sinh-vien-ngo-130-xuan-thuy/" },
  { cluster: "hanoi", name: "Kem chanh 27 ngõ 130", address: "27 ngõ 130 Xuân Thủy, Cầu Giấy", priceVnd: 3000n, tags: ["desserts"], note: "Kem chanh 3–5k · Nguồn: tapchiamthuc.net", sourceUrl: "https://tapchiamthuc.net/thien-duong-am-thuc-sinh-vien-ngo-130-xuan-thuy/" },
  { cluster: "hanoi", name: "Bánh gạo cay & Kimbap Xuân Thủy", address: "22H1 ngõ 130 Xuân Thủy, Cầu Giấy", priceVnd: 20000n, tags: ["snacks"], note: "Tokbokki/kimbap 20–30k · Nguồn: tapchiamthuc.net", sourceUrl: "https://tapchiamthuc.net/thien-duong-am-thuc-sinh-vien-ngo-130-xuan-thuy/" },
  { cluster: "hanoi", name: "Bánh tráng trộn ngõ 130", address: "ngõ 130 Xuân Thủy, Cầu Giấy", priceVnd: 15000n, tags: ["snacks"], note: "Bánh tráng trộn/nướng 15–20k · Nguồn: tapchiamthuc.net", sourceUrl: "https://tapchiamthuc.net/thien-duong-am-thuc-sinh-vien-ngo-130-xuan-thuy/" },
  // ── Hà Nội — Nghĩa Tân / Duy Tân ───────────────────────────────────────
  { cluster: "hanoi", name: "Cột Điện Quán", address: "105C3 phố Nghĩa Tân, Cầu Giấy", priceVnd: 26000n, tags: ["banh-mi"], note: "Bánh mì chảo 26–36k · Nguồn: dulichlive.com", sourceUrl: "https://dulichlive.com/ha-noi/tong-hop-11-quan-an-ngon-o-cau-giay-gia-re-dong-khach.html" },
  { cluster: "hanoi", name: "Thịt xiên nướng Nghĩa Tân", address: "đối diện 108 C2 Nghĩa Tân, Cầu Giấy", priceVnd: 7000n, tags: ["snacks"], note: "Xiên thịt 7k, sụn 13k · Nguồn: vinwonders.com", sourceUrl: "https://vinwonders.com/vi/wonderpedia/news/thit-xien-nuong-ha-noi" },
  { cluster: "hanoi", name: "Bún đậu 104C3 Nghĩa Tân", address: "104C3 Nghĩa Tân, Cầu Giấy", priceVnd: 15000n, tags: ["noodles"], note: "Bún đậu mắm tôm 15–40k · Nguồn: dulich9.com", sourceUrl: "https://dulich9.com/10-quan-an-ngon-gia-re-o-quan-cau-giay-nuom-nuop-khach-ra-vao.html" },
  { cluster: "hanoi", name: "Phở cuốn Hương Mai", address: "16 Duy Tân, Cầu Giấy", priceVnd: 30000n, tags: ["noodles"], note: "Phở cuốn/phở chiên 30–40k · Nguồn: dulich9.com", sourceUrl: "https://dulich9.com/10-quan-an-ngon-gia-re-o-quan-cau-giay-nuom-nuop-khach-ra-vao.html" },
  // ── Hà Nội — Chùa Láng / Đống Đa ───────────────────────────────────────
  { cluster: "hanoi", name: "Bánh tráng trộn Tina Trần", address: "3 A15 ngõ 33 Chùa Láng, Đống Đa", priceVnd: 20000n, tags: ["snacks"], note: "Bánh tráng trộn 20k · Nguồn: mytour.vn", sourceUrl: "https://mytour.vn/vi/blog/bai-viet/13-quan-an-vat-tuyet-voi-nhat-o-khu-vuc-chua-lang.html" },
  { cluster: "hanoi", name: "Nem Nướng Nha Trang Cô Lê", address: "12 ngõ 33 Chùa Láng, Đống Đa", priceVnd: 30000n, tags: ["snacks"], note: "Nem nướng 30–50k · Nguồn: ipos.vn", sourceUrl: "https://ipos.vn/quan-an-ngon-khu-chua-lang" },
  { cluster: "hanoi", name: "Tào phớ Ngõ Ngoại Giao", address: "ngõ 67 Chùa Láng, Đống Đa", priceVnd: 15000n, tags: ["desserts"], note: "Tào phớ đặc biệt 15k · Nguồn: mytour.vn", sourceUrl: "https://mytour.vn/vi/blog/bai-viet/13-quan-an-vat-tuyet-voi-nhat-o-khu-vuc-chua-lang.html" },
  { cluster: "hanoi", name: "Quán ăn vặt Mỏ Khoét", address: "3 ngõ 185 Chùa Láng, Đống Đa", priceVnd: 15000n, tags: ["snacks"], note: "Sữa chua lá nếp, bánh đúc… 15–30k · Nguồn: mytour.vn", sourceUrl: "https://mytour.vn/vi/blog/bai-viet/13-quan-an-vat-tuyet-voi-nhat-o-khu-vuc-chua-lang.html" },
  { cluster: "hanoi", name: "Bún đậu Mộc", address: "66 ngõ 185 Chùa Láng, Đống Đa", priceVnd: 30000n, tags: ["noodles"], note: "Bún đậu mẹt 30–40k · Nguồn: justfly.vn", sourceUrl: "https://justfly.vn/discovery/vietnam/hanoi/quan-bun-dau-quan-dong-da" },
  { cluster: "hanoi", name: "Bún đậu số 33 ngõ 185", address: "33 ngõ 185 Chùa Láng, Đống Đa", priceVnd: 25000n, tags: ["noodles"], note: "Bún đậu suất đủ 25–30k · Nguồn: justfly.vn", sourceUrl: "https://justfly.vn/discovery/vietnam/hanoi/quan-bun-dau-quan-dong-da" },
  { cluster: "hanoi", name: "Dơm – Vua Bánh Tráng", address: "34 ngõ 157B Chùa Láng, Đống Đa", priceVnd: 20000n, tags: ["snacks"], note: "Bánh tráng buffet/trộn 20k · Nguồn: ipos.vn", sourceUrl: "https://ipos.vn/quan-an-ngon-khu-chua-lang" },
  { cluster: "hanoi", name: "Ốc 94 Chùa Láng", address: "94 Chùa Láng, Đống Đa", priceVnd: 30000n, tags: ["seafood"], note: "Ốc từ 30k · Nguồn: ipos.vn", sourceUrl: "https://ipos.vn/quan-an-ngon-khu-chua-lang" },
  // ── Hà Nội — Giảng Võ / Trần Duy Hưng / Hoàng Quốc Việt / Mỹ Đình ──────
  { cluster: "hanoi", name: "Bún đậu vỉa hè Giảng Võ", address: "ngõ 140 Giảng Võ, Đống Đa", priceVnd: 25000n, tags: ["noodles"], note: "Bún đậu 15–25k/suất · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ha-noi/bun-dau-giang-vo" },
  { cluster: "hanoi", name: "Cơm niêu Hải Sư", address: "111 K1 Giảng Võ, Đống Đa", priceVnd: 30000n, tags: ["rice"], note: "Cơm niêu 30–55k · Nguồn: digiticket.vn", sourceUrl: "https://digiticket.vn/blog/quan-an-giang-vo/" },
  { cluster: "hanoi", name: "Bún Ốc Bún Chả Trần Duy Hưng", address: "14 ngõ 110 Trần Duy Hưng, Cầu Giấy", priceVnd: 30000n, tags: ["noodles"], note: "Bún ốc bò riêu cua 30k · Nguồn: toplist.vn", sourceUrl: "https://toplist.vn/top-list/quan-an-ngon-o-tran-duy-hung-ha-noi-17130.htm" },
  { cluster: "hanoi", name: "Giang Coi - Cơm Sinh Viên", address: "ngõ 234 Hoàng Quốc Việt, Cầu Giấy", priceVnd: 12000n, tags: ["rice", "under-25k"], note: "Cơm sinh viên 12–20k · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ha-noi/giang-coi-com-sinh-vien" },
  { cluster: "hanoi", name: "Cơm Thố Anh Nguyễn", address: "142 Hoàng Quốc Việt, Cầu Giấy", priceVnd: 35000n, tags: ["rice"], note: "Cơm thố từ 35k · Nguồn: greensm.com", sourceUrl: "https://www.greensm.com/vn-vi/news/quan-an-hoang-quoc-viet-cau-giay" },
  { cluster: "hanoi", name: "Quán Vặt Hoàng Quốc Việt", address: "A2-6 ngõ 126 Hoàng Quốc Việt, Cầu Giấy", priceVnd: 10000n, tags: ["snacks", "under-25k"], note: "Ăn vặt 10–39k · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ha-noi/quan-vat-hoang-quoc-viet" },
  { cluster: "hanoi", name: "Bánh mỳ Nghé", address: "25 Hồ Tùng Mậu, Cầu Giấy", priceVnd: 15000n, tags: ["banh-mi", "under-25k"], note: "Bánh mì pate 15–20k · Nguồn: toplist.vn", sourceUrl: "https://toplist.vn/top-list/quan-an-ngon-nhat-gan-truong-dai-hoc-thuong-mai-15486.htm" },
  { cluster: "hanoi", name: "Trà Chanh Bụi Phố Mỹ Đình", address: "23 Mỹ Đình, Nam Từ Liêm", priceVnd: 10000n, tags: ["drinks", "under-25k"], note: "Đồ uống/ăn vặt 10–28k · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ha-noi/khu-vuc-quan-nam-tu-liem/tren-duong-my-dinh" },
  { cluster: "hanoi", name: "Cơm Rang Gà Sốt 30K", address: "14 ngõ 20 Mỹ Đình, Nam Từ Liêm", priceVnd: 30000n, tags: ["rice"], note: "Cơm rang gà xé 30k · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ha-noi/khu-vuc-quan-nam-tu-liem/tren-duong-my-dinh" },
  // ── Sài Gòn — Lý Thường Kiệt / Thành Thái (gần ĐH Bách Khoa TP.HCM) ────
  { cluster: "saigon", name: "Bánh su kem 93 Lý Thường Kiệt", address: "93 Lý Thường Kiệt, P.7, Q.11", priceVnd: 4000n, tags: ["snacks", "under-25k"], note: "Bánh su kem 3–5k/cái · Nguồn: edu2review.com", sourceUrl: "https://edu2review.com/reviews/quan-an-vat-ngon-bo-re-dang-kinh-ngac-gan-dai-hoc-bach-khoa-sai-gon-8720.html" },
  { cluster: "saigon", name: "Bánh bèo Mì Quảng Sông Trà", address: "7/25 Thành Thái, P.12, Q.10", priceVnd: 3000n, tags: ["snacks", "under-25k"], note: "Bánh bèo 3k/chén · Nguồn: edu2review.com", sourceUrl: "https://edu2review.com/reviews/quan-an-vat-ngon-bo-re-dang-kinh-ngac-gan-dai-hoc-bach-khoa-sai-gon-8720.html" },
  { cluster: "saigon", name: "Trái cây tô Bubu", address: "góc Tô Hiến Thành – Thành Thái, Q.10", priceVnd: 25000n, tags: ["desserts", "under-25k"], note: "Trái cây tô + sữa chua 25k · Nguồn: edu2review.com", sourceUrl: "https://edu2review.com/reviews/quan-an-vat-ngon-bo-re-dang-kinh-ngac-gan-dai-hoc-bach-khoa-sai-gon-8720.html" },
  { cluster: "saigon", name: "Gỏi cuốn chua ngọt 163/3 Thành Thái", address: "163/3 Thành Thái, Q.10", priceVnd: 4000n, tags: ["snacks", "under-25k"], note: "Gỏi cuốn 4k/cuốn · Nguồn: edu2review.com", sourceUrl: "https://edu2review.com/reviews/quan-an-vat-ngon-bo-re-dang-kinh-ngac-gan-dai-hoc-bach-khoa-sai-gon-8720.html" },
  { cluster: "saigon", name: "Quán của Má", address: "28 Nguyễn Ngọc Lộc, P.14, Q.10", priceVnd: 15000n, tags: ["snacks", "under-25k"], note: "Nem nướng mẹt 10–22k · Nguồn: hcmtoplist.com", sourceUrl: "https://www.hcmtoplist.com/top-15-quan-an-ngon-re-cho-sinh-vien-o-sai-gon-phai-thu" },
  { cluster: "saigon", name: "Xôi hoa đậu biếc", address: "119 Vĩnh Viễn, P.4, Q.10", priceVnd: 24000n, tags: ["sticky-rice", "under-25k"], note: "Xôi 24–35k · Nguồn: hcmtoplist.com", sourceUrl: "https://www.hcmtoplist.com/top-15-quan-an-ngon-re-cho-sinh-vien-o-sai-gon-phai-thu" },
  { cluster: "saigon", name: "Cháo lòng hẻm 525 Huỳnh Văn Bánh", address: "hẻm 525 Huỳnh Văn Bánh, P.14, Phú Nhuận", priceVnd: 15000n, tags: ["noodles", "under-25k"], note: "Cháo lòng/bánh ướt 15–20k · Nguồn: hcmtoplist.com", sourceUrl: "https://www.hcmtoplist.com/top-15-quan-an-ngon-re-cho-sinh-vien-o-sai-gon-phai-thu" },
  { cluster: "saigon", name: "August Tea", address: "245/39 Nguyễn Trãi, P.Nguyễn Cư Trinh, Q.1", priceVnd: 23000n, tags: ["hotpot", "under-25k"], note: "Lẩu thái cá viên 23–50k · Nguồn: hcmtoplist.com", sourceUrl: "https://www.hcmtoplist.com/top-15-quan-an-ngon-re-cho-sinh-vien-o-sai-gon-phai-thu" },
  // ── Sài Gòn — Thủ Đức (KHTN / SPKT / Làng đại học) ─────────────────────
  { cluster: "saigon", name: "Bún Chả Hà Nội Kha Vạn Cân", address: "1136 Kha Vạn Cân, Thủ Đức", priceVnd: 35000n, tags: ["noodles"], note: "Bún chả thập cẩm 20–40k · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ho-chi-minh/bun-cha-ha-noi-kha-van-can" },
  { cluster: "saigon", name: "Đô Shin - Há Cảo Xíu Mại", address: "22 Lê Văn Ninh, P.Linh Tây, Thủ Đức", priceVnd: 4000n, tags: ["snacks", "under-25k"], note: "Há cảo/xíu mại từ 4k · Nguồn: kenhhomestay.com", sourceUrl: "https://kenhhomestay.com/quan-an-vat-thu-duc/" },
  { cluster: "saigon", name: "Cá viên Quán Góc", address: "281 Võ Văn Ngân, P.Linh Chiểu, Thủ Đức", priceVnd: 5000n, tags: ["snacks", "under-25k"], note: "Cá viên chiên 5–10k/món · Nguồn: kenhhomestay.com", sourceUrl: "https://kenhhomestay.com/quan-an-vat-thu-duc/" },
  { cluster: "saigon", name: "Quán Ốc Sinh Viên", address: "23 Công Lý, P.Bình Thọ, Thủ Đức", priceVnd: 25000n, tags: ["seafood", "under-25k"], note: "Ốc luộc từ 25k/tô · Nguồn: danangopentour.vn", sourceUrl: "http://danangopentour.vn/top-10-quan-oc-ngon-re-o-thu-duc.html" },
  { cluster: "saigon", name: "Ốc Bắc Em Châu", address: "74 Đường số 5, Linh Trung, Thủ Đức", priceVnd: 20000n, tags: ["seafood", "under-25k"], note: "Ốc/hải sản từ 20k · Nguồn: danangopentour.vn", sourceUrl: "http://danangopentour.vn/top-10-quan-oc-ngon-re-o-thu-duc.html" },
  { cluster: "saigon", name: "Quán Ốc 178", address: "73/3F Hoàng Diệu, Linh Trung, Thủ Đức", priceVnd: 30000n, tags: ["seafood"], note: "Ốc ~30k/món · Nguồn: danangopentour.vn", sourceUrl: "http://danangopentour.vn/top-10-quan-oc-ngon-re-o-thu-duc.html" },
  { cluster: "saigon", name: "Ẩm Thực Xiên Que 211", address: "211 Hoàng Diệu 2, P.Linh Trung, Thủ Đức", priceVnd: 12000n, tags: ["snacks", "under-25k"], note: "Xiên que nướng từ 12k/xiên · Nguồn: top10tphcm.com", sourceUrl: "https://top10tphcm.com/quan-nuong-o-thu-duc" },
  { cluster: "saigon", name: "Khu Ăn Vặt ĐH Nông Lâm", address: "KP.6, QL1A, P.Linh Trung, Thủ Đức", priceVnd: 15000n, tags: ["snacks", "under-25k"], note: "Chợ đêm làng đại học: hủ tiếu 15k, dừa tắc 10k · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ho-chi-minh/khu-an-vat-dai-hoc-nong-lam" },
  // ── Sài Gòn — Q.7 / Q.8 (Tôn Đức Thắng, Phạm Thế Hiển) ─────────────────
  { cluster: "saigon", name: "Quán Cơm Thu Ngân", address: "333 Nguyễn Hữu Thọ, Q.7", priceVnd: 25000n, tags: ["rice", "under-25k"], note: "Cơm suất 18–25k · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ho-chi-minh/quan-com-thu-ngan-nguyen-huu-tho" },
  { cluster: "saigon", name: "Món Ngon Quảng Ngãi 2", address: "2683A/9B Phạm Thế Hiển, P.7, Q.8", priceVnd: 45000n, tags: ["noodles"], note: "Mì Quảng sườn 45k/tô · Nguồn: foody.vn", sourceUrl: "https://www.foody.vn/ho-chi-minh/khu-vuc-pham-the-hien" },
  // ── Sài Gòn — Gò Vấp ────────────────────────────────────────────────────
  { cluster: "saigon", name: "Bún đậu NÀNG MƠ", address: "852 Quang Trung, Gò Vấp", priceVnd: 50000n, tags: ["noodles"], note: "Mẹt bún đậu ~50k/suất · Nguồn: toplist.vn", sourceUrl: "https://toplist.vn/top-list/quan-an-ngon-va-chat-luong-tai-duong-quang-trung-tp-hcm-35031.htm" },
  { cluster: "saigon", name: "Trà Sữa Tam Cốc", address: "543A/3 Lê Đức Thọ, P.17, Gò Vấp", priceVnd: 12000n, tags: ["drinks", "under-25k"], note: "Trà sữa homemade 9–15k · Nguồn: idulich.vn", sourceUrl: "https://idulich.vn/quan-an-vat-ngon-o-go-vap" },
  { cluster: "saigon", name: "Megustas Coffee", address: "197 Lê Đức Thọ, P.17, Gò Vấp", priceVnd: 20000n, tags: ["snacks", "under-25k"], note: "Ăn vặt + cafe 20–50k · Nguồn: idulich.vn", sourceUrl: "https://idulich.vn/quan-an-vat-ngon-o-go-vap" },
];

function streetFromAddress(address: string): string {
  let s = address.split(",")[0]!.trim();
  s = s.replace(/^(đối diện|góc|cạnh|khu)\s+/i, "");
  s = s.replace(/^.*?(ngõ|hẻm)\s*[\dA-Za-z/-]*\s*/i, "");
  s = s.split(/\s*[–—-]\s*/)[0]!.trim();
  s = s.replace(/^[\dA-Za-z][\dA-Za-z/.-]*\s+/, "");
  return s.replace(/^(phố|đường)\s+/i, "").trim();
}

function districtFromAddress(address: string): string {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.at(-1)!;
}

function addressVariants(cluster: string, listing: Listing): { q: string; approx: boolean }[] {
  const city = cluster === "hanoi" ? "Hà Nội" : "Hồ Chí Minh";
  const bare = listing.address.replace(/,?\s*P\.\S+,/g, ",").replace(/,?\s*Q\.\S+,/g, ",");
  const street = streetFromAddress(listing.address);
  const district = districtFromAddress(listing.address);
  return [
    { q: `${listing.address}, ${city}, Vietnam`, approx: false },
    { q: `${bare}, ${city}, Vietnam`, approx: false },
    ...(street ? [{ q: `${street}, ${district}, ${city}, Vietnam`, approx: true }] : []),
    ...(street ? [{ q: `${street}, ${city}, Vietnam`, approx: true }] : []),
    { q: `${listing.name}, ${district}, ${city}, Vietnam`, approx: true },
  ];
}

async function geocode(cluster: string, listing: Listing): Promise<{ lat: number; lng: number; approx: boolean } | null> {
  const bbox = CITY_BBOX[cluster]?.bbox;
  for (const { q, approx } of addressVariants(cluster, listing)) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "vn");
    const res = await fetch(url, {
      headers: { "User-Agent": "MoneyLab-FoodMap/1.0 (student-area public listings)" },
    });
    if (res.ok) {
      const data = (await res.json()) as { lat: string; lon: string }[];
      const hit = data[0];
      const coords = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
      if (coords && bbox && coords.lat >= bbox[0] && coords.lng >= bbox[1] && coords.lat <= bbox[2] && coords.lng <= bbox[3]) {
        return { ...coords, approx };
      }
    }
    await sleep(1100);
  }
  return null;
}

async function main(): Promise<void> {
  let imported = 0;
  let skipped = 0;

  for (const listing of LISTINGS) {
    const cluster = await prisma.foodCluster.findUnique({ where: { slug: listing.cluster } });
    if (!cluster) {
      console.warn(`skip (no cluster ${listing.cluster}): ${listing.name}`);
      skipped++;
      continue;
    }
    const existing = await prisma.foodSpot.findFirst({
      where: { clusterId: cluster.id, name: listing.name },
    });
    if (existing) {
      if (!existing.avgPriceVnd) {
        await prisma.foodSpot.update({ where: { id: existing.id }, data: { avgPriceVnd: listing.priceVnd } });
        console.log(`~ priced: ${listing.name}`);
      }
      skipped++;
      continue;
    }

    const coords = await geocode(listing.cluster, listing);
    await sleep(1100);
    if (!coords) {
      console.warn(`skip (no geocode): ${listing.name} — ${listing.address}`);
      skipped++;
      continue;
    }

    await prisma.foodSpot.create({
      data: {
        id: uuidv7(),
        clusterId: cluster.id,
        name: listing.name,
        address: listing.address,
        lat: coords.lat,
        lng: coords.lng,
        avgPriceVnd: listing.priceVnd,
        tags: listing.tags,
        note: coords.approx ? `${listing.note} · tọa độ gần đúng` : `${listing.note}`,
        source: "manual",
        sourceRef: listing.sourceUrl,
        verified: false,
        order: 300 + imported,
      },
    });
    imported++;
    console.log(`+ [${listing.cluster}] ${listing.name} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
  }

  console.log(`Student listings: ${imported} imported, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
