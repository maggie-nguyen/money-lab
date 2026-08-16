"use client";

/**
 * Coin shop (doc 03 §6.5-6.6). Purchases are idempotent, invalidate the
 * bootstrap query so the header coin count updates, and surface a plain
 * "not enough coins" message on 422 INSUFFICIENT_COINS.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, idempotencyKey } from "@/lib/api";
import { BOOTSTRAP_KEY, useStats, useToast, useT } from "@/components/Providers";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Dialog,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  Skeleton,
  StatRows,
} from "@/components/ui";
import type { ShopItem, ShopView } from "@/lib/types";
import type { TranslateFn } from "@/lib/i18n";

/** Exactly what POST /shop/items/{id}/purchase returns. It sends no item object. */
interface PurchaseResult {
  purchaseId: string;
  itemCode: string;
  coins: number;
  streakFreezes?: number;
}

function purchaseErrorMessage(error: ApiError, t: TranslateFn): string {
  if (error.ruleCode === "INSUFFICIENT_COINS") return t("shop.error.insufficientCoins");
  if (error.status === 409) return t("shop.error.alreadyOwned");
  return error.message;
}

function ShopItemCard({
  item,
  onBuy,
  t,
}: {
  item: ShopItem;
  onBuy: (item: ShopItem) => void;
  t: TranslateFn;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{item.title}</h2>
          {item.owned && <Chip tone="positive">{t("shop.owned")}</Chip>}
        </div>
        {item.description && <p className="text-sm text-ink-soft">{item.description}</p>}
        {item.held > 0 && <p className="figure text-xs text-ink-faint">{t("shop.held", { count: item.held })}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="figure text-lg font-semibold">{t("shop.priceCoins", { count: item.priceCoins })}</span>
          <Button size="sm" disabled={item.owned} onClick={() => onBuy(item)}>
            {item.owned ? t("shop.bought") : t("shop.buy")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function ShopPage() {
  const stats = useStats();
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmItem, setConfirmItem] = React.useState<ShopItem | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["shop", "items"],
    queryFn: () => api.get<ShopView>("/shop/items"),
  });

  const purchase = useMutation({
    mutationFn: (item: ShopItem) =>
      api.post<PurchaseResult>(
        `/shop/items/${item.id}/purchase`,
        {},
        // Consumables can be bought more than once, so the key has to name the
        // copy rather than the item. A key of just the item id replays the first
        // purchase for the next 24 hours: the learner is told it worked, no coins
        // move and nothing is added. Counting the copies already held makes each
        // purchase its own request while still collapsing a double click.
        { idempotencyKey: idempotencyKey("shop", `${item.id}:${item.held}`) },
      ),
    onSuccess: (_result, item) => {
      void qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      void qc.invalidateQueries({ queryKey: ["shop", "items"] });
      toast({ tone: "positive", message: t("shop.purchasedToast", { title: item.title }) });
      setConfirmItem(null);
    },
  });

  const purchaseError = purchase.error instanceof ApiError ? purchase.error : null;
  const items = itemsQuery.data?.items ?? [];
  // The shop response carries the balance, which is fresher than the bootstrap copy.
  const coins = itemsQuery.data?.coins ?? stats?.coins ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <LedgerLabel>{t("shop.label")}</LedgerLabel>
          <h1 className="mt-1 text-2xl">{t("shop.title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("shop.subtitle")}</p>
        </div>
        <StatRows columns={1} className="min-w-52" items={[{ label: t("shop.coinsOnHand"), value: coins }]} />
      </div>

      {itemsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : itemsQuery.isError ? (
        <ErrorPanel error={itemsQuery.error} onRetry={() => itemsQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t("shop.emptyTitle")} description={t("shop.emptyDescription")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ShopItemCard
              key={item.id}
              item={item}
              t={t}
              onBuy={(it) => {
                purchase.reset();
                setConfirmItem(it);
              }}
            />
          ))}
        </div>
      )}

      <Dialog
        open={confirmItem !== null}
        onClose={() => {
          purchase.reset();
          setConfirmItem(null);
        }}
        title={t("shop.confirmTitle")}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                purchase.reset();
                setConfirmItem(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => confirmItem && purchase.mutate(confirmItem)}
              loading={purchase.isPending}
              disabled={purchase.isPending}
            >
              {t("shop.confirmBuy")}
            </Button>
          </>
        }
      >
        {confirmItem && (
          <div className="space-y-3 text-sm">
            <p>
              {t("shop.confirmBody", {
                coins: confirmItem.priceCoins,
                title: confirmItem.title,
              })}
            </p>
            <p className="text-ink-soft">
              {t("shop.coinsOnHand")}: <span className="figure">{coins}</span>
            </p>
            {purchaseError && <p className="text-critical">{purchaseErrorMessage(purchaseError, t)}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
