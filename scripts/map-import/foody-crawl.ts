#!/usr/bin/env tsx
/**
 * Crawl Foody.vn public listing + store pages for physical cheap-eat spots.
 *
 * Discovery: city x category (and discovered cuisine paths) listing pages,
 * 12 items/page, server caps at page 5 per URL. Store data is embedded in the
 * SSR blob `var jsonData = {...}` (searchItems[]).
 *
 * Prices: store detail pages expose "Giá bình quân đầu người Xđ - Yđ".
 *
 * Resumable caches under prisma/data/foody/:
 *   stores-<city>.json   { [storeId]: store }
 *   prices-<city>.json   { [storeId]: { min, max } }
 *
 * Usage:
 *   tsx scripts/map-import/foody-crawl.ts                 # discover + prices
 *   tsx scripts/map-import/foody-crawl.ts --discover-only
 *   tsx scripts/map-import/foody-crawl.ts --prices-only --max-price-fetch=500
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "prisma/data/foody");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const BASE = "https://www.foody.vn";
const LISTING_PAGES = 5;
const PRICE_DELAY_MS = 900;

const CITIES = [
  { slug: "ho-chi-minh", cluster: "saigon" },
  { slug: "ha-noi", cluster: "hanoi" },
];

const SEED_BUCKETS = ["quan-an", "an-vat-via-he"];

type Store = {
  id: number;
  name: string;
  address: string;
  district: string | null;
  lat: number | null;
  lng: number | null;
  detailUrl: string;
  cuisines: string[];
  avgRating: string | null;
  totalReview: number;
};

type PriceInfo = { min: number; max: number };

const args = process.argv.slice(2);
const discoverOnly = args.includes("--discover-only");
const pricesOnly = args.includes("--prices-only");
const argValue = (name: string): string | null => {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1]!;
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : null;
};
const maxPriceFetch = Number(argValue("--max-price-fetch") ?? Infinity) || Infinity;
const concurrency = Math.max(1, Number(argValue("--concurrency") ?? 1));
const cityFilter = argValue("--city");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJsonData(html: string): { searchItems?: unknown[]; totalResult?: number; currentPage?: number } | null {
  const key = "var jsonData = ";
  const s = html.indexOf(key);
  if (s < 0) return null;
  let i = s + key.length;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (; i < html.length; i++) {
    const c = html[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  try {
    return JSON.parse(html.slice(s + key.length, i));
  } catch {
    return null;
  }
}

async function fetchUrl(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
      if (res.status === 200) return await res.text();
      if (res.status === 404 || res.status === 410) return null;
    } catch {
      /* retry */
    }
    await sleep(1500);
  }
  return null;
}

function loadJson<T>(file: string, fallback: T): T {
  const p = path.join(DATA_DIR, file);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

function saveJson(file: string, data: unknown): void {
  const p = path.join(DATA_DIR, file);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  writeFileSync(p, JSON.stringify(data));
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  for (const city of CITIES) {
    if (cityFilter && city.slug !== cityFilter) continue;
    const storesFile = `stores-${city.slug}.json`;
    const pricesFile = `prices-${city.slug}.json`;
    const stores = loadJson<Record<string, Store>>(storesFile, {});
    const prices = loadJson<Record<string, PriceInfo>>(pricesFile, {});

    if (!pricesOnly) {
      const buckets = new Set<string>(SEED_BUCKETS);
      const doneBuckets = new Set<string>();

      while (buckets.size > 0) {
        const bucket = [...buckets][0]!;
        buckets.delete(bucket);
        if (doneBuckets.has(bucket)) continue;
        doneBuckets.add(bucket);

        for (let page = 1; page <= LISTING_PAGES; page++) {
          const url = `${BASE}/${city.slug}/${bucket}${page > 1 ? `?page=${page}` : ""}`;
          const html = await fetchUrl(url);
          if (!html) break;
          const data = extractJsonData(html);
          const items = Array.isArray(data?.searchItems) ? data!.searchItems! : [];
          let added = 0;
          for (const raw of items) {
            const it = raw as Record<string, unknown>;
            const id = it.Id as number | undefined;
            const name = it.Name as string | undefined;
            if (!id || !name) continue;
            if (!stores[String(id)]) added++;
            stores[String(id)] = {
              id,
              name,
              address: ((it.Address as string) ?? "").trim(),
              district: (it.District as string) ?? null,
              lat: (it.Latitude as number) ?? null,
              lng: (it.Longitude as number) ?? null,
              detailUrl: ((it.DetailUrl as string) ?? `/${city.slug}/${it.UrlRewriteName}`).trim(),
              cuisines: Array.isArray(it.Cuisines)
                ? (it.Cuisines as { Name?: string }[]).map((c) => c.Name ?? "").filter(Boolean)
                : [],
              avgRating: (it.AvgRating as string) ?? null,
              totalReview: (it.TotalReview as number) ?? 0,
            };
            // discover cuisine partition paths from items
            if (Array.isArray(it.Cuisines)) {
              for (const c of it.Cuisines as { DetailUrl?: string }[]) {
                if (c.DetailUrl && /^\/[a-z-]+\/dia-diem-[a-z0-9-]+$/.test(c.DetailUrl)) {
                  const sub = c.DetailUrl.split("/").pop()!;
                  if (!doneBuckets.has(sub)) buckets.add(sub);
                }
              }
            }
          }
          console.log(`[${city.slug}] /${bucket} p${page}: ${items.length} items (${added} new)`);
          saveJson(storesFile, stores);
          await sleep(700 + Math.floor(Math.random() * 400));
          if (items.length < 12) break;
        }
      }
    }

    if (discoverOnly) {
      console.log(`[${city.slug}] stores discovered: ${Object.keys(stores).length}, priced: ${Object.keys(prices).length}`);
      continue;
    }

    const needPrice = Object.values(stores).filter((s) => !prices[String(s.id)]);
    console.log(`[${city.slug}] price phase: ${needPrice.length} to fetch (cap ${maxPriceFetch === Infinity ? "none" : maxPriceFetch}, concurrency ${concurrency})`);
    let fetched = 0;
    let saved = 0;
    let cursor = 0;

    async function fetchPrice(store: Store): Promise<void> {
      if (fetched >= maxPriceFetch) return;
      const html = await fetchUrl(`${BASE}${store.detailUrl}`);
      fetched++;
      if (html) {
        const m = html.match(/Giá bình quân đầu người[^0-9]*([\d.,]+)\s*đ(?:\s*-\s*([\d.,]+)\s*đ)?/i);
        if (m) {
          const parse = (v: string) => Number(v.replace(/[.,]/g, ""));
          const min = parse(m[1]!);
          const max = m[2] ? parse(m[2]) : min;
          if (Number.isFinite(min) && min > 0) prices[String(store.id)] = { min, max };
        }
      }
      if (fetched % 25 === 0) {
        saveJson(pricesFile, prices);
        saved = fetched;
        console.log(`[${city.slug}] price progress: ${fetched}/${needPrice.length}`);
      }
      await sleep(PRICE_DELAY_MS + Math.floor(Math.random() * 500));
    }

    async function worker(): Promise<void> {
      while (cursor < needPrice.length && fetched < maxPriceFetch) {
        const store = needPrice[cursor++]!;
        await fetchPrice(store);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    saveJson(pricesFile, prices);
    void saved;
    console.log(`[${city.slug}] stores: ${Object.keys(stores).length}, priced: ${Object.keys(prices).length}, fetched this run: ${fetched}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
