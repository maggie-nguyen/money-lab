"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import {
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  PageBackLink,
  SectionContinueLink,
  Skeleton,
} from "@/components/ui";

interface ArticleSummary {
  slug: string;
  title: string;
  summary: string;
  readMinutes: number;
  category: string;
}

export default function HieuMinhPage() {
  const t = useT();
  const query = useQuery({
    queryKey: ["library", "psychology", "explainer"],
    queryFn: () =>
      api.get<ArticleSummary[]>("/library/articles", {
        category: "EXPLAINER",
        limit: 50,
      }),
  });

  const articles = query.data ?? [];

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
      ) : articles.length === 0 ? (
        <EmptyState title={t("wallet.mind.emptyTitle")} description={t("wallet.mind.emptyDescription")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {articles.map((article) => (
            <Link key={article.slug} href={`/library/${article.slug}`} className="group block">
              <Card className="h-full transition-colors hover:bg-paper-sunken">
                <CardBody className="space-y-2">
                  <Chip tone="moss">{t(`library.category.${article.category}`)}</Chip>
                  <h2 className="text-base font-semibold group-hover:underline">{article.title}</h2>
                  {article.summary && <p className="text-sm text-ink-soft">{article.summary}</p>}
                  <span className="text-xs text-ink-faint">
                    {t("common.readMinutes", { count: article.readMinutes })}
                  </span>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!query.isLoading && !query.isError && articles.length > 0 && (
        <p className="text-sm text-ink-soft">
          {t("wallet.mind.libraryLinkPrefix")}{" "}
          <Link href="/library" className="font-medium text-moss-700 underline">
            {t("library.label")}
          </Link>
        </p>
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
