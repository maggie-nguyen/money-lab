"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession, useT, useToast } from "@/components/Providers";
import { SpotDetailHero } from "@/components/map/SpotDetailHero";
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
  Skeleton,
  Textarea,
} from "@/components/ui";
import { formatDate, formatVnd } from "@/lib/format";
import { loginHref } from "@/lib/returnTo";

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
  googlePlaceId?: string | null;
  gallery?: string[];
}

export default function BanDoSpotPage() {
  const t = useT();
  const toast = useToast();
  const { bootstrap } = useSession();
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
        priceVnd,
      }),
    onSuccess: () => {
      setBody("");
      setPriceVnd("");
      toast({ tone: "positive", message: t("map.reviewSuccess") });
      void qc.invalidateQueries({ queryKey: ["food", "spot", params.spotId] });
      void qc.invalidateQueries({ queryKey: ["food", "map"] });
    },
  });

  const parsedPrice = Number(priceVnd);
  const canSubmitReview = body.trim().length >= 5 && Number.isFinite(parsedPrice) && parsedPrice >= 1;

  const spot = query.data;

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />;
  }

  if (!spot) return null;

  return (
    <div className="space-y-8">
      <SpotDetailHero
        name={spot.name}
        address={spot.address}
        avgPriceVnd={spot.avgPriceVnd}
        avgRating={spot.avgRating}
        tags={spot.tags}
        note={spot.note}
      />

      <section>
        <LedgerLabel>{t("map.communityPrices")}</LedgerLabel>
        <p className="mt-1 text-sm text-ink-soft">{t("map.communityPricesHint")}</p>
        {!spot.reviews.length ? (
          <EmptyState
            title={t("wallet.eat.noReviewsTitle")}
            description={t("wallet.eat.noReviewsDescription")}
          />
        ) : (
          <div className="mt-4 space-y-3">
            {spot.reviews.map((r) => (
              <Card key={r.id}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{r.authorName}</span>
                    <span className="text-xs text-ink-faint">{formatDate(r.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="caution">{"★".repeat(r.rating)}</Chip>
                    {r.priceVnd && (
                      <span className="figure text-sm font-semibold text-moss-700">
                        {t("map.paid")} {formatVnd(r.priceVnd)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-ink-soft">{r.body}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="review">
        <LedgerLabel>{t("wallet.eat.addReview")}</LedgerLabel>
        {!bootstrap ? (
          <Card className="mt-3">
            <CardBody className="space-y-3">
              <p className="text-sm text-ink-soft">{t("map.loginToReview")}</p>
              <Link href={loginHref(`/ban-do/spot/${params.spotId}#review`)}>
                <Button size="sm">{t("nav.signIn")}</Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <Card className="mt-3">
            <CardBody className="space-y-4">
              <p className="text-sm text-ink-soft">{t("map.reviewPrompt")}</p>
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
              <Field label={t("map.pricePaidLabel")} htmlFor="price-paid" hint={t("map.pricePaidHint")}>
                <MoneyInput id="price-paid" value={priceVnd} onChange={setPriceVnd} />
              </Field>
              <Button
                onClick={() => reviewMutation.mutate()}
                loading={reviewMutation.isPending}
                disabled={!canSubmitReview}
              >
                {t("wallet.eat.submitReview")}
              </Button>
            </CardBody>
          </Card>
        )}
      </section>
    </div>
  );
}
