"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import { Card, CardBody, Chip, EmptyState, ErrorPanel, LedgerLabel, PageBackLink, Skeleton } from "@/components/ui";
import { formatVnd } from "@/lib/format";

interface FoodSpotView {
  id: string;
  name: string;
  address: string;
  avgPriceVnd: string | null;
  tags: string[];
  note: string;
  reviewCount: number;
  avgRating: number | null;
}

interface ClusterPageData {
  cluster: { slug: string; name: string; description: string; city: string };
  spots: FoodSpotView[];
}

export default function FoodClusterPage() {
  const t = useT();
  const params = useParams<{ slug: string }>();
  const query = useQuery({
    queryKey: ["food", "cluster", params.slug],
    queryFn: () => api.get<ClusterPageData>(`/food/clusters/${params.slug}`),
  });

  const { cluster, spots } = query.data ?? { cluster: null, spots: [] };

  return (
    <div className="space-y-5">
      <PageBackLink href="/vi-cua-toi/cuoc-song/an-uong">{t("wallet.eat.backToAreas")}</PageBackLink>
      {cluster && (
        <div>
          <LedgerLabel>{cluster.city}</LedgerLabel>
          <h1 className="mt-1 text-2xl">{cluster.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{cluster.description}</p>
        </div>
      )}

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : spots.length === 0 ? (
        <EmptyState title={t("wallet.eat.noSpotsTitle")} description={t("wallet.eat.noSpotsDescription")} />
      ) : (
        <div className="space-y-3">
          {spots.map((s) => (
            <Link key={s.id} href={`/vi-cua-toi/cuoc-song/an-uong/spot/${s.id}`}>
              <Card className="transition-colors hover:bg-paper-sunken">
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold">{s.name}</h2>
                      {s.address && <p className="mt-0.5 text-xs text-ink-faint">{s.address}</p>}
                    </div>
                    {s.avgPriceVnd && (
                      <span className="figure text-sm text-moss-600">{formatVnd(s.avgPriceVnd)}</span>
                    )}
                  </div>
                  {s.note && <p className="mt-2 text-sm text-ink-soft">{s.note}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.tags.map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                    {s.avgRating != null && (
                      <Chip tone="caution">★ {s.avgRating}</Chip>
                    )}
                    <Chip tone="neutral">
                      {t("wallet.eat.reviewCount", { count: s.reviewCount })}
                    </Chip>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
