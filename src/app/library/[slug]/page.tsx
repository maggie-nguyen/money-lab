import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicChrome } from "@/components/PublicChrome";
import { LessonBlocks } from "@/components/lesson/Blocks";
import { Button, Card, CardBody, Chip, LedgerLabel } from "@/components/ui";
import { coverStyle } from "@/lib/cover";
import { CoverArt } from "@/components/art/CoverArt";
import type { Block, Locale } from "@/lib/types";
import { getArticle, publishedArticleSlugs } from "@/server/services/libraryService";
import { AppError } from "@/server/lib/errors";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";
import { intlLocale } from "@/lib/locale";

/** Prerender what exists at build time; anything newer renders on demand. */
export async function generateStaticParams() {
  try {
    const slugs = await publishedArticleSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

async function load(slug: string, locale: Locale) {
  try {
    return await getArticle(slug, locale);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const t = createT(locale);
  const article = await load(slug, locale);
  if (!article) return { title: t("article.notFound") };
  return {
    title: article.seoTitle,
    description: article.seoDescription,
    alternates: { canonical: `/library/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.seoTitle,
      description: article.seoDescription,
      publishedTime: article.publishedAt ?? undefined,
      ...(article.coverImageUrl ? { images: [article.coverImageUrl] } : {}),
    },
  };
}

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const t = createT(locale);
  const article = await load(slug, locale);
  if (!article) notFound();

  return (
    <PublicChrome>
      <article className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/library" className="text-sm text-moss-400 underline hover:text-moss-600">
          ← {t("nav.library")}
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <Chip>{t(`library.category.${article.category}`)}</Chip>
          <span>{t("common.readMinutes", { count: article.readMinutes })}</span>
          {article.publishedAt && <span>· {formatDate(article.publishedAt, locale)}</span>}
          <span>· {article.authorName}</span>
        </div>

        <h1 className="mt-4 text-4xl">{article.title}</h1>
        {article.summary && <p className="mt-4 text-lg text-ink-soft">{article.summary}</p>}

        <div
          className="mt-8 h-64 w-full overflow-hidden rounded-[var(--radius-card)]"
          style={article.coverImageUrl ? undefined : coverStyle(article.slug)}
        >
          {article.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverArt slug={article.slug} className="h-full w-full" />
          )}
        </div>

        <div className="mt-10">
          <LessonBlocks blocks={article.blocks as Block[]} />
        </div>

        {article.relatedCourse && (
          <div className="mt-12">
            <Card tone="ink">
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <LedgerLabel className="text-paper/70">{t("nav.courses")}</LedgerLabel>
                  <p className="mt-1 font-display text-lg text-paper">{article.relatedCourse.title}</p>
                </div>
                <Link href={`/course/${article.relatedCourse.slug}`}>
                  <Button variant="secondary">{t("nav.courses")}</Button>
                </Link>
              </CardBody>
            </Card>
          </div>
        )}

        {article.related.length > 0 && (
          <div className="mt-14 border-t border-rule pt-8">
            <LedgerLabel>{t("library.label")}</LedgerLabel>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {article.related.map((r) => (
                <Link key={r.id} href={`/library/${r.slug}`} className="group block">
                  <Card className="h-full">
                    <CardBody>
                      <span className="text-xs text-ink-faint">
                        {t(`library.category.${r.category}`)} · {t("common.minutes", { count: r.readMinutes })}
                      </span>
                      <h3 className="mt-1.5 text-base group-hover:underline">{r.title}</h3>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-14 rounded-[var(--radius-card)] border border-rule px-6 py-8 text-center">
          <h2 className="text-2xl">{t("landing.ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{t("landing.ctaBody")}</p>
          <div className="mt-5">
            <Link href="/signup">
              <Button size="lg">{t("landing.startFree")}</Button>
            </Link>
          </div>
        </div>
      </article>
    </PublicChrome>
  );
}
