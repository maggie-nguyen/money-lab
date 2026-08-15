 
/**
 * Checks every VIDEO block in content/ against YouTube before the content ships.
 *
 * Two questions, because they have different answers: oEmbed says whether the
 * video still exists, and the watch page says whether the owner allows it to be
 * embedded. A video can be perfectly alive and still render as an unavailable
 * placeholder inside our player, which is the failure a learner would see.
 *
 * Run with `pnpm content:verify`. Exits non-zero on the first bad id, so it can
 * gate a release.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "content");

interface Found {
  file: string;
  where: string;
  url: string;
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return jsonFiles(full);
    return name.endsWith(".json") ? [full] : [];
  });
}

/** Every VIDEO block anywhere in a bundle or article file, with a readable path. */
function collect(value: unknown, file: string, path: string, out: Found[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, file, `${path}[${i}]`, out));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (obj.type === "VIDEO" && typeof obj.url === "string") {
    out.push({ file, where: path, url: obj.url });
  }
  for (const [k, v] of Object.entries(obj)) collect(v, file, `${path}.${k}`, out);
}

function videoId(url: string): string | null {
  const short = url.match(/youtu\.be\/([\w-]+)/);
  if (short?.[1]) return short[1];
  const long = url.match(/[?&]v=([\w-]+)/);
  if (long?.[1]) return long[1];
  const embed = url.match(/\/embed\/([\w-]+)/);
  return embed?.[1] ?? null;
}

async function check(id: string): Promise<string | null> {
  const oembed = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
  );
  if (!oembed.ok) return `oEmbed ${oembed.status} (video removed or private)`;
  const page = await fetch(`https://www.youtube.com/watch?v=${id}`);
  if (!page.ok) return `watch page ${page.status}`;
  const html = await page.text();
  if (html.includes('"playableInEmbed":false')) return "owner disallows embedding";
  if (!html.includes('"playableInEmbed":true')) return "could not confirm embedding is allowed";
  return null;
}

async function main(): Promise<void> {
  const found: Found[] = [];
  for (const file of jsonFiles(ROOT)) {
    collect(JSON.parse(readFileSync(file, "utf-8")), file.slice(ROOT.length + 1), "$", found);
  }
  if (found.length === 0) {
    console.log("no VIDEO blocks in content/");
    return;
  }

  let bad = 0;
  for (const f of found) {
    const id = videoId(f.url);
    if (!id) {
      console.error(`✘ ${f.file} ${f.where}: not a YouTube url (${f.url})`);
      bad += 1;
      continue;
    }
    const problem = await check(id);
    if (problem) {
      console.error(`✘ ${f.file} ${f.where}: ${id} ${problem}`);
      bad += 1;
    } else {
      console.log(`✔ ${id}  ${f.file}`);
    }
  }

  console.log(`\n${found.length - bad}/${found.length} videos playable`);
  if (bad > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
