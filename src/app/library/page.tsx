import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardBody, Chip, EmptyState, LedgerLabel } from "@/components/ui";
import { coverStyle } from "@/lib/cover";
import { CoverArt } from "@/components/art/CoverArt";
import { listArticles, type ArticleSummary } from "@/server/services/libraryService";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";
import { intlLocale } from "@/lib/locale";
import type { Locale } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createT(locale);
  return {
    title: t("library.metaTitle"),
    description: t("library.metaDescription"),
  };
}

const CATEGORY_ORDER = ["GUIDE", "EXPLAINER", "NEWS", "STORY"] as const;

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function ArticleCard({
  a,
  featured = false,
  locale,
  t,
}: {
  a: ArticleSummary;
  featured?: boolean;
  locale: Locale;
  t: ReturnType<typeof createT>;
}) {
  const categoryKey = `library.category.${a.category}`;
  return (
    <Link href={`/library/${a.slug}`} className="group block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <div
          className={featured ? "h-56 w-full sm:h-72" : "h-36 w-full"}
          style={a.coverImageUrl ? undefined : coverStyle(a.slug)}
        >
          {a.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverArt slug={a.slug} className="h-full w-full" />
          )}
        </div>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <Chip>{t(categoryKey)}</Chip>
            <span>{t("common.readMinutes", { count: a.readMinutes })}</span>
            {a.publishedAt && <span>· {formatDate(a.publishedAt, locale)}</span>}
          </div>
          <h2 className={featured ? "mt-3 text-2xl group-hover:underline" : "mt-2 text-base group-hover:underline"}>
            {a.title}
          </h2>
          {a.summary && (
            <p className={featured ? "mt-2 text-sm text-ink-soft" : "mt-1.5 line-clamp-3 text-sm text-ink-soft"}>
              {a.summary}
            </p>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

export default async function LibraryPage() {
  const locale = await getRequestLocale();
  const t = createT(locale);
  const { data } = await listArticles({ limit: 24 }, locale);
  const [lead, ...rest] = data;

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
        <LedgerLabel>{t("library.label")}</LedgerLabel>
        <h1 className="mt-3 max-w-3xl text-4xl">{t("library.title")}</h1>
        <p className="mt-4 max-w-2xl text-base text-ink-soft">{t("library.subtitle")}</p>

        {data.length === 0 ? (
          <div className="mt-10">
            <EmptyState title={t("library.emptyTitle")} description={t("library.emptyDescription")} />
          </div>
        ) : (
          <>
            {lead && (
              <div className="mt-10">
                <ArticleCard a={lead} featured locale={locale} t={t} />
              </div>
            )}

            {rest.length > 0 && (
              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <ArticleCard key={a.id} a={a} locale={locale} t={t} />
                ))}
              </div>
            )}

            <div className="mt-14 border-t border-rule pt-6">
              <LedgerLabel>{t("library.exploreTitle")}</LedgerLabel>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link
                  href="/food"
                  className="rounded-full border border-rule px-4 py-2 text-ink-soft transition-colors hover:border-moss-200 hover:text-moss-600"
                >
                  {t("library.exploreMap")}
                </Link>
                <Link
                  href="/wallet"
                  className="rounded-full border border-rule px-4 py-2 text-ink-soft transition-colors hover:border-moss-200 hover:text-moss-600"
                >
                  {t("library.exploreWallet")}
                </Link>
              </div>
            </div>

            <div className="mt-10 border-t border-rule pt-6">
              <LedgerLabel>{t("library.topics")}</LedgerLabel>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {CATEGORY_ORDER.filter((c) => data.some((a) => a.category === c)).map((c) => (
                  <span key={c} className="rounded-full border border-rule px-3 py-1 text-ink-soft">
                    {t(`library.category.${c}`)} · {data.filter((a) => a.category === c).length}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
  );
}
