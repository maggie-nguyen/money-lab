"use client";

/**
 * INVEST sim, "Danh mục đầu tiên" (doc 04 §6). 12-turn portfolio game with
 * fictional assets. All numbers are simulated; this is not investment advice.
 */

import * as React from "react";
import { useParams } from "next/navigation";
import { SimFrame, KeyValueGrid } from "@/components/sim/SimFrame";
import { useSimSession } from "@/components/sim/useSimSession";
import { useT } from "@/components/Providers";
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
import type { TranslateFn } from "@/lib/i18n";

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

/** Hand-rolled SVG line chart: portfolio value vs. the savings benchmark. */
function PortfolioChart({
  portfolio,
  benchmark,
  t,
}: {
  portfolio: number[];
  benchmark: number[];
  t: TranslateFn;
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
        aria-label={t("sims.invest.chartAria")}
        className="h-40 w-full min-w-[320px]"
      >
        <polyline
          points={toPoints(benchmark)}
          fill="none"
          style={{ stroke: "var(--color-ink-faint)" }}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <polyline points={toPoints(portfolio)} fill="none" style={{ stroke: "var(--color-moss-400)" }} strokeWidth={2} />
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-ink-faint">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-moss-400)" }} />{" "}
          {t("sims.invest.legendPortfolio")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-ink-faint)" }} />{" "}
          {t("sims.invest.legendBenchmark")}
        </span>
      </div>
    </div>
  );
}

function assetClassLabel(cls: string, t: TranslateFn): string {
  const key = `sims.invest.class.${cls}`;
  const translated = t(key);
  return translated === key ? cls : translated;
}

export default function InvestSimPage() {
  const t = useT();
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
  if (!session || !view) return <EmptyState title={t("sims.sessionNotFound")} />;

  const availableActions = session.availableActions;
  const portfolioSeries = view.valueHistory.map((v) => Number(v));
  const benchmarkSeries = view.history.map((h) => Number(h.benchmarkValueVnd));

  const ruleMessage: Record<string, string> = {
    BAD_ASSET: t("sims.invest.rules.BAD_ASSET"),
    SELL_EXCEEDS_HOLDING: t("sims.invest.rules.SELL_EXCEEDS_HOLDING"),
    INSUFFICIENT_CASH: t("sims.invest.rules.INSUFFICIENT_CASH"),
    BAD_CHOICE: t("sims.invest.rules.BAD_CHOICE"),
    WRONG_PHASE: t("sims.invest.rules.WRONG_PHASE"),
  };

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
      title={t("sims.invest.title")}
      subtitle={t("sims.invest.subtitle")}
      turnLabel={`${view.turnLabel} ${view.turn}/${view.turns}`}
      session={session}
      staleNotice={staleNotice}
      onDismissStaleNotice={dismissStaleNotice}
      turnReport={session.turnReport ? <KeyValueGrid data={session.turnReport} /> : undefined}
    >
      <Alert tone="warning">{t("sims.invest.fictionWarning")}</Alert>

      {ruleCode && (
        <Alert tone="critical" title={t("sims.actionFailed")}>
          {ruleMessage[ruleCode] ?? ruleCode}
        </Alert>
      )}

      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>{t("sims.overview")}</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <LedgerLabel>{t("sims.cash")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.cashVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.invest.portfolioValue")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.portfolioValueVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.invest.vsSavings")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.benchmarkValueVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.invest.feePerOrder")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.rebalanceFeeVnd)}</div>
            </div>
          </div>
          {view.news && (
            <p className="text-sm text-ink-soft">
              {t("sims.invest.newsPrefix")} <span className="text-ink">{view.news.label}</span>
            </p>
          )}
        </CardBody>
      </Card>

      {portfolioSeries.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle>{t("sims.invest.valueByTurn")}</SectionTitle>
            <PortfolioChart portfolio={portfolioSeries} benchmark={benchmarkSeries} t={t} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <SectionTitle>{t("sims.invest.assets")}</SectionTitle>
          <LedgerTable
            headers={[
              t("sims.invest.col.asset"),
              t("sims.invest.col.class"),
              t("sims.invest.col.fee"),
              t("sims.invest.col.holding"),
              t("sims.invest.col.buy"),
              t("sims.invest.col.sell"),
            ]}
            align={["left", "left", "right", "right", "right", "right"]}
            rows={view.assets.map((a) => [
              a.label,
              <Chip key={`${a.key}-class`} tone="neutral">
                {assetClassLabel(a.class, t)}
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
                {t("sims.invest.placeOrders")}
              </Button>
              <Button variant="secondary" disabled={isActing} onClick={() => act({ type: "REBALANCE", orders: [] })}>
                {t("sims.invest.hold")}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </SimFrame>
  );
}
