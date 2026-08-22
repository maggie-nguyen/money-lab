/**
 * Capture map screenshots only (default, selected overlay, spot detail, mobile).
 * Usage: SMOKE_BASE_URL=http://localhost:3000 pnpm exec tsx scripts/capture-map-screenshots.ts
 */
import { mkdirSync } from "node:fs";
import { platform } from "node:os";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "docs/screenshots";

function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (platform() === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "/usr/bin/google-chrome";
}

async function visitMap(page: Page, name: string, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 6_000));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ${name}`);
}

async function selectFirstMapSpot(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="map-spot-list"] button', { timeout: 20_000 });
  const clicked = await page.evaluate(() => {
    const lists = document.querySelectorAll('[data-testid="map-spot-list"]');
    for (const list of lists) {
      const btn = list.querySelector("button");
      if (btn instanceof HTMLButtonElement && btn.offsetParent !== null) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  if (!clicked) throw new Error("no visible map spot list item to click");
  await page.waitForSelector('[data-testid="map-spot-overlay"]', { timeout: 8_000 });
  await new Promise((r) => setTimeout(r, 500));
}

async function visitMapSelected(page: Page, name: string, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 6_000));
  await selectFirstMapSpot(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ${name} (spot selected)`);
}

async function visitMapSpotDetail(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE}/ban-do`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 6_000));
  await selectFirstMapSpot(page);
  const detailHref = await page.$eval('[data-testid="map-spot-detail-link"]', (el) =>
    el.getAttribute("href"),
  );
  if (!detailHref) throw new Error("map spot detail link missing");
  await page.goto(`${BASE}${detailHref}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1_000));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ${name} (${detailHref})`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();

  console.log(`Capturing map screenshots → ${OUT}/`);
  console.log(`Base URL: ${BASE}\n`);

  await page.setViewport({ width: 1280, height: 900 });
  await visitMap(page, "ban-do", "/ban-do");
  await visitMapSelected(page, "ban-do-selected", "/ban-do");
  await visitMapSpotDetail(page, "ban-do-spot");

  await page.setViewport({ width: 420, height: 860 });
  await visitMap(page, "mobile-ban-do", "/ban-do");
  await visitMapSelected(page, "mobile-ban-do-selected", "/ban-do");

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
