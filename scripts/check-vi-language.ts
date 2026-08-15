/**
 * Static check for the Vietnamese language standard in doc 05 §7.
 *
 * Copy drifts one string at a time, and nobody reviews a two-word label as
 * prose. This reads every source and content file and fails the build on the
 * two things that make the product read as if several people wrote it: tone
 * marks placed the old way, and a second word for a concept that already has
 * one.
 *
 * Usage: pnpm content:lang
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOTS = ["src", "content", "prisma"];
const EXTS = new Set([".ts", ".tsx", ".json", ".md"]);

type Rule = { pattern: RegExp; message: string };

/**
 * Tone placement. Only open oa/oe/uy syllables differ between the two
 * conventions, so `hoàn`, `khoản` and `quỹ` are deliberately absent: they are
 * spelled the same either way and matching them would be a false positive.
 */
const SPELLING: Array<[string, string]> = [
  ["khoá", "khóa"],
  ["hoá", "hóa"],
  ["xoá", "xóa"],
  ["huỷ", "hủy"],
  ["tuỳ", "tùy"],
  ["hoà", "hòa"],
  ["toả", "tỏa"],
  ["doạ", "dọa"],
  ["hoạ", "họa"],
  ["luỹ", "lũy"],
  ["khoẻ", "khỏe"],
  ["thuỷ", "thủy"],
];

const VOCAB: Rule[] = [
  { pattern: /học viên/iu, message: "the learner is 'học sinh' (doc 05 §7)" },
  { pattern: /người học/iu, message: "the learner is 'học sinh' (doc 05 §7)" },
  { pattern: /\bchơi\b.{0,16}mô phỏng|mô phỏng.{0,16}\bchơi\b/iu, message: "a simulation is 'làm', not 'chơi' (doc 05 §7)" },
  { pattern: /lượt chơi/iu, message: "use 'tình huống' or 'lượt', not 'lượt chơi' (doc 05 §7)" },
  { pattern: /sống sót/iu, message: "survival register, rewrite (doc 05 §7)" },
  { pattern: /Trợ lý MoneyLab/u, message: "the tutor is 'Trợ giảng MoneyLab' everywhere (doc 05 §7)" },
  { pattern: /chưa đúng(?![\p{L}])/iu, message: "answer feedback is 'Chưa chính xác' (doc 05 §7)" },
  { pattern: /(nhé|nha)[.!"”]/iu, message: "no chatty sentence-final particles (doc 05 §7)" },
];

/**
 * Typography. These are the rules that make three files read as one voice.
 * They only fire on lines that already contain Vietnamese, so English code,
 * comments and identifiers are left alone.
 */
const TYPOGRAPHY: Rule[] = [
  { pattern: /\d\s?đ(?![\p{L}\d])/u, message: "currency is '12.000 đồng' in prose and '12.000 ₫' in table cells, never glued 'đ' (doc 05 §7)" },
  { pattern: /%\/(năm|tháng|tuần|ngày)/u, message: "write '% một năm' in prose; '%/năm' belongs only in a table cell (doc 05 §7)" },
  { pattern: /hàng (tháng|tuần|ngày|năm)/u, message: "write 'hằng tháng', not 'hàng tháng' (doc 05 §7)" },
  { pattern: /→/u, message: "no arrows in Vietnamese prose, write the connective out (doc 05 §7)" },
  { pattern: / & /u, message: "write 'và', not '&' (doc 05 §7)" },
  { pattern: /50-30-20/u, message: "the rule is written '50/30/20' (doc 05 §7)" },
  // Prettier already forces double-quoted string literals, so a single-quote
  // pair on a Vietnamese line is quoted copy rather than a delimiter.
  { pattern: /'[^']{2,}'/u, message: "quote with \"…\", not single quotes (doc 05 §7)" },
  { pattern: /(?<![\p{L}\d])(LUÔN|TẤT CẢ|NHU CẦU|MONG MUỐN|TIẾT KIỆM|KHÔNG BAO GIỜ)(?![\p{L}])/u, message: "no all-caps emphasis, it reads as an English style guide (doc 05 §7)" },
  { pattern: /"(Đúng|Sai)\.\s/u, message: "an explanation states the reason, it does not open with 'Đúng.'/'Sai.' (doc 05 §7)" },
  // Sentence-final only, so `!x`, `!==` and TypeScript's `x!.y` do not trip it.
  { pattern: /!(?=[\s"”']|$)/u, message: "no exclamation marks in Vietnamese copy (doc 05 §7)" },
];

/** A line is Vietnamese if it carries a diacritic or 'đ' no English word has. */
const VIETNAMESE = /[ăâêôơưđàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;

/**
 * Three exemptions, all of them about text that is not the product speaking.
 *
 * Comments never ship. A JSON line holding nothing but a quoted scalar is a
 * table cell, where '12%/năm' and '₫' are the correct compact forms. And the
 * seeded `msg_*` bundle is quoted scam bait and quoted brand SMS: a scam text
 * written in our house style would be a worse teaching artifact than a real one.
 */
function exempt(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    /^"[^"]*",?$/.test(t) ||
    /^msg_[a-z0-9_]+:/.test(t)
  );
}

const failures: string[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (EXTS.has(extname(entry))) out.push(path);
  }
  return out;
}

function report(file: string, line: number, text: string, message: string): void {
  failures.push(`${file}:${line}  ${message}\n    ${text.trim().slice(0, 120)}`);
}

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      for (const [wrong, right] of SPELLING) {
        // Whole word only, so 'xoáy' does not trip the 'xoá' rule.
        if (new RegExp(`(?<!\\p{L})${wrong}(?!\\p{L})`, "iu").test(text)) {
          report(file, i + 1, text, `write '${right}', not '${wrong}' (doc 05 §7)`);
        }
      }
      for (const rule of VOCAB) {
        if (rule.pattern.test(text)) report(file, i + 1, text, rule.message);
      }
      if (!VIETNAMESE.test(text) || exempt(text)) return;
      for (const rule of TYPOGRAPHY) {
        if (rule.pattern.test(text)) report(file, i + 1, text, rule.message);
      }
    });
  }
}

if (failures.length > 0) {
  console.error(`✘ ${failures.length} Vietnamese language issue(s):\n`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("✔ Vietnamese language standard clean");
