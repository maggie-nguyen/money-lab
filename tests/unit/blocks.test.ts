import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blockSchema } from "@/server/schemas/content";
import { stripBlocks } from "@/server/services/catalogService";

/**
 * The block vocabulary is shared by three parties that cannot see each other:
 * the authored JSON, the zod schema the database column is validated against,
 * and the renderer. When they drifted apart once, every seeded lesson body
 * silently rendered as nothing. These tests pin all three together.
 */

const ROOT = join(__dirname, "..", "..");

function authoredBlockSets(): Array<{ where: string; blocks: unknown[] }> {
  const out: Array<{ where: string; blocks: unknown[] }> = [];

  const bundle = JSON.parse(
    readFileSync(join(ROOT, "content", "vi", "nen-tang-tien-bac", "ngan-sach-va-tiet-kiem.json"), "utf-8"),
  ) as { course: { lessons: Array<{ slug: string; i18n: Record<string, { blocks: unknown[] }> }> } };
  for (const lesson of bundle.course.lessons)
    for (const [locale, tr] of Object.entries(lesson.i18n))
      out.push({ where: `lesson ${lesson.slug}.${locale}`, blocks: tr.blocks });

  const articles = JSON.parse(readFileSync(join(ROOT, "content", "vi", "articles.json"), "utf-8")) as {
    articles: Array<{ slug: string; i18n: Record<string, { blocks: unknown[] }> }>;
  };
  for (const article of articles.articles)
    for (const [locale, tr] of Object.entries(article.i18n))
      out.push({ where: `article ${article.slug}.${locale}`, blocks: tr.blocks });

  return out;
}

describe("authored content", () => {
  it("has at least five psychology articles and optional legacy lessons", () => {
    const sets = authoredBlockSets();
    const articles = sets.filter((s) => s.where.startsWith("article "));
    expect(articles.length).toBeGreaterThanOrEqual(5);
    expect(sets.length).toBeGreaterThanOrEqual(articles.length);
  });

  it("psychology articles avoid em dash (house style)", () => {
    for (const { where, blocks } of authoredBlockSets()) {
      if (!where.startsWith("article ")) continue;
      expect(`${where}: ${JSON.stringify(blocks)}`).not.toContain("—");
    }
  });

  it.each(authoredBlockSets())("$where validates against blockSchema", ({ blocks }) => {
    blocks.forEach((block, i) => {
      const parsed = blockSchema.safeParse(block);
      if (!parsed.success) {
        throw new Error(
          `block[${i}] (${(block as { type?: string }).type}): ${JSON.stringify(parsed.error.issues)}`,
        );
      }
    });
  });

  it("uses no em dash in legacy lesson content", () => {
    for (const { where, blocks } of authoredBlockSets()) {
      if (!where.startsWith("lesson ")) continue;
      expect(`${where}: ${JSON.stringify(blocks)}`).not.toContain("—");
    }
  });
});

describe("renderer coverage", () => {
  // A static check rather than a render: the renderer is a client component and
  // this suite runs in node. It still catches a type added to the schema with
  // no case in the switch, which is the failure that actually happened.
  const source = readFileSync(join(ROOT, "src", "components", "lesson", "Blocks.tsx"), "utf-8");
  const types = blockSchema.options.map((o) => o.shape.type.value as string);

  it("covers every block type in the schema", () => {
    expect(types.length).toBeGreaterThan(10);
    for (const t of types) expect(source).toContain(`case "${t}":`);
  });
});

describe("stripBlocks", () => {
  const authored = [
    { type: "PARAGRAPH", text: "giữ nguyên" },
    {
      type: "CHECK_QUESTION",
      question: {
        id: "q1",
        type: "SINGLE_CHOICE",
        prompt: "Chọn đáp án đúng",
        options: [{ key: "a", text: "A" }],
        answerKey: { correct: "a" },
        explanation: "Vì a đúng",
      },
    },
  ];

  it("removes the answer key and the explanation, which names the answer", () => {
    const [, check] = stripBlocks(authored) as Array<{ question: Record<string, unknown> }>;
    expect(check!.question.answerKey).toBeUndefined();
    expect(check!.question.explanation).toBeUndefined();
    expect(check!.question.prompt).toBe("Chọn đáp án đúng");
  });

  it("leaves other blocks untouched", () => {
    const [para] = stripBlocks(authored);
    expect(para).toEqual({ type: "PARAGRAPH", text: "giữ nguyên" });
  });
});
