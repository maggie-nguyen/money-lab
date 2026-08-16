"use client";

/**
 * BUSINESS sim, "Quán nước của tôi" (doc 04 §5). One week = one turn: set
 * price and stock, optionally buy upgrades, then run the week.
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
  Field,
  Input,
  LedgerLabel,
  MoneyInput,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { formatVnd } from "@/lib/format";
import type { TranslateFn } from "@/lib/i18n";

interface UpgradeView {
  key: string;
  label: string;
  costVnd: string;
  owned: boolean;
}

interface BusinessView {
  week: number;
  weeks: number;
  cashVnd: string;
  product: { key: string; label: string; unitCostVnd: string };
  referencePriceVnd: string;
  fixedCostPerWeekVnd: string;
  upgrades: UpgradeView[];
  totalProfitVnd: string;
  history: Array<Record<string, unknown>>;
}

function hasAction(actions: Array<{ type: string }>, type: string): boolean {
  return actions.some((a) => a.type === type);
}

/** Hand-rolled SVG bar chart of profit per week. No chart library. */
function ProfitChart({ history, t }: { history: Array<Record<string, unknown>>; t: TranslateFn }) {
  const values = history.map((h) => Number(h.profitVnd ?? 0));
  if (values.length === 0) return null;
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const width = 480;
  const height = 160;
  const barGap = 6;
  const barWidth = Math.max(6, width / values.length - barGap);
  const midY = height / 2;

  return (
    <div className="scroll-x">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("sims.business.chartAria")}
        className="h-40 w-full min-w-[320px]"
      >
        <line x1={0} y1={midY} x2={width} y2={midY} style={{ stroke: "var(--color-rule-strong)" }} strokeWidth={1} />
        {values.map((v, i) => {
          const barHeight = (Math.abs(v) / maxAbs) * (midY - 8);
          const x = i * (barWidth + barGap);
          const y = v >= 0 ? midY - barHeight : midY;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, barHeight)}
              rx={2}
              style={{ fill: v >= 0 ? "var(--color-moss-400)" : "var(--color-critical)" }}
            >
              <title>{t("sims.business.weekBar", { week: i + 1, amount: formatVnd(String(v)) })}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

export default function BusinessSimPage() {
  const t = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, isError, error, refetch, act, isActing, staleNotice, dismissStaleNotice, ruleCode } =
    useSimSession(sessionId);

  const view = session?.view as BusinessView | undefined;
  const [priceVnd, setPriceVnd] = React.useState("");
  const [units, setUnits] = React.useState("");
  const [buyKeys, setBuyKeys] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (view) {
      setPriceVnd((p) => p || view.referencePriceVnd);
      setBuyKeys([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.week]);

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

  const ruleMessage: Record<string, string> = {
    INSUFFICIENT_CASH: t("sims.business.rules.INSUFFICIENT_CASH"),
    PRICE_OUT_OF_RANGE: t("sims.business.rules.PRICE_OUT_OF_RANGE"),
    STOCK_NEGATIVE: t("sims.business.rules.STOCK_NEGATIVE"),
    BAD_CHOICE: t("sims.rules.BAD_CHOICE"),
    WRONG_PHASE: t("sims.business.rules.WRONG_PHASE"),
  };

  return (
    <SimFrame
      title={t("sims.business.title")}
      subtitle={t("sims.business.subtitle")}
      turnLabel={t("sims.business.turnLabel", { week: view.week, weeks: view.weeks })}
      session={session}
      staleNotice={staleNotice}
      onDismissStaleNotice={dismissStaleNotice}
      turnReport={session.turnReport ? <KeyValueGrid data={session.turnReport} /> : undefined}
    >
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
              <LedgerLabel>{t("sims.business.totalProfit")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.totalProfitVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.business.unitCost")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.product.unitCostVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.business.fixedCost")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.fixedCostPerWeekVnd)}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      {view.history.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle>{t("sims.business.profitByWeek")}</SectionTitle>
            <ProfitChart history={view.history} t={t} />
          </CardBody>
        </Card>
      )}

      {hasAction(availableActions, "PLAN_WEEK") && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle>{t("sims.business.planWeek", { week: view.week })}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("sims.business.priceLabel")}
                htmlFor="price-vnd"
                hint={t("sims.business.priceHint", { price: formatVnd(view.referencePriceVnd) })}
              >
                <MoneyInput id="price-vnd" value={priceVnd} onChange={setPriceVnd} disabled={isActing} />
              </Field>
              <Field label={t("sims.business.unitsLabel")} htmlFor="units" hint={t("sims.business.unitsHint")}>
                <Input
                  id="units"
                  type="number"
                  min={0}
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  disabled={isActing}
                />
              </Field>
            </div>
            {view.upgrades.length > 0 && (
              <div>
                <LedgerLabel>{t("sims.business.upgrades")}</LedgerLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {view.upgrades.map((u) => (
                    <label
                      key={u.key}
                      className={`flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-sm ${
                        u.owned ? "border-rule bg-paper-sunken text-ink-faint" : "border-rule-strong"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isActing || u.owned}
                        checked={u.owned || buyKeys.includes(u.key)}
                        onChange={(e) =>
                          setBuyKeys((prev) => (e.target.checked ? [...prev, u.key] : prev.filter((k) => k !== u.key)))
                        }
                      />
                      <span>
                        {u.label}{" "}
                        {u.owned ? (
                          <Chip tone="positive">{t("sims.business.owned")}</Chip>
                        ) : (
                          <span className="figure">{formatVnd(u.costVnd)}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Button
              disabled={isActing || !units}
              loading={isActing}
              onClick={() =>
                act({
                  type: "PLAN_WEEK",
                  priceVnd,
                  unitsToStock: Number(units),
                  buyUpgradeKeys: buyKeys,
                })
              }
            >
              {t("sims.business.runWeek")}
            </Button>
          </CardBody>
        </Card>
      )}
    </SimFrame>
  );
}
