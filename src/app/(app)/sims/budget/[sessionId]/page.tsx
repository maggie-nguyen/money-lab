"use client";

/**
 * BUDGET sim, "Tháng lương đầu tiên" (doc 04 §2). One month = one turn,
 * three phases: ALLOCATE (set category envelopes) → EVENTS (resolve any
 * drawn events) → REVIEW (end the month and see the report).
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
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  LedgerTable,
  MoneyInput,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { formatVnd } from "@/lib/format";

interface BudgetCategoryView {
  key: string;
  label: string;
  kind: "NEED" | "WANT" | "SAVING";
  minVnd: string;
  recommendedVnd: string;
  allocatedVnd: string;
}

interface BudgetEventChoiceView {
  key: string;
  label: string;
}

interface BudgetPendingEventView {
  key: string;
  label: string;
  amountVnd: string;
  choices: BudgetEventChoiceView[];
}

interface BudgetView {
  month: number;
  months: number;
  phase: "ALLOCATE" | "EVENTS" | "REVIEW";
  cashVnd: string;
  savingsVnd: string;
  monthlyIncomeVnd: string;
  fixedBills: Array<{ key: string; label: string; amountVnd: string }>;
  categories: BudgetCategoryView[];
  carryoverExtraVnd: string;
  pendingEvents: BudgetPendingEventView[];
  resolvedEvents: Array<{ key: string; choiceKey: string | null; cashDelta: string | number }>;
  history: Record<string, unknown>[];
  hint: string | null;
}

function hasAction(actions: Array<{ type: string }>, type: string): boolean {
  return actions.some((a) => a.type === type);
}

export default function BudgetSimPage() {
  const t = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, isError, error, refetch, act, isActing, staleNotice, dismissStaleNotice, ruleCode } =
    useSimSession(sessionId);

  const view = session?.view as BudgetView | undefined;
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (view?.phase === "ALLOCATE") {
      const next: Record<string, string> = {};
      for (const cat of view.categories) next[cat.key] = cat.allocatedVnd !== "0" ? cat.allocatedVnd : cat.recommendedVnd;
      setDraft(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.phase, view?.month]);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError) return <ErrorPanel error={error} onRetry={() => refetch()} />;
  if (!session || !view) return <EmptyState title={t("sims.sessionNotFound")} />;

  const availableActions = session.availableActions;
  const remainingRaw =
    view.phase === "ALLOCATE"
      ? BigInt(view.cashVnd) +
        BigInt(view.monthlyIncomeVnd) -
        view.categories.reduce((sum, cat) => sum + BigInt(draft[cat.key] || "0"), 0n)
      : null;

  const ruleMessage: Record<string, string> = {
    ALLOC_BELOW_MIN: t("sims.budget.rules.ALLOC_BELOW_MIN"),
    OVERSPEND_LIMIT: t("sims.budget.rules.OVERSPEND_LIMIT"),
    EVENT_NOT_PENDING: t("sims.budget.rules.EVENT_NOT_PENDING"),
    BAD_CHOICE: t("sims.rules.BAD_CHOICE"),
    WRONG_PHASE: t("sims.rules.WRONG_PHASE"),
  };

  const kindLabel = (kind: string) => {
    if (kind === "NEED") return t("sims.budget.kind.NEED");
    if (kind === "WANT") return t("sims.budget.kind.WANT");
    if (kind === "SAVING") return t("sims.budget.kind.SAVING");
    return kind;
  };

  return (
    <SimFrame
      title={t("sims.budget.title")}
      subtitle={t("sims.budget.subtitle")}
      turnLabel={t("sims.budget.turnLabel", { month: view.month, months: view.months })}
      session={session}
      staleNotice={staleNotice}
      onDismissStaleNotice={dismissStaleNotice}
      turnReport={
        session.turnReport ? (
          <>
            <KeyValueGrid data={session.turnReport} />
            {Array.isArray((session.turnReport as { events?: unknown[] }).events) &&
              (session.turnReport as { events: unknown[] }).events.length > 0 && (
                <p className="text-xs text-ink-faint">
                  {t("sims.budget.eventsInMonth", {
                    count: (session.turnReport as { events: { key: string }[] }).events.length,
                  })}
                </p>
              )}
          </>
        ) : undefined
      }
    >
      {ruleCode && (
        <Alert tone="critical" title={t("sims.actionFailed")}>
          {ruleMessage[ruleCode] ?? ruleCode}
        </Alert>
      )}

      {view.hint && (
        <Alert tone="info">
          {view.hint === "hint_wants_high"
            ? t("sims.budget.hintWantsHigh")
            : view.hint === "hint_start_saving"
              ? t("sims.budget.hintStartSaving")
              : view.hint}
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
              <LedgerLabel>{t("sims.budget.savings")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.savingsVnd)}</div>
            </div>
            <div>
              <LedgerLabel>{t("sims.budget.monthlyIncome")}</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.monthlyIncomeVnd)}</div>
            </div>
            {BigInt(view.carryoverExtraVnd) > 0n && (
              <div>
                <LedgerLabel>{t("sims.budget.carryover")}</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatVnd(view.carryoverExtraVnd)}</div>
              </div>
            )}
          </div>
          {view.fixedBills.length > 0 && (
            <div>
              <LedgerLabel>{t("sims.budget.fixedBills")}</LedgerLabel>
              <ul className="mt-1 space-y-0.5 text-sm">
                {view.fixedBills.map((b) => (
                  <li key={b.key} className="flex justify-between">
                    <span className="text-ink-soft">{b.label}</span>
                    <span className="figure">{formatVnd(b.amountVnd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      {view.phase === "ALLOCATE" && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle
              action={
                remainingRaw !== null && (
                  <div className="text-right">
                    <LedgerLabel>{t("sims.budget.remaining")}</LedgerLabel>
                    <div className={`figure text-lg ${remainingRaw < 0n ? "text-critical" : "text-ink"}`}>
                      {formatVnd(remainingRaw.toString())}
                    </div>
                  </div>
                )
              }
            >
              {t("sims.budget.allocate")}
            </SectionTitle>
            <div className="space-y-3">
              {view.categories.map((cat) => (
                <div key={cat.key} className="grid grid-cols-1 gap-2 border-b border-rule pb-3 last:border-b-0 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label htmlFor={`cat-${cat.key}`} className="text-sm font-medium text-ink">
                      {cat.label}
                    </label>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {cat.kind === "NEED"
                        ? t("sims.budget.catMetaMin", {
                            kind: kindLabel(cat.kind),
                            min: formatVnd(cat.minVnd),
                            recommended: formatVnd(cat.recommendedVnd),
                          })
                        : t("sims.budget.catMeta", {
                            kind: kindLabel(cat.kind),
                            recommended: formatVnd(cat.recommendedVnd),
                          })}
                    </p>
                  </div>
                  <div className="w-full sm:w-48">
                    <MoneyInput
                      id={`cat-${cat.key}`}
                      value={draft[cat.key] ?? "0"}
                      onChange={(digits) => setDraft((d) => ({ ...d, [cat.key]: digits }))}
                      disabled={isActing}
                    />
                  </div>
                </div>
              ))}
            </div>
            {hasAction(availableActions, "SET_ALLOCATIONS") && (
              <Button
                onClick={() => act({ type: "SET_ALLOCATIONS", allocations: draft })}
                loading={isActing}
                disabled={isActing}
              >
                {t("sims.budget.confirmAlloc")}
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      {view.phase === "EVENTS" && view.pendingEvents.length > 0 && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle>{t("sims.budget.eventsTitle")}</SectionTitle>
            {view.pendingEvents.map((evt) => (
              <div key={evt.key} className="space-y-2 border-b border-rule pb-4 last:border-b-0">
                <p className="text-sm text-ink">
                  {evt.label} {evt.amountVnd !== "0" && <span className="figure">({formatVnd(evt.amountVnd)})</span>}
                </p>
                {hasAction(availableActions, "RESOLVE_EVENT") && (
                  <div className="flex flex-wrap gap-2">
                    {evt.choices.map((ch) => (
                      <Button
                        key={ch.key}
                        variant="secondary"
                        size="sm"
                        disabled={isActing}
                        onClick={() => act({ type: "RESOLVE_EVENT", eventKey: evt.key, choiceKey: ch.key })}
                      >
                        {ch.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {view.phase === "REVIEW" && hasAction(availableActions, "END_MONTH") && (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle>{t("sims.budget.endMonthTitle")}</SectionTitle>
            <p className="text-sm text-ink-soft">{t("sims.budget.endMonthBody", { month: view.month })}</p>
            <Button onClick={() => act({ type: "END_MONTH" })} loading={isActing} disabled={isActing}>
              {t("sims.budget.endMonth")}
            </Button>
          </CardBody>
        </Card>
      )}

      {view.history.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle>{t("sims.budget.history")}</SectionTitle>
            <LedgerTable
              headers={[
                t("sims.budget.col.month"),
                t("sims.budget.col.income"),
                t("sims.budget.col.savings"),
                t("sims.budget.col.cashEnd"),
              ]}
              align={["left", "right", "right", "right"]}
              rows={view.history.map((h) => {
                const r = h as { month: number; incomeVnd: string; savedVnd: string; cashEndVnd: string };
                return [r.month, formatVnd(r.incomeVnd), formatVnd(r.savedVnd), formatVnd(r.cashEndVnd)];
              })}
            />
          </CardBody>
        </Card>
      )}
    </SimFrame>
  );
}
