/**
 * Browser smoke pass over the learner app.
 *
 * Drives a real Chrome against a running server (pnpm start), signs in as the
 * seeded learner, walks every learner route, and fails if any page logs a console error
 * or a request comes back 4xx/5xx. Screenshots land in the output directory so
 * the run can be reviewed by eye as well.
 *
 * Usage: pnpm exec tsx --tsconfig tsconfig.json scripts/smoke-ui.ts [outDir]
 */
import { mkdirSync } from "node:fs";
import { platform } from "node:os";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
function defaultChromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (platform() === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "/usr/bin/google-chrome";
}
const CHROME = defaultChromePath();
// Checked in so the review record travels with the repo. Pass a path to override.
const OUT = process.argv[2] ?? "docs/screenshots";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@moneylab.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
const LEARNER_EMAIL = process.env.SEED_LEARNER_EMAIL ?? "learner@moneylab.local";
const LEARNER_PASSWORD = process.env.SEED_LEARNER_PASSWORD ?? "learner12345";

interface Problem {
  route: string;
  kind: "console" | "request" | "crash";
  detail: string;
}

const problems: Problem[] = [];
let current = "startup";

// Next serves these in dev and they are noisy without being defects.
const IGNORED = [
  /favicon\.ico/,
  /Download the React DevTools/,
  /_next\/static\/.*\.map/,
];

function watch(page: Page): void {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    void (async () => {
      // React logs Error objects as handles, so unwrap them for a usable report.
      const parts = await Promise.all(
        msg.args().map(async (a) => {
          try {
            const v = await a.evaluate((x: unknown) =>
              x instanceof Error ? `${x.name}: ${x.message}` : String(x),
            );
            return v;
          } catch {
            return msg.text();
          }
        }),
      );
      const text = parts.join(" ") || msg.text();
      if (IGNORED.some((re) => re.test(text))) return;
      problems.push({ route: current, kind: "console", detail: text });
    })();
  });
  page.on("pageerror", (err) => {
    problems.push({ route: current, kind: "crash", detail: err.message });
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (IGNORED.some((re) => re.test(url))) return;
    // 401 on the bootstrap call is the expected signed-out state.
    if (status === 401 && current === "landing") return;
    problems.push({ route: current, kind: "request", detail: `${status} ${url}` });
  });
}

/**
 * The security headers come from next.config.ts, which means the real server is
 * the only place they can be observed. Checked once, on the first document
 * response of the run.
 */
const REQUIRED_HEADERS: Array<[string, RegExp]> = [
  ["content-security-policy", /default-src 'self'/],
  ["content-security-policy", /frame-src [^;]*youtube-nocookie\.com/],
  ["content-security-policy", /frame-ancestors 'none'/],
  ["content-security-policy", /object-src 'none'/],
  ["x-content-type-options", /nosniff/],
  ["referrer-policy", /strict-origin-when-cross-origin/],
  ["strict-transport-security", /max-age=\d+/],
];

function checkHeaders(headers: Record<string, string>): void {
  for (const [name, pattern] of REQUIRED_HEADERS) {
    const value = headers[name] ?? "";
    if (!pattern.test(value)) {
      problems.push({ route: "headers", kind: "request", detail: `${name} missing ${pattern}: "${value}"` });
    }
  }
}

let headersChecked = false;

async function visit(page: Page, name: string, path: string): Promise<void> {
  current = name;
  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 30_000 });
    if (!headersChecked && res) {
      headersChecked = true;
      checkHeaders(res.headers());
    }
  } catch {
    // networkidle2 occasionally never settles on a cold route. Reload once and
    // fall back to a fixed wait, so a slow first paint is not read as a failure.
    // A route that is genuinely broken still shows up through console, pageerror
    // and response listeners, which stay attached across the retry.
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 4_000));
  }
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${OUT}/${name}.png` as `${string}.png`, fullPage: true });
  console.log(`  ${name.padEnd(22)} ${path}`);
}

/** Map tiles and price pins need a beat after networkidle. */
async function visitMap(page: Page, name: string, path: string): Promise<void> {
  current = name;
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 6_000));
  await page.screenshot({ path: `${OUT}/${name}.png` as `${string}.png`, fullPage: true });
  console.log(`  ${name.padEnd(22)} ${path}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  watch(page);

  await visit(page, "landing", "/");
  await visitMap(page, "ban-do", "/ban-do");

  await visit(page, "login", "/login");
  await visit(page, "signup", "/signup");

  // The library is readable signed out, so it is walked before the login.
  await visit(page, "library", "/library");
  const articleSlug = await page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>('a[href^="/library/"]');
    return link ? link.getAttribute("href")!.replace("/library/", "") : null;
  });
  if (!articleSlug) throw new Error("no article linked from /library");
  await visit(page, "library-article", `/library/${articleSlug}`);

  // Sign in as the seeded learner, so the rest of the walk runs authenticated.
  current = "learner-session";
  const res = await page.evaluate(
    async (base, email, password) => {
      const r = await fetch(`${base}/api/session/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      });
      return r.status;
    },
    BASE,
    LEARNER_EMAIL,
    LEARNER_PASSWORD,
  );
  if (res !== 200 && res !== 201) throw new Error(`learner login failed: ${res}`);

  await visit(page, "vi-cua-toi", "/vi-cua-toi");
  await visit(page, "vi-cua-toi-hieu-minh", "/vi-cua-toi/hieu-minh");
  await visit(page, "vi-cua-toi-chia-vi", "/vi-cua-toi/chia-vi");
  await visit(page, "vi-cua-toi-cuoc-song", "/vi-cua-toi/cuoc-song");
  await visit(page, "vi-cua-toi-thu-thach", "/vi-cua-toi/thu-thach");
  await visitMap(page, "ban-do-signed-in", "/ban-do");

  await visit(page, "learn", "/learn");
  await visit(page, "sims", "/sims");
  await visit(page, "tools", "/tools");
  await visit(page, "tools-loan", "/tools/loan-payment");
  await visit(page, "quests", "/quests");
  await visit(page, "leaderboard", "/leaderboard");
  await visit(page, "shop", "/shop");
  await visit(page, "profile", "/profile");
  await visit(page, "tutor", "/tutor");
  await visit(page, "settings", "/settings");

  // Walk into the seeded course and its first lesson.
  current = "course";
  const courseSlug = await page.evaluate(async (base) => {
    const tracks = await fetch(`${base}/api/v1/catalog/tracks`, { credentials: "same-origin" });
    const tj = (await tracks.json()) as { data?: Array<{ slug: string }> };
    const trackSlug = tj.data?.[0]?.slug;
    if (!trackSlug) return null;
    const r = await fetch(`${base}/api/v1/catalog/tracks/${trackSlug}`, { credentials: "same-origin" });
    const j = (await r.json()) as { data?: { courses?: Array<{ slug: string }> } };
    return j.data?.courses?.[0]?.slug ?? null;
  }, BASE);
  if (courseSlug) {
    await visit(page, "course", `/course/${courseSlug}`);
    const lessonSlug = await page.evaluate(
      async (base, slug) => {
        const r = await fetch(`${base}/api/v1/catalog/courses/${slug}`, { credentials: "same-origin" });
        const j = (await r.json()) as {
          data?: {
            modules?: Array<{ lessons?: Array<{ slug: string }> }>;
            unmoduledLessons?: Array<{ slug: string }>;
          };
        };
        return (
          j.data?.modules?.[0]?.lessons?.[0]?.slug ?? j.data?.unmoduledLessons?.[0]?.slug ?? null
        );
      },
      BASE,
      courseSlug,
    );
    if (lessonSlug) await visit(page, "lesson", `/lesson/${lessonSlug}`);
  }

  // Start one session per simulation and screenshot the live board.
  current = "sim-start";
  const sims = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/v1/sims`, { credentials: "same-origin" });
    const j = (await r.json()) as { data?: Array<{ id: string; slug: string; type: string }> };
    return j.data ?? [];
  }, BASE);

  for (const sim of sims) {
    current = `sim-${sim.type.toLowerCase()}`;
    const sessionId = await page.evaluate(
      async (base, simId) => {
        const r = await fetch(`${base}/api/v1/sims/${simId}/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": `smoke:${simId}` },
          body: "{}",
          credentials: "same-origin",
        });
        const j = (await r.json()) as { data?: { id?: string } };
        return j.data?.id ?? null;
      },
      BASE,
      sim.id,
    );
    if (sessionId) {
      await visit(page, `sim-${sim.type.toLowerCase()}`, `/sims/${sim.type.toLowerCase()}/${sessionId}`);
    }
  }

  // Admin console, which needs a real ADMIN login rather than the guest session.
  current = "admin-login";
  const adminStatus = await page.evaluate(
    async (base, email, password) => {
      await fetch(`${base}/api/session/logout`, { method: "POST", credentials: "same-origin" });
      const r = await fetch(`${base}/api/session/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      });
      return r.status;
    },
    BASE,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
  );
  if (adminStatus !== 200 && adminStatus !== 201) {
    problems.push({ route: "admin-login", kind: "request", detail: `admin login failed: ${adminStatus}` });
  } else {
    await visit(page, "admin", "/admin");
    await visit(page, "admin-content", "/admin/content");
    await visit(page, "admin-users", "/admin/users");
    await visit(page, "admin-sims", "/admin/sims");
    await visit(page, "admin-feedback", "/admin/feedback");
    await visit(page, "admin-flags", "/admin/flags");
    await visit(page, "admin-audit", "/admin/audit");
  }

  // Dark theme, which the boot script applies from localStorage on load.
  current = "dark-setup";
  await page.evaluate(() => localStorage.setItem("ml-theme", "dark"));
  await visit(page, "dark-learn", "/learn");
  await visit(page, "dark-tools", "/tools/loan-payment");
  await visit(page, "dark-admin", "/admin/content");

  // Narrow viewport, where the auth panel drops to a banner and the nav collapses.
  current = "mobile-setup";
  await page.evaluate(() => localStorage.setItem("ml-theme", "light"));
  await page.setViewport({ width: 420, height: 860 });
  await visit(page, "mobile-landing", "/");
  await visitMap(page, "mobile-ban-do", "/ban-do");
  await visit(page, "mobile-login", "/login");
  await visit(page, "mobile-learn", "/learn");
  await visit(page, "mobile-library", "/library");

  await browser.close();

  console.log(`\nScreenshots in ${OUT}/`);
  if (problems.length === 0) {
    console.log("No console errors, no failed requests.");
    return;
  }
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  [${p.route}] ${p.kind}: ${p.detail}`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
