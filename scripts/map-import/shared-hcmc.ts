import { sleep } from "./geo";

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtml(input: string): string {
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

export type HcmcRow = { name: string; address: string; district: string; sourceRef: string };

export async function fetchOfficialDirectory(codekhoi: string, maxPages = 5): Promise<HcmcRow[]> {
  const rows: HcmcRow[] = [];
  const base = `https://thptannhontay.hcm.edu.vn/DSDonVi?codekhoi=${codekhoi}`;
  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? base : `${base}&trang=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "MoneyLab-FoodMap/1.0" } });
    if (!res.ok) break;
    const html = await res.text();
    const table = html.match(/<table[^>]*GridViewStyle2[\s\S]*?<\/table>/i)?.[0] ?? "";
    if (!table) break;
    const rowMatches = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    let pageRows = 0;
    for (const rowHtml of rowMatches) {
      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decodeHtml(m[1] ?? ""));
      const name = cells[1] ?? "";
      const website = rowHtml.match(/href=['"](https?:\/\/[^'"]+\.hcm\.edu\.vn)['"]/i)?.[1] ?? "";
      if (!/^\d+$/.test(cells[0] ?? "") || !name || !website) continue;
      rows.push({ name, address: "", district: "", sourceRef: website });
      pageRows++;
    }
    if (pageRows === 0) break;
  }
  const unique = new Map<string, HcmcRow>();
  for (const row of rows) unique.set(normalizeName(row.name), row);
  return [...unique.values()];
}

export async function fetchSchoolAddress(sourceRef: string): Promise<string> {
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

export function pickGeocodeQueries(address: string, schoolName: string): string[] {
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

export async function geocodeAddress(
  address: string,
  schoolName = "",
): Promise<{ lat: number; lng: number } | null> {
  const queries = pickGeocodeQueries(address, schoolName);
  for (const query of queries) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "vn");
      const res = await fetch(url, {
        headers: { "User-Agent": "MoneyLab-FoodMap/1.0 (HCMC university enrichment)" },
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
