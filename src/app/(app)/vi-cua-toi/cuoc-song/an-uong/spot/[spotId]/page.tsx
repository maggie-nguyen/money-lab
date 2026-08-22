"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import {
  Button,
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  LedgerLabel,
  MoneyInput,
  PageBackLink,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { formatDate, formatVnd } from "@/lib/format";

interface FoodReviewView {
  id: string;
  rating: number;
  body: string;
  priceVnd: string | null;
  authorName: string;
  createdAt: string;
}

interface FoodSpotDetail {
  id: string;
  name: string;
  address: string;
  avgPriceVnd: string | null;
  tags: string[];
  note: string;
  reviewCount: number;
  avgRating: number | null;
  clusterSlug: string;
  clusterName: string;
  reviews: FoodReviewView[];
}

export default function FoodSpotPage() {
  const t = useT();
  const params = useParams<{ spotId: string }>();
  const qc = useQueryClient();
  const [rating, setRating] = React.useState(5);
  const [body, setBody] = React.useState("");
  const [priceVnd, setPriceVnd] = React.useState("");

  const query = useQuery({
    queryKey: ["food", "spot", params.spotId],
    queryFn: () => api.get<FoodSpotDetail>(`/food/spots/${params.spotId}`),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      api.post<FoodReviewView>(`/food/spots/${params.spotId}`, {
        rating,
        body,
        ...(priceVnd ? { priceVnd } : {}),
      }),
    onSuccess: () => {
      setBody("");
      setPriceVnd("");
      void qc.invalidateQueries({ queryKey: ["food", "spot", params.spotId] });
    },
  });

  const spot = query.data;

  return (
    <div className="space-y-6">
      <PageBackLink
        href={spot ? `/vi-cua-toi/cuoc-song/an-uong/${spot.clusterSlug}` : "/vi-cua-toi/cuoc-song/an-uong"}
      >
        {spot?.clusterName ?? t("wallet.eat.backToMap")}
      </PageBackLink>
      <div>
        {query.isLoading ? (
          <Skeleton className="mt-4 h-10 w-64" />
        ) : spot ? (
          <>
            <h1 className="text-2xl">{spot.name}</h1>
            {spot.address && <p className="mt-1 text-sm text-ink-faint">{spot.address}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {spot.avgPriceVnd && (
                <Chip tone="moss">{formatVnd(spot.avgPriceVnd)}</Chip>
              )}
              {spot.avgRating != null && <Chip tone="caution">★ {spot.avgRating}</Chip>}
              {spot.tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </div>
            {spot.note && <p className="mt-3 text-sm text-ink-soft">{spot.note}</p>}
          </>
        ) : null}
      </div>

      {query.isError && <ErrorPanel error={query.error} onRetry={() => query.refetch()} />}

      <section>
        <LedgerLabel>{t("wallet.eat.reviewsTitle")}</LedgerLabel>
        {query.isLoading ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : !spot?.reviews.length ? (
          <EmptyState
            title={t("wallet.eat.noReviewsTitle")}
            description={t("wallet.eat.noReviewsDescription")}
          />
        ) : (
          <div className="mt-3 space-y-3">
            {spot.reviews.map((r) => (
              <Card key={r.id}>
                <CardBody className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{r.authorName}</span>
                    <span className="text-ink-faint">{formatDate(r.createdAt)}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <Chip tone="caution">{"★".repeat(r.rating)}</Chip>
                    {r.priceVnd && <span className="figure text-ink-soft">{formatVnd(r.priceVnd)}</span>}
                  </div>
                  <p className="text-sm text-ink-soft">{r.body}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <LedgerLabel>{t("wallet.eat.addReview")}</LedgerLabel>
        <Card className="mt-3">
          <CardBody className="space-y-4">
            <Field label={t("wallet.eat.rating")} htmlFor="rating">
              <Input
                id="rating"
                type="number"
                min={1}
                max={5}
                className="figure w-20"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              />
            </Field>
            <Field label={t("wallet.eat.reviewBody")} htmlFor="review-body">
              <Textarea
                id="review-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("wallet.eat.reviewPlaceholder")}
              />
            </Field>
            <Field label={t("wallet.eat.pricePaid")} htmlFor="price-paid" hint={t("wallet.eat.pricePaidHint")}>
              <MoneyInput id="price-paid" value={priceVnd} onChange={setPriceVnd} />
            </Field>
            <Button
              onClick={() => reviewMutation.mutate()}
              loading={reviewMutation.isPending}
              disabled={body.trim().length < 10}
            >
              {t("wallet.eat.submitReview")}
            </Button>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
