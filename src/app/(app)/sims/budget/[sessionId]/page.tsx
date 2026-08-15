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

const KIND_LABEL: Record<string, string> = { NEED: "Thiết yếu", WANT: "Mong muốn", SAVING: "Tiết kiệm" };

function hasAction(actions: Array<{ type: string }>, type: string): boolean {
  return actions.some((a) => a.type === type);
}

export default function BudgetSimPage() {
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
  if (!session || !view) return <EmptyState title="Không tìm thấy phiên mô phỏng" />;

  const availableActions = session.availableActions;
  const remainingRaw =
    view.phase === "ALLOCATE"
      ? BigInt(view.cashVnd) +
        BigInt(view.monthlyIncomeVnd) -
        view.categories.reduce((sum, cat) => sum + BigInt(draft[cat.key] || "0"), 0n)
      : null;

  const ruleMessage: Record<string, string> = {
    ALLOC_BELOW_MIN: "Khoản chi thiết yếu chưa đạt mức tối thiểu.",
    OVERSPEND_LIMIT: "Tổng phân bổ vượt quá số tiền bạn có trong tháng này.",
    EVENT_NOT_PENDING: "Sự kiện này không còn chờ xử lý.",
    BAD_CHOICE: "Lựa chọn không hợp lệ.",
    WRONG_PHASE: "Không thể thực hiện ở giai đoạn hiện tại.",
  };

  return (
    <SimFrame
      title="Tháng lương đầu tiên"
      subtitle="Phân bổ lương, xử lý sự kiện bất ngờ và giữ số dư dương qua từng tháng."
      turnLabel={`Tháng ${view.month}/${view.months}`}
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
                  Sự kiện trong tháng: {(session.turnReport as { events: { key: string }[] }).events.length}
                </p>
              )}
          </>
        ) : undefined
      }
    >
      {ruleCode && (
        <Alert tone="critical" title="Không thực hiện được">
          {ruleMessage[ruleCode] ?? ruleCode}
        </Alert>
      )}

      {view.hint && (
        <Alert tone="info">
          {view.hint === "hint_wants_high"
            ? "Bạn đang chi cho nhóm mong muốn hơn 30% thu nhập. Hãy cân nhắc giảm bớt."
            : view.hint === "hint_start_saving"
              ? "Bạn chưa có khoản tiết kiệm nào. Hãy dành một phần thu nhập cho tiết kiệm."
              : view.hint}
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
              <LedgerLabel>Tiết kiệm</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.savingsVnd)}</div>
            </div>
            <div>
              <LedgerLabel>Lương tháng</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.monthlyIncomeVnd)}</div>
            </div>
            {BigInt(view.carryoverExtraVnd) > 0n && (
              <div>
                <LedgerLabel>Nợ dồn từ tháng trước</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatVnd(view.carryoverExtraVnd)}</div>
              </div>
            )}
          </div>
          {view.fixedBills.length > 0 && (
            <div>
              <LedgerLabel>Hóa đơn cố định</LedgerLabel>
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
                    <LedgerLabel>Còn lại</LedgerLabel>
                    <div className={`figure text-lg ${remainingRaw < 0n ? "text-critical" : "text-ink"}`}>
                      {formatVnd(remainingRaw.toString())}
                    </div>
                  </div>
                )
              }
            >
              Phân bổ ngân sách
            </SectionTitle>
            <div className="space-y-3">
              {view.categories.map((cat) => (
                <div key={cat.key} className="grid grid-cols-1 gap-2 border-b border-rule pb-3 last:border-b-0 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label htmlFor={`cat-${cat.key}`} className="text-sm font-medium text-ink">
                      {cat.label}
                    </label>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {KIND_LABEL[cat.kind]}
                      {cat.kind === "NEED" ? `, tối thiểu ${formatVnd(cat.minVnd)}` : ""}, gợi ý {formatVnd(cat.recommendedVnd)}
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
                Chốt phân bổ
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      {view.phase === "EVENTS" && view.pendingEvents.length > 0 && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle>Sự kiện tháng này</SectionTitle>
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
            <SectionTitle>Kết thúc tháng</SectionTitle>
            <p className="text-sm text-ink-soft">
              Xem lại số dư rồi kết thúc tháng {view.month} để chuyển sang tháng tiếp theo.
            </p>
            <Button onClick={() => act({ type: "END_MONTH" })} loading={isActing} disabled={isActing}>
              Kết thúc tháng
            </Button>
          </CardBody>
        </Card>
      )}

      {view.history.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle>Lịch sử các tháng</SectionTitle>
            <LedgerTable
              headers={["Tháng", "Thu nhập", "Tiết kiệm", "Tiền mặt cuối tháng"]}
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
