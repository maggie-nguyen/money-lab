import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { AppError } from "@/server/lib/errors";
import { uuidv7 } from "@/server/lib/ids";
import { getArticle, listArticles, publishedArticleSlugs } from "@/server/services/libraryService";
import { resourceFor } from "@/server/services/adminContentService";
import { GET as listRoute } from "@/app/api/v1/library/articles/route";
import { GET as detailRoute } from "@/app/api/v1/library/articles/[idOrSlug]/route";

/**
 * The library is the one surface a signed-out visitor can read, so the rules
 * that matter here are about what must never leak: drafts, answer keys, and
 * links to courses that are not published yet.
 */

const NOW = new Date("2026-08-14T10:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

let publishedId = "";
let draftSlug = "";

async function makeArticle(opts: {
  slug: string;
  status: "DRAFT" | "PUBLISHED";
  category?: "GUIDE" | "EXPLAINER" | "NEWS" | "STORY";
  publishedAt?: Date | null;
  blocks?: unknown[];
}) {
  const article = await prisma.article.create({
    data: {
      id: uuidv7(),
      slug: opts.slug,
      status: opts.status,
      category: opts.category ?? "GUIDE",
      publishedAt: opts.status === "PUBLISHED" ? (opts.publishedAt ?? NOW) : null,
      translations: {
        create: {
          locale: "vi",
          title: `Tiêu đề ${opts.slug}`,
          summary: "Tóm tắt ngắn",
          blocks: (opts.blocks ?? [{ type: "PARAGRAPH", text: "Nội dung" }]) as never,
        },
      },
    },
  });
  return article;
}

beforeAll(async () => {
  const published = await makeArticle({
    slug: `lib-pub-${Date.now()}`,
    status: "PUBLISHED",
    publishedAt: day(1),
    blocks: [
      { type: "PARAGRAPH", text: "Đoạn mở đầu" },
      {
        type: "CHECK_QUESTION",
        question: {
          id: "q1",
          type: "SINGLE_CHOICE",
          prompt: "Câu hỏi",
          options: [{ key: "a", text: "A" }],
          answerKey: { correct: "a" },
          explanation: "Vì vậy",
        },
      },
      { type: "PARAGRAPH", text: "Đoạn kết" },
    ],
  });
  publishedId = published.id;

  const draft = await makeArticle({ slug: `lib-draft-${Date.now()}`, status: "DRAFT" });
  draftSlug = draft.slug;
});

async function expectAppError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError ${code}, but nothing was thrown`);
}

describe("listArticles", () => {
  it("returns published articles only", async () => {
    const { data } = await listArticles({ limit: 50 }, "vi");
    expect(data.some((a) => a.id === publishedId)).toBe(true);
    expect(data.some((a) => a.slug === draftSlug)).toBe(false);
  });

  it("paginates without skipping or repeating when publishedAt disagrees with id order", async () => {
    // Created newest-first, so id order runs opposite to publication order.
    const stamp = Date.now();
    for (let i = 0; i < 5; i++)
      await makeArticle({
        slug: `lib-page-${stamp}-${i}`,
        status: "PUBLISHED",
        category: "NEWS",
        publishedAt: day(10 + i),
      });

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const res = await listArticles({ limit: 2, category: "NEWS", cursor }, "vi");
      seen.push(...res.data.map((a) => a.slug));
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    const mine = seen.filter((s) => s.startsWith(`lib-page-${stamp}-`));
    expect(new Set(mine).size).toBe(mine.length);
    expect(mine.length).toBe(5);
    // Newest publication first.
    expect(mine[0]).toBe(`lib-page-${stamp}-0`);
  });

  it("filters by category", async () => {
    const { data } = await listArticles({ limit: 50, category: "STORY" }, "vi");
    expect(data.every((a) => a.category === "STORY")).toBe(true);
  });
});

describe("getArticle", () => {
  it("drops CHECK_QUESTION blocks, since nothing can grade them here", async () => {
    const article = await getArticle(publishedId, "vi");
    const types = (article.blocks as Array<{ type: string }>).map((b) => b.type);
    expect(types).toEqual(["PARAGRAPH", "PARAGRAPH"]);
    expect(JSON.stringify(article.blocks)).not.toContain("answerKey");
  });

  it("falls back to the title and summary for SEO fields", async () => {
    const article = await getArticle(publishedId, "vi");
    expect(article.seoTitle).toBe(article.title);
    expect(article.seoDescription).toBe(article.summary);
  });

  it("resolves related reading", async () => {
    const article = await getArticle(publishedId, "vi");
    expect(article.related.length).toBeGreaterThan(0);
    expect(article.related.some((r) => r.id === publishedId)).toBe(false);
  });

  it("404s for a draft and for an unknown slug", async () => {
    await expectAppError(getArticle(draftSlug, "vi"), "NOT_FOUND");
    await expectAppError(getArticle("khong-ton-tai", "vi"), "NOT_FOUND");
  });
});

describe("publishedArticleSlugs", () => {
  it("lists no drafts", async () => {
    const slugs = await publishedArticleSlugs();
    expect(slugs).not.toContain(draftSlug);
  });
});

describe("GET /api/v1/library/articles", () => {
  it("serves a signed-out reader and carries the cursor in meta", async () => {
    const res = await listRoute(
      new NextRequest("http://localhost:3000/api/v1/library/articles?limit=1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; meta: { nextCursor: string | null } };
    expect(body.data).toHaveLength(1);
    expect(body.meta.nextCursor).toBeTruthy();
  });

  it("serves one article by slug and 404s a draft", async () => {
    const article = await prisma.article.findUnique({ where: { id: publishedId } });
    const ok = await detailRoute(
      new NextRequest(`http://localhost:3000/api/v1/library/articles/${article!.slug}`),
      { params: Promise.resolve({ idOrSlug: article!.slug }) },
    );
    expect(ok.status).toBe(200);

    const gone = await detailRoute(
      new NextRequest(`http://localhost:3000/api/v1/library/articles/${draftSlug}`),
      { params: Promise.resolve({ idOrSlug: draftSlug }) },
    );
    expect(gone.status).toBe(404);
  });
});

describe("admin articles resource", () => {
  const impl = resourceFor("articles");
  const actor = { id: "00000000-0000-7000-8000-000000000001", ip: "127.0.0.1" };
  const body = (slug: string) => ({
    slug,
    category: "GUIDE" as const,
    readMinutes: 5,
    authorName: "Ban biên tập",
    i18n: {
      vi: {
        title: "Bài viết quản trị",
        summary: "Tóm tắt",
        seoTitle: "SEO",
        seoDescription: "Mô tả",
        blocks: [{ type: "PARAGRAPH", text: "Nội dung" }],
      },
    },
  });

  it("creates as a draft, invisible to the library until published", async () => {
    const slug = `admin-art-${Date.now()}`;
    const created = (await impl.create(body(slug), actor, NOW)) as { id: string; status: string };
    expect(created.status).toBe("DRAFT");
    await expectAppError(getArticle(slug, "vi"), "NOT_FOUND");

    const published = (await impl.lifecycle!(
      created.id,
      "publish",
      { checklistConfirmed: true },
      actor,
      NOW,
    )) as { status: string; publishedAt: string | null };
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).toBeTruthy();
    const live = await getArticle(slug, "vi");
    expect(live.title).toBe("Bài viết quản trị");
  });

  it("refuses to publish without the checklist", async () => {
    const created = (await impl.create(body(`admin-art-nc-${Date.now()}`), actor, NOW)) as { id: string };
    await expectAppError(impl.lifecycle!(created.id, "publish", {}, actor, NOW), "RULE_VIOLATION");
  });

  it("keeps the original publishedAt across an unpublish and republish", async () => {
    const created = (await impl.create(body(`admin-art-rp-${Date.now()}`), actor, NOW)) as { id: string };
    const first = (await impl.lifecycle!(created.id, "publish", { checklistConfirmed: true }, actor, NOW)) as {
      publishedAt: string;
    };
    await impl.lifecycle!(created.id, "unpublish", {}, actor, NOW);
    const again = (await impl.lifecycle!(
      created.id,
      "publish",
      { checklistConfirmed: true },
      actor,
      new Date(NOW.getTime() + 86_400_000),
    )) as { publishedAt: string };
    expect(again.publishedAt).toBe(first.publishedAt);
  });

  it("rejects a block the renderer cannot draw", async () => {
    const bad = body(`admin-art-bad-${Date.now()}`);
    (bad.i18n.vi.blocks as unknown[]) = [{ type: "TEXT", md: "cú pháp cũ" }];
    await expectAppError(impl.create(bad, actor, NOW), "VALIDATION_ERROR");
  });
});
