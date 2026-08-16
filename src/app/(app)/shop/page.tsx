"use client";

/**
 * Coin shop (doc 03 §6.5-6.6). Purchases are idempotent, invalidate the
 * bootstrap query so the header coin count updates, and surface a plain
 * "not enough coins" message on 422 INSUFFICIENT_COINS.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, idempotencyKey } from "@/lib/api";
import { BOOTSTRAP_KEY, useStats, useToast } from "@/components/Providers";
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

/** Exactly what POST /shop/items/{id}/purchase returns. It sends no item object. */
interface PurchaseResult {
  purchaseId: string;
  itemCode: string;
  coins: number;
  streakFreezes?: number;
}

function purchaseErrorMessage(error: ApiError): string {
  if (error.ruleCode === "INSUFFICIENT_COINS") return "Bạn không đủ xu để mua vật phẩm này.";
  if (error.status === 409) return "Bạn đã sở hữu vật phẩm này rồi.";
  return error.message;
}

function ShopItemCard({ item, onBuy }: { item: ShopItem; onBuy: (item: ShopItem) => void }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{item.title}</h2>
          {item.owned && <Chip tone="positive">Đã sở hữu</Chip>}
        </div>
        {item.description && <p className="text-sm text-ink-soft">{item.description}</p>}
        {item.held > 0 && (
          <p className="figure text-xs text-ink-faint">Đang có: {item.held}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="figure text-lg font-semibold">{item.priceCoins} xu</span>
          <Button size="sm" disabled={item.owned} onClick={() => onBuy(item)}>
            {item.owned ? "Đã mua" : "Mua"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function ShopPage() {
  const stats = useStats();
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
      toast({ tone: "positive", message: `Đã mua ${item.title}.` });
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
          <LedgerLabel>Cửa hàng</LedgerLabel>
          <h1 className="mt-1 text-2xl">Đổi xu lấy vật phẩm</h1>
          <p className="mt-1 text-sm text-ink-soft">Dùng xu kiếm được từ học tập để đổi lấy vật phẩm trong MoneyLab.</p>
        </div>
        <StatRows columns={1} className="min-w-52" items={[{ label: "Số xu hiện có", value: coins }]} />
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
        <EmptyState title="Cửa hàng chưa có vật phẩm nào" description="Quay lại sau khi có vật phẩm mới." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ShopItemCard
              key={item.id}
              item={item}
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
        title="Xác nhận mua"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                purchase.reset();
                setConfirmItem(null);
              }}
            >
              Hủy
            </Button>
            <Button
              onClick={() => confirmItem && purchase.mutate(confirmItem)}
              loading={purchase.isPending}
              disabled={purchase.isPending}
            >
              Xác nhận mua
            </Button>
          </>
        }
      >
        {confirmItem && (
          <div className="space-y-3 text-sm">
            <p>
              Bạn sắp đổi <span className="font-medium">{confirmItem.priceCoins} xu</span> để nhận{" "}
              <span className="font-medium">{confirmItem.title}</span>.
            </p>
            <p className="text-ink-soft">
              Số xu hiện có: <span className="figure">{coins}</span>
            </p>
            {purchaseError && <p className="text-critical">{purchaseErrorMessage(purchaseError)}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
