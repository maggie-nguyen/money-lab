/**
 * Browser check for the session state machine.
 *
 * The page-by-page smoke pass proves screens render. It does not prove the
 * transitions between signed out and signed in behave, which is where the
 * defects actually were: a deep link losing its destination, the login screen
 * still reachable while signed in, "log out all devices" leaving the device you
 * clicked it on signed in for another fifteen minutes.
 *
 * Drives a real Chrome against a running server (pnpm start).
 *
 * Usage: pnpm smoke:auth
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const EMAIL = process.env.SEED_LEARNER_EMAIL ?? "learner@moneylab.local";
const PASSWORD = process.env.SEED_LEARNER_PASSWORD ?? "learner12345";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: string, expected: string): void {
  checks += 1;
  if (actual === expected) {
    console.log(`  ✔ ${name}`);
    return;
  }
  failures.push(`${name}\n      expected: ${expected}\n      actual:   ${actual}`);
  console.log(`  ✘ ${name}`);
}

/** The client redirects run in an effect, so settle on a stable url. */
async function settledPath(page: Page, timeoutMs = 8000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const now = new URL(page.url()).pathname + new URL(page.url()).search;
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince > 600) {
      return now;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return last;
}

async function goto(page: Page, path: string): Promise<string> {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  return settledPath(page);
}

async function signIn(page: Page): Promise<void> {
  await page.waitForSelector("#email");
  await page.type("#email", EMAIL);
  await page.type("#password", PASSWORD);
  await page.click('button[type="submit"]');
}

async function hasSessionCookie(page: Page): Promise<boolean> {
  const cookies = await page.browserContext().cookies();
  return cookies.some((c) => c.name === "ml_session" && c.value !== "");
}

async function main(): Promise<void> {
  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    /* ---- A deep link keeps its destination through the login screen ------ */
    console.log("deep link while signed out");
    let ctx = await browser.createBrowserContext();
    let page = await ctx.newPage();

    check("a protected deep link goes to login carrying next", await goto(page, "/profile"), "/login?next=%2Fprofile");
    await signIn(page);
    check("signing in returns to the deep link", await settledPath(page), "/profile");

    /* ---- The auth screens are closed to someone already signed in -------- */
    console.log("auth screens while signed in");
    check("/login redirects away", await goto(page, "/login"), "/wallet");
    check("/signup redirects away", await goto(page, "/signup"), "/wallet");
    check(
      "an off origin next is refused rather than followed",
      await goto(page, "/login?next=https%3A%2F%2Fevil.example%2Fsteal"),
      "/wallet",
    );
    check(
      "a protocol relative next is refused rather than followed",
      await goto(page, "/login?next=%2F%2Fevil.example%2Fsteal"),
      "/wallet",
    );

    /* ---- A reload keeps the session ------------------------------------- */
    console.log("reload while signed in");
    await goto(page, "/wallet");
    await page.reload({ waitUntil: "networkidle2" });
    check("reloading a signed in page stays put", await settledPath(page), "/wallet");

    /* ---- Sign out lands on the home page, not the login screen ----------- */
    console.log("sign out from the account menu");
    await goto(page, "/profile");
    await page.waitForSelector('button[aria-label="Tài khoản"]');
    await page.click('button[aria-label="Tài khoản"]');
    await page.waitForSelector('[role="menu"]');
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
      const out = items.find((el) => el.textContent?.trim() === "Đăng xuất");
      (out as HTMLElement | undefined)?.click();
    });
    check("signing out lands on the home page", await settledPath(page), "/");
    check("signing out clears the session hint", String(await hasSessionCookie(page)), "false");
    check("a protected page is closed again after sign out", await goto(page, "/profile"), "/login?next=%2Fprofile");
    await ctx.close();

    /* ---- Log out all devices also ends this one -------------------------- */
    console.log("log out all devices");
    ctx = await browser.createBrowserContext();
    page = await ctx.newPage();
    await goto(page, "/login");
    await signIn(page);
    await settledPath(page);
    await goto(page, "/settings");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const all = btns.find((b) => b.textContent?.trim() === "Đăng xuất mọi thiết bị");
      if (!all) throw new Error("log out all devices button not found");
      all.click();
    });
    check("log out all devices leaves the login screen", await settledPath(page), "/login");
    check("log out all devices clears this device too", String(await hasSessionCookie(page)), "false");
    check(
      "and the session does not come back on the next visit",
      await goto(page, "/wallet"),
      "/login",
    );
    await ctx.close();
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`\n✘ ${failures.length} of ${checks} auth flow checks failed:\n`);
    for (const f of failures) console.error(`  - ${f}\n`);
    process.exit(1);
  }
  console.log(`\n✔ ${checks} auth flow checks passed`);
}

void main().catch((err: unknown) => {
  console.error("auth flow check crashed:", err);
  process.exit(1);
});
