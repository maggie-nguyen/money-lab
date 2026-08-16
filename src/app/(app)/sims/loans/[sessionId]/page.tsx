"use client";

/**
 * LOANS sim, "Vay khôn ngoan" (doc 04 §3). Phases CHOOSE (compare and pick
 * an offer, or save cash and wait) → REPAY (pay each month until cleared).
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
  LedgerTable,
  MoneyInput,
  ProgressBar,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { formatBps, formatVnd } from "@/lib/format";

interface OfferView {
  key: string;
  label: string;
  principalVnd: string;
  annualRateBps: number;
  termMonths: number;
  method: "ANNUITY" | "DECLINING_BALANCE";
  upfrontFeeVnd: string;
  marketing?: string;
  monthlyPaymentVnd?: string;
  totalCostVnd?: string;
  effectiveAnnualRateBps?: number;
  redFlags?: string[];
}

interface LoansView {
  phase: "CHOOSE" | "REPAY" | "DONE";
  goal: { key: string; label: string; priceVnd: string };
  cashVnd: string;
  monthlyBudgetVnd: string;
  month: number;
  months: number;
  offers: OfferView[];
  loan?: {
    offerKey: string;
    remainingVnd: string;
    monthlyPaymentVnd: string;
    annualRateBps: number;
    termMonthsLeft: number;
    restructuresUsed: number;
  };
  lastEvent: { key: string; label: string } | null;
  history: Record<string, unknown>[];
}

function hasAction(actions: Array<{ type: string }>, type: string): boolean {
  return actions.some((a) => a.type === type);
}

export default function LoansSimPage() {
  const t = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, isError, error, refetch, act, isActing, staleNotice, dismissStaleNotice, ruleCode } =
    useSimSession(sessionId);

  const view = session?.view as LoansView | undefined;
  const [selected, setSelected] = React.useState<string[]>([]);
  const [extraVnd, setExtraVnd] = React.useState("");
  const [waitMonths, setWaitMonths] = React.useState("6");

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
  const progressPaid = view.loan && view.months > 0 ? Math.min(view.months, view.month) : 0;

  const ruleMessage: Record<string, string> = {
    INSUFFICIENT_CASH: t("sims.rules.INSUFFICIENT_CASH"),
    EXTRA_TOO_SMALL: t("sims.loans.rules.EXTRA_TOO_SMALL"),
    RESTRUCTURE_EXHAUSTED: t("sims.loans.rules.RESTRUCTURE_EXHAUSTED"),
    BAD_CHOICE: t("sims.rules.BAD_CHOICE"),
    WRONG_PHASE: t("sims.rules.WRONG_PHASE"),
  };

  return (
    <SimFrame
      title={t("sims.loans.title")}
      subtitle={t("sims.loans.subtitle")}
      turnLabel={
        view.phase === "REPAY"
          ? t("sims.loans.turnRepay", { month: view.month, months: view.months })
          : t("sims.loans.turnChoose")
      }
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
          <SectionTitle>{t("sims.loans.goal")}</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <LedgerLabel>{t("sims.loans.item")}</LedgerLabel>
              <div className="mt-1 text-sm">{view.goal.label}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.loans.price")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.goal.priceVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.loans.cashOnHand")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.cashVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.loans.monthlyBudget")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.monthlyBudgetVnd)}</div>
            </div>
          </div>
          {view.lastEvent && (
            <p className="text-xs text-ink-faint">{t("sims.loans.lastEvent", { label: view.lastEvent.label })}</p>
          )}
        </CardBody>
      </Card>

      {view.loan && (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle>{t("sims.loans.currentLoan")}</SectionTitle>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <LedgerLabel>{t("sims.loans.remaining")}</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatVnd(view.loan.remainingVnd)}</div>
              </div>
              <div>
                <LedgerLabel>{t("sims.loans.monthlyPayment")}</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatVnd(view.loan.monthlyPaymentVnd)}</div>
              </div>
              <div>
                <LedgerLabel>{t("sims.loans.annualRate")}</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatBps(view.loan.annualRateBps)}</div>
              </div>
              <div>
                <LedgerLabel>{t("sims.loans.monthsLeft")}</LedgerLabel>
                <div className="figure mt-1 text-lg">{view.loan.termMonthsLeft}</div>
              </div>
            </div>
            <div>
              <LedgerLabel>{t("sims.loans.progress")}</LedgerLabel>
              <ProgressBar value={progressPaid} max={view.months} className="mt-1" />
            </div>
          </CardBody>
        </Card>
      )}

      {view.phase === "CHOOSE" && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle>{t("sims.loans.compareTitle")}</SectionTitle>
            <LedgerTable
              headers={[
                "",
                t("sims.loans.col.offer"),
                t("sims.loans.col.principal"),
                t("sims.loans.col.rate"),
                t("sims.loans.col.term"),
                t("sims.loans.col.fee"),
                t("sims.loans.col.monthly"),
                t("sims.loans.col.total"),
              ]}
              align={["left", "left", "right", "right", "right", "right", "right", "right"]}
              rows={view.offers.map((o) => [
                hasAction(availableActions, "COMPARE") ? (
                  <input
                    key={o.key}
                    type="checkbox"
                    checked={selected.includes(o.key)}
                    onChange={(e) =>
                      setSelected((prev) => (e.target.checked ? [...prev, o.key] : prev.filter((k) => k !== o.key)))
                    }
                    aria-label={t("sims.loans.selectAria", { label: o.label })}
                  />
                ) : null,
                <div key={`${o.key}-label`}>
                  {o.label}
                  {o.marketing && <div className="text-xs text-caution">{o.marketing}</div>}
                  {o.redFlags && o.redFlags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {o.redFlags.map((rf) => (
                        <Chip key={rf} tone="critical">
                          {rf}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>,
                formatVnd(o.principalVnd),
                formatBps(o.annualRateBps),
                t("sims.loans.termMonths", { count: o.termMonths }),
                formatVnd(o.upfrontFeeVnd),
                o.monthlyPaymentVnd ? formatVnd(o.monthlyPaymentVnd) : t("sims.loans.compareToSee"),
                o.totalCostVnd ? formatVnd(o.totalCostVnd) : t("sims.loans.compareToSee"),
              ])}
            />
            <div className="flex flex-wrap gap-2">
              {hasAction(availableActions, "COMPARE") && (
                <Button
                  variant="secondary"
                  disabled={isActing || selected.length === 0}
                  loading={isActing}
                  onClick={() => act({ type: "COMPARE", offerKeys: selected })}
                >
                  {t("sims.loans.compareSelected")}
                </Button>
              )}
            </div>
            {hasAction(availableActions, "TAKE_LOAN") && (
              <div>
                <LedgerLabel>{t("sims.loans.pickLoan")}</LedgerLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {view.offers.map((o) => (
                    <Button
                      key={o.key}
                      variant="secondary"
                      size="sm"
                      disabled={isActing}
                      onClick={() => act({ type: "TAKE_LOAN", offerKey: o.key })}
                    >
                      {t("sims.loans.takeLoan", { label: o.label })}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {hasAction(availableActions, "PAY_CASH_WAIT") && (
              <div className="space-y-2 border-t border-rule pt-4">
                <LedgerLabel>{t("sims.loans.saveCash")}</LedgerLabel>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t("sims.loans.waitMonths")} htmlFor="wait-months">
                    <Input
                      id="wait-months"
                      type="number"
                      min={1}
                      max={24}
                      value={waitMonths}
                      onChange={(e) => setWaitMonths(e.target.value)}
                      className="w-28"
                      disabled={isActing}
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    disabled={isActing}
                    onClick={() => act({ type: "PAY_CASH_WAIT", months: Number(waitMonths) })}
                  >
                    {t("sims.loans.waitAndSave")}
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {view.phase === "REPAY" && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle>{t("sims.loans.repayTitle")}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {hasAction(availableActions, "PAY_SCHEDULED") && (
                <Button disabled={isActing} loading={isActing} onClick={() => act({ type: "PAY_SCHEDULED" })}>
                  {t("sims.loans.payScheduled")}
                </Button>
              )}
              {hasAction(availableActions, "RESTRUCTURE") && (
                <Button variant="secondary" disabled={isActing} onClick={() => act({ type: "RESTRUCTURE" })}>
                  {t("sims.loans.restructure")}
                </Button>
              )}
            </div>
            {hasAction(availableActions, "PAY_EXTRA") && (
              <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-4">
                <Field label={t("sims.loans.payExtraLabel")} htmlFor="extra-vnd">
                  <div className="w-48">
                    <MoneyInput id="extra-vnd" value={extraVnd} onChange={setExtraVnd} disabled={isActing} />
                  </div>
                </Field>
                <Button
                  variant="secondary"
                  disabled={isActing || !extraVnd}
                  onClick={() => act({ type: "PAY_EXTRA", extraVnd })}
                >
                  {t("sims.loans.payExtra")}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {view.history.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle>{t("sims.loans.history")}</SectionTitle>
            <LedgerTable
              headers={[
                t("sims.loans.col.month"),
                t("sims.loans.col.action"),
                t("sims.loans.col.paid"),
                t("sims.loans.col.principalLeft"),
              ]}
              align={["left", "left", "right", "right"]}
              rows={view.history.map((h) => {
                const r = h as { month: number; action: string; paymentVnd?: string; remainingVnd?: string };
                return [
                  r.month,
                  r.action,
                  r.paymentVnd ? formatVnd(r.paymentVnd) : "-",
                  r.remainingVnd ? formatVnd(r.remainingVnd) : "-",
                ];
              })}
            />
          </CardBody>
        </Card>
      )}
    </SimFrame>
  );
}
