"use client";

/**
 * INVEST sim, "Danh mục đầu tiên" (doc 04 §6). 12-turn portfolio game with
 * fictional assets. All numbers are simulated; this is not investment advice.
 */

import * as React from "react";
import { useParams } from "next/navigation";
import { SimFrame, KeyValueGrid } from "@/components/sim/SimFrame";
import { useSimSession } from "@/components/sim/useSimSession";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  LedgerTable,
  MoneyInput,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { formatBps, formatVnd } from "@/lib/format";

interface AssetView {
  key: string;
  label: string;
  class: string;
  feeBps: number;
  holdingVnd: string;
  returnHistoryBps: number[];
}

interface InvestView {
  turn: number;
  turns: number;
  turnLabel: string;
  cashVnd: string;
  assets: AssetView[];
  news: { key: string; label: string } | null;
  portfolioValueVnd: string;
  benchmarkValueVnd: string;
  valueHistory: string[];
  rebalanceFeeVnd: string;
  history: Array<{ turn: number; benchmarkValueVnd: string; portfolioValueVnd: string }>;
}

function hasAction(actions: Array<{ type: string }>, type: string): boolean {
  return actions.some((a) => a.type === type);
}

const RULE_MESSAGE: Record<string, string> = {
  BAD_ASSET: "Tài sản không tồn tại.",
  SELL_EXCEEDS_HOLDING: "Không thể bán nhiều hơn số đang nắm giữ.",
  INSUFFICIENT_CASH: "Không đủ tiền mặt cho các lệnh này.",
  BAD_CHOICE: "Lệnh không hợp lệ.",
  WRONG_PHASE: "Không thể đặt lệnh lúc này.",
};

/** Hand-rolled SVG line chart: portfolio value vs. the savings benchmark. */
function PortfolioChart({
  portfolio,
  benchmark,
}: {
  portfolio: number[];
  benchmark: number[];
}) {
  if (portfolio.length === 0) return null;
  const width = 480;
  const height = 160;
  const all = [...portfolio, ...benchmark];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const stepX = portfolio.length > 1 ? width / (portfolio.length - 1) : 0;

  const toPoints = (series: number[]) =>
    series.map((v, i) => `${i * stepX},${height - ((v - min) / span) * (height - 8) - 4}`).join(" ");

  return (
    <div className="scroll-x">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Biểu đồ giá trị danh mục so với gửi tiết kiệm"
        className="h-40 w-full min-w-[320px]"
      >
        <polyline points={toPoints(benchmark)} fill="none" style={{ stroke: "var(--color-ink-faint)" }} strokeWidth={1.5} strokeDasharray="4 3" />
        <polyline points={toPoints(portfolio)} fill="none" style={{ stroke: "var(--color-moss-400)" }} strokeWidth={2} />
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-ink-faint">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-moss-400)" }} /> Danh mục của bạn
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-ink-faint)" }} /> Gửi tiết kiệm (đối chiếu)
        </span>
      </div>
    </div>
  );
}

/** Asset classes arrive as engine enum names (doc 04 §6). */
const ASSET_CLASS_LABEL: Record<string, string> = {
  DEPOSIT: "Tiền gửi",
  BOND: "Trái phiếu",
  STOCK: "Cổ phiếu",
  CRYPTO: "Tiền mã hóa",
};

export default function InvestSimPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, isError, error, refetch, act, isActing, staleNotice, dismissStaleNotice, ruleCode } =
    useSimSession(sessionId);

  const view = session?.view as InvestView | undefined;
  const [buyAmounts, setBuyAmounts] = React.useState<Record<string, string>>({});
  const [sellAmounts, setSellAmounts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setBuyAmounts({});
    setSellAmounts({});
     
  }, [view?.turn]);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError) return <ErrorPanel error={error} onRetry={() => refetch()} />;
  if (!session || !view) return <EmptyState title="Không tìm thấy phiên mô phỏng" />;

  const availableActions = session.availableActions;
  const portfolioSeries = view.valueHistory.map((v) => Number(v));
  const benchmarkSeries = view.history.map((h) => Number(h.benchmarkValueVnd));

  function submitOrders() {
    const orders = view!.assets.flatMap((a) => {
      const out: Array<{ assetKey: string; action: "BUY" | "SELL"; amountVnd: string }> = [];
      const buy = buyAmounts[a.key];
      const sell = sellAmounts[a.key];
      if (buy && buy !== "0") out.push({ assetKey: a.key, action: "BUY", amountVnd: buy });
      if (sell && sell !== "0") out.push({ assetKey: a.key, action: "SELL", amountVnd: sell });
      return out;
    });
    act({ type: "REBALANCE", orders });
  }

  return (
    <SimFrame
      title="Danh mục đầu tiên"
      subtitle="Phân bổ vốn giữa các tài sản giả lập và theo dõi kết quả qua từng kỳ."
      turnLabel={`${view.turnLabel} ${view.turn}/${view.turns}`}
      session={session}
      staleNotice={staleNotice}
      onDismissStaleNotice={dismissStaleNotice}
      turnReport={session.turnReport ? <KeyValueGrid data={session.turnReport} /> : undefined}
    >
      <Alert tone="warning">
        Tất cả tài sản trong mô phỏng này là hư cấu. Đây không phải lời khuyên đầu tư thật.
      </Alert>

      {ruleCode && (
        <Alert tone="critical" title="Không thực hiện được">
          {RULE_MESSAGE[ruleCode] ?? ruleCode}
        </Alert>
      )}

      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>Tổng quan</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <LedgerLabel>Tiền mặt</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.cashVnd)}</div>
            </div>
            <div>
              <LedgerLabel>Giá trị danh mục</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.portfolioValueVnd)}</div>
            </div>
            <div>
              <LedgerLabel>So với gửi tiết kiệm</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.benchmarkValueVnd)}</div>
            </div>
            <div>
              <LedgerLabel>Phí mỗi lệnh</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.rebalanceFeeVnd)}</div>
            </div>
          </div>
          {view.news && (
            <p className="text-sm text-ink-soft">
              Tin tức kỳ này: <span className="text-ink">{view.news.label}</span>
            </p>
          )}
        </CardBody>
      </Card>

      {portfolioSeries.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle>Giá trị danh mục theo kỳ</SectionTitle>
            <PortfolioChart portfolio={portfolioSeries} benchmark={benchmarkSeries} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <SectionTitle>Tài sản</SectionTitle>
          <LedgerTable
            headers={["Tài sản", "Loại", "Phí", "Đang nắm giữ", "Lệnh mua", "Lệnh bán"]}
            align={["left", "left", "right", "right", "right", "right"]}
            rows={view.assets.map((a) => [
              a.label,
              <Chip key={`${a.key}-class`} tone="neutral">
                {ASSET_CLASS_LABEL[a.class] ?? a.class}
              </Chip>,
              formatBps(a.feeBps),
              formatVnd(a.holdingVnd),
              hasAction(availableActions, "REBALANCE") ? (
                <div key={`${a.key}-buy`} className="w-32">
                  <MoneyInput
                    value={buyAmounts[a.key] ?? ""}
                    onChange={(v) => setBuyAmounts((m) => ({ ...m, [a.key]: v }))}
                    disabled={isActing}
                  />
                </div>
              ) : (
                "-"
              ),
              hasAction(availableActions, "REBALANCE") ? (
                <div key={`${a.key}-sell`} className="w-32">
                  <MoneyInput
                    value={sellAmounts[a.key] ?? ""}
                    onChange={(v) => setSellAmounts((m) => ({ ...m, [a.key]: v }))}
                    disabled={isActing}
                  />
                </div>
              ) : (
                "-"
              ),
            ])}
          />
          {hasAction(availableActions, "REBALANCE") && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={submitOrders} loading={isActing} disabled={isActing}>
                Đặt lệnh
              </Button>
              <Button variant="secondary" disabled={isActing} onClick={() => act({ type: "REBALANCE", orders: [] })}>
                Giữ nguyên kỳ này
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </SimFrame>
  );
}
