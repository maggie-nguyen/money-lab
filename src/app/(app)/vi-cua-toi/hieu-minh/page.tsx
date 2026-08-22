"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import { Card, CardBody, Chip, EmptyState, ErrorPanel, LedgerLabel, PageBackLink, SectionContinueLink, Skeleton } from "@/components/ui";

const TOPICS = [
  { slug: "tam-li-chi-tieu-gioi-tre", key: "intro" },
  { slug: "fomo-va-tieu-dung", key: "fomo" },
  { slug: "mua-sam-giam-stress", key: "stress" },
  { slug: "the-tin-dung-lam-ban-tieu-nhieu-hon", key: "cards" },
  { slug: "yolo-va-chi-tieu", key: "yolo" },
] as const;

interface ArticleSummary {
  slug: string;
  title: string;
  summary: string;
  readMinutes: number;
}

export default function HieuMinhPage() {
  const t = useT();
  const query = useQuery({
    queryKey: ["library", "psychology"],
    queryFn: async () => {
      const articles = await api.get<ArticleSummary[]>("/library/articles", { limit: 50 });
      const slugs = new Set(TOPICS.map((x) => x.slug));
      return articles.filter((a) => slugs.has(a.slug as (typeof TOPICS)[number]["slug"]));
    },
  });

  const bySlug = new Map((query.data ?? []).map((a) => [a.slug, a]));

  return (
    <div className="space-y-6">
      <PageBackLink href="/vi-cua-toi">{t("wallet.back")}</PageBackLink>

      <header className="space-y-2">
        <LedgerLabel>{t("wallet.mind.label")}</LedgerLabel>
        <h1 className="font-display text-2xl font-semibold">{t("wallet.mind.title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{t("wallet.mind.intro")}</p>
      </header>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {TOPICS.map(({ slug, key }) => {
            const article = bySlug.get(slug);
            const card = (
              <Card className={`h-full ${article ? "transition-colors hover:bg-paper-sunken" : ""}`}>
                <CardBody className="space-y-2">
                  <Chip tone="moss">{t(`wallet.mind.topic.${key}.tag`)}</Chip>
                  <h2 className="text-base font-semibold">
                    {article?.title ?? t(`wallet.mind.topic.${key}.title`)}
                  </h2>
                  <p className="text-sm text-ink-soft">
                    {article?.summary ?? t(`wallet.mind.topic.${key}.teaser`)}
                  </p>
                  {article ? (
                    <span className="text-xs text-ink-faint">
                      {t("common.readMinutes", { count: article.readMinutes })}
                    </span>
                  ) : (
                    <Chip tone="neutral">{t("wallet.mind.comingSoon")}</Chip>
                  )}
                </CardBody>
              </Card>
            );
            return article ? (
              <Link key={slug} href={`/library/${slug}`}>
                {card}
              </Link>
            ) : (
              <div key={slug}>{card}</div>
            );
          })}
        </div>
      )}

      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 && (
        <EmptyState title={t("wallet.mind.emptyTitle")} description={t("wallet.mind.emptyDescription")} />
      )}

      <div className="rounded-[var(--radius-card)] border border-rule bg-paper-sunken px-4 py-3 text-sm text-ink-soft">
        {t("wallet.mind.reflectPrompt")}
      </div>

      <SectionContinueLink
        href="/vi-cua-toi/chia-vi"
        hint={t("wallet.mind.label")}
        label={t("wallet.mind.nextManage")}
      />
    </div>
  );
}
