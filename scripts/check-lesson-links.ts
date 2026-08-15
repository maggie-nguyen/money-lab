 
/**
 * Checks the two lesson blocks that leave the reader: CALCULATOR and SIM_LINK.
 *
 * Both are easy to break silently, because a wrong href still renders a
 * perfectly good looking card. This clicks them for real and asserts where the
 * learner lands: a tool page with the lesson's numbers already filled in, and a
 * live sim session rather than the hub.
 *
 * Usage: pnpm exec tsx --tsconfig tsconfig.json scripts/check-lesson-links.ts
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const EMAIL = process.env.SEED_LEARNER_EMAIL ?? "learner@moneylab.local";
const PASSWORD = process.env.SEED_LEARNER_PASSWORD ?? "learner12345";

const failures: string[] = [];

function expect(ok: boolean, what: string, detail: string): void {
  if (ok) console.log(`✔ ${what}`);
  else {
    console.error(`✘ ${what}: ${detail}`);
    failures.push(what);
  }
}

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', EMAIL);
    await page.type('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click('button[type="submit"]'),
    ]);

    // CALCULATOR: lesson 2 sends its 50/30/20 income to the budget tool.
    await page.goto(`${BASE}/lesson/quy-tac-50-30-20`, { waitUntil: "networkidle2" });
    const toolHref = await page.$eval('a[href^="/tools/"]', (a) => a.getAttribute("href") ?? "");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click('a[href^="/tools/"]'),
    ]);
    const toolUrl = page.url();
    expect(toolUrl.includes("/tools/"), "CALCULATOR block opens a tool page", `href=${toolHref} url=${toolUrl}`);
    const presets = new URL(toolUrl).searchParams;
    const filled = await page.$$eval("input", (els) =>
      els.map((e) => (e as HTMLInputElement).value),
    );
    // Money fields render grouped ("3.000.000"), so compare on digits alone.
    const digits = filled.map((v) => v.replace(/\D/g, ""));
    for (const [key, value] of presets) {
      expect(
        digits.includes(value.replace(/\D/g, "")),
        `preset ${key}=${value} lands in a field`,
        `fields=${filled.join(",")}`,
      );
    }

    // SIM_LINK: lesson 1 sends the learner into the first-salary sim.
    await page.goto(`${BASE}/lesson/vi-sao-can-ngan-sach`, { waitUntil: "networkidle2" });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click('a[href^="/sims?start="]'),
    ]);
    // The hub starts or resumes the session, then replaces the url.
    await page
      .waitForFunction(() => /\/sims\/[a-z]+\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 15_000 })
      .catch(() => undefined);
    expect(
      /\/sims\/[a-z]+\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname),
      "SIM_LINK block opens a sim session",
      page.url(),
    );
  } finally {
    await browser.close();
  }

  if (failures.length > 0) process.exit(1);
  console.log("\nlesson links ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
