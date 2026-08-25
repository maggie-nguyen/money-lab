import { z } from "zod";
import { prisma } from "@/server/db";
import { notFound } from "@/server/lib/errors";
import type { ArticleCategory, Locale, Prisma } from "@prisma/client";

/** Strip CHECK_QUESTION answers before they ever reach a reader (answers stay server-side). */
export function stripBlocks(blocks: unknown): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b) => {
    if (b && typeof b === "object" && (b as { type?: string }).type === "CHECK_QUESTION") {
      const block = b as { type: string; question?: Record<string, unknown> };
      if (block.question) {
        const { answerKey: _answerKey, explanation: _explanation, ...publicQ } = block.question;
        return { ...block, question: publicQ };
      }
    }
    return b;
  }) as unknown[];
}

/**
 * The article library - standalone reading that needs no account.
 *
 * An article is a lesson without progress, XP or a quiz, so it reuses the same
 * block union and the same renderer. Two rules hold at this boundary:
 *   1. Only PUBLISHED articles ever leave here, whoever is asking.
 *   2. CHECK_QUESTION blocks are dropped rather than stripped of their answer
 *      key, because there is no lesson-scoped grading endpoint behind them and
 *      a question nobody can answer is worse than no question.
 */

export const articleListQuery = z.object({
  category: z.enum(["GUIDE", "EXPLAINER", "NEWS", "STORY"]).optional(),
  courseId: z.string().max(64).optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export type ArticleListQuery = z.infer<typeof articleListQuery>;

type TranslationRow = {
  locale: Locale;
  title: string;
  summary: string;
  seoTitle: string;
  seoDescription: string;
  blocks: Prisma.JsonValue;
};

/** Requested locale, else vi, else whatever exists. */
function pickTr(trs: TranslationRow[], locale: Locale): { tr: TranslationRow; resolvedLocale: Locale } {
  const exact = trs.find((t) => t.locale === locale);
  if (exact) return { tr: exact, resolvedLocale: locale };
  const vi = trs.find((t) => t.locale === "vi");
  if (vi) return { tr: vi, resolvedLocale: "vi" };
  if (trs[0]) return { tr: trs[0], resolvedLocale: trs[0].locale };
  throw notFound("Translation");
}

/** Articles carry no quiz, so a check question here would be unanswerable. */
function readableBlocks(blocks: Prisma.JsonValue): unknown[] {
  return stripBlocks(blocks).filter(
    (b) => !(b && typeof b === "object" && (b as { type?: string }).type === "CHECK_QUESTION"),
  );
}

const summarySelect = {
  id: true,
  slug: true,
  category: true,
  coverImageUrl: true,
  readMinutes: true,
  publishedAt: true,
  authorName: true,
  translations: {
    select: {
      locale: true,
      title: true,
      summary: true,
      seoTitle: true,
      seoDescription: true,
      blocks: true,
    },
  },
} satisfies Prisma.ArticleSelect;

type ArticleRow = Prisma.ArticleGetPayload<{ select: typeof summarySelect }>;

export interface ArticleSummary {
  id: string;
  slug: string;
  category: ArticleCategory;
  coverImageUrl: string | null;
  readMinutes: number;
  publishedAt: string | null;
  authorName: string;
  title: string;
  summary: string;
  resolvedLocale: Locale;
}

function summaryDto(a: ArticleRow, locale: Locale): ArticleSummary {
  const { tr, resolvedLocale } = pickTr(a.translations, locale);
  return {
    id: a.id,
    slug: a.slug,
    category: a.category,
    coverImageUrl: a.coverImageUrl,
    readMinutes: a.readMinutes,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    authorName: a.authorName,
    title: tr.title,
    summary: tr.summary,
    resolvedLocale,
  };
}

/**
 * The cursor carries both sort keys, `<publishedAt ISO>_<id>`. Publication
 * dates are editorial and do not follow id order, so a cursor on id alone would
 * skip or repeat rows once an editor backdates an article.
 */
function encodeCursor(row: { publishedAt: Date | null; id: string }): string {
  return `${row.publishedAt?.toISOString() ?? ""}_${row.id}`;
}

function decodeCursor(cursor: string): { publishedAt: Date; id: string } | null {
  const at = cursor.indexOf("_");
  if (at <= 0) return null;
  const publishedAt = new Date(cursor.slice(0, at));
  const id = cursor.slice(at + 1);
  if (!id || Number.isNaN(publishedAt.getTime())) return null;
  return { publishedAt, id };
}

/** Newest first, keyset paginated. */
export async function listArticles(q: ArticleListQuery, locale: Locale) {
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const rows = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
      ...(q.category ? { category: q.category } : {}),
      ...(after
        ? {
            OR: [
              { publishedAt: { lt: after.publishedAt } },
              { publishedAt: after.publishedAt, id: { lt: after.id } },
            ],
          }
        : {}),
    },
    select: summarySelect,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
  });
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    data: page.map((a) => summaryDto(a, locale)),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

export interface ArticleDetail extends ArticleSummary {
  seoTitle: string;
  seoDescription: string;
  blocks: unknown[];
  related: ArticleSummary[];
}

export async function getArticle(
  idOrSlug: string,
  locale: Locale,
): Promise<ArticleDetail> {
  const article = await prisma.article.findFirst({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    select: summarySelect,
  });
  if (!article) throw notFound("Article");

  const { tr } = pickTr(article.translations, locale);
  const base = summaryDto(article, locale);

  // Up to three more to read: same category first, then anything else recent.
  const sameCategory = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
      category: article.category,
      id: { not: article.id },
    },
    select: summarySelect,
    orderBy: [{ publishedAt: "desc" }],
    take: 3,
  });
  let relatedRows = sameCategory;
  if (relatedRows.length < 3) {
    const fill = await prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: { not: null },
        id: { notIn: [article.id, ...relatedRows.map((r) => r.id)] },
      },
      select: summarySelect,
      orderBy: [{ publishedAt: "desc" }],
      take: 3 - relatedRows.length,
    });
    relatedRows = [...relatedRows, ...fill];
  }

  return {
    ...base,
    seoTitle: tr.seoTitle || tr.title,
    seoDescription: tr.seoDescription || tr.summary,
    blocks: readableBlocks(tr.blocks),
    related: relatedRows.map((r) => summaryDto(r, locale)),
  };
}

/** Slugs for generateStaticParams on /library/[slug]. */
/** Slug plus last change date, for the sitemap. Same filter as the slug list. */
export async function publishedArticleSitemapEntries(): Promise<
  Array<{ slug: string; updatedAt: Date }>
> {
  return prisma.article.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    select: { slug: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });
}

export async function publishedArticleSlugs(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    select: { slug: true },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });
  return rows.map((r) => r.slug);
}
