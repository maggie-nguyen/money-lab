"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import { Card, CardBody, Chip, EmptyState, ErrorPanel, LedgerLabel, PageBackLink, SectionContinueLink, Skeleton } from "@/components/ui";

interface FoodClusterSummary {
  id: string;
  slug: string;
  city: string;
  name: string;
  description: string;
  spotCount: number;
}

export default function AnUongPage() {
  const t = useT();
  const query = useQuery({
    queryKey: ["food", "clusters"],
    queryFn: () => api.get<FoodClusterSummary[]>("/food/clusters"),
  });

  return (
    <div className="space-y-5">
      <PageBackLink href="/vi-cua-toi/cuoc-song">{t("wallet.eat.backToMap")}</PageBackLink>
      <div>
        <LedgerLabel>{t("wallet.eat.label")}</LedgerLabel>
        <h1 className="mt-1 text-2xl">{t("wallet.life.food.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">{t("wallet.eat.subtitle")}</p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState title={t("wallet.eat.emptyTitle")} description={t("wallet.eat.emptyDescription")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {query.data.map((c) => (
            <Link key={c.id} href={`/vi-cua-toi/cuoc-song/an-uong/${c.slug}`}>
              <Card className="h-full transition-colors hover:bg-paper-sunken">
                <CardBody>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Chip tone="moss">{c.city}</Chip>
                    <span className="text-ink-faint">
                      {t("wallet.eat.spotCount", { count: c.spotCount })}
                    </span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold">{c.name}</h2>
                  <p className="mt-1 line-clamp-3 text-sm text-ink-soft">{c.description}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <SectionContinueLink
        href="/vi-cua-toi/thu-thach"
        label={t("wallet.life.nextHabits")}
      />
    </div>
  );
}
