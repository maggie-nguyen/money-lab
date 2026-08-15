"use client";

/**
 * LOANS sim, "Vay khôn ngoan" (doc 04 §3). Phases CHOOSE (compare and pick
 * an offer, or save cash and wait) → REPAY (pay each month until cleared).
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

const RULE_MESSAGE: Record<string, string> = {
  INSUFFICIENT_CASH: "Không đủ tiền mặt cho thao tác này.",
  EXTRA_TOO_SMALL: "Số tiền trả thêm phải từ 100.000 ₫ trở lên.",
  RESTRUCTURE_EXHAUSTED: "Bạn đã tái cơ cấu khoản vay một lần rồi.",
  BAD_CHOICE: "Lựa chọn không hợp lệ.",
  WRONG_PHASE: "Không thể thực hiện ở giai đoạn hiện tại.",
};

export default function LoansSimPage() {
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
  if (!session || !view) return <EmptyState title="Không tìm thấy phiên mô phỏng" />;

  const availableActions = session.availableActions;
  const progressPaid =
    view.loan && view.months > 0 ? Math.min(view.months, view.month) : 0;

  return (
    <SimFrame
      title="Vay khôn ngoan"
      subtitle="So sánh các khoản vay, chọn phương án và trả nợ đúng hạn."
      turnLabel={view.phase === "REPAY" ? `Tháng trả nợ ${view.month}/${view.months}` : "Chọn phương án"}
      session={session}
      staleNotice={staleNotice}
      onDismissStaleNotice={dismissStaleNotice}
      turnReport={session.turnReport ? <KeyValueGrid data={session.turnReport} /> : undefined}
    >
      {ruleCode && (
        <Alert tone="critical" title="Không thực hiện được">
          {RULE_MESSAGE[ruleCode] ?? ruleCode}
        </Alert>
      )}

      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>Mục tiêu</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <LedgerLabel>Món cần mua</LedgerLabel>
              <div className="mt-1 text-sm">{view.goal.label}</div>
            </div>
            <div>
              <LedgerLabel>Giá</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.goal.priceVnd)}</div>
            </div>
            <div>
              <LedgerLabel>Tiền mặt hiện có</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.cashVnd)}</div>
            </div>
            <div>
              <LedgerLabel>Ngân sách trả nợ mỗi tháng</LedgerLabel>
              <div className="figure mt-1 text-lg">{formatVnd(view.monthlyBudgetVnd)}</div>
            </div>
          </div>
          {view.lastEvent && (
            <p className="text-xs text-ink-faint">Sự kiện gần nhất: {view.lastEvent.label}</p>
          )}
        </CardBody>
      </Card>

      {view.loan && (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle>Khoản vay hiện tại</SectionTitle>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <LedgerLabel>Còn lại</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatVnd(view.loan.remainingVnd)}</div>
              </div>
              <div>
                <LedgerLabel>Trả hằng tháng</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatVnd(view.loan.monthlyPaymentVnd)}</div>
              </div>
              <div>
                <LedgerLabel>Lãi suất năm</LedgerLabel>
                <div className="figure mt-1 text-lg">{formatBps(view.loan.annualRateBps)}</div>
              </div>
              <div>
                <LedgerLabel>Số tháng còn lại</LedgerLabel>
                <div className="figure mt-1 text-lg">{view.loan.termMonthsLeft}</div>
              </div>
            </div>
            <div>
              <LedgerLabel>Tiến độ</LedgerLabel>
              <ProgressBar value={progressPaid} max={view.months} className="mt-1" />
            </div>
          </CardBody>
        </Card>
      )}

      {view.phase === "CHOOSE" && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle>So sánh các khoản vay</SectionTitle>
            <LedgerTable
              headers={["", "Gói vay", "Gốc", "Lãi suất năm", "Kỳ hạn", "Phí ban đầu", "Trả mỗi tháng", "Tổng chi phí"]}
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
                    aria-label={`Chọn ${o.label} để so sánh`}
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
                `${o.termMonths} tháng`,
                formatVnd(o.upfrontFeeVnd),
                o.monthlyPaymentVnd ? formatVnd(o.monthlyPaymentVnd) : "Bấm so sánh để xem",
                o.totalCostVnd ? formatVnd(o.totalCostVnd) : "Bấm so sánh để xem",
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
                  So sánh mục đã chọn
                </Button>
              )}
            </div>
            {hasAction(availableActions, "TAKE_LOAN") && (
              <div>
                <LedgerLabel>Chọn khoản vay</LedgerLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {view.offers.map((o) => (
                    <Button
                      key={o.key}
                      variant="secondary"
                      size="sm"
                      disabled={isActing}
                      onClick={() => act({ type: "TAKE_LOAN", offerKey: o.key })}
                    >
                      Vay {o.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {hasAction(availableActions, "PAY_CASH_WAIT") && (
              <div className="space-y-2 border-t border-rule pt-4">
                <LedgerLabel>Hoặc để dành tiền mặt rồi mua thẳng</LedgerLabel>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Số tháng chờ" htmlFor="wait-months">
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
                    Để dành và chờ
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
            <SectionTitle>Trả nợ tháng này</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {hasAction(availableActions, "PAY_SCHEDULED") && (
                <Button disabled={isActing} loading={isActing} onClick={() => act({ type: "PAY_SCHEDULED" })}>
                  Trả đúng lịch
                </Button>
              )}
              {hasAction(availableActions, "RESTRUCTURE") && (
                <Button
                  variant="secondary"
                  disabled={isActing}
                  onClick={() => act({ type: "RESTRUCTURE" })}
                >
                  Tái cơ cấu khoản vay
                </Button>
              )}
            </div>
            {hasAction(availableActions, "PAY_EXTRA") && (
              <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-4">
                <Field label="Trả thêm để giảm nợ gốc" htmlFor="extra-vnd">
                  <div className="w-48">
                    <MoneyInput id="extra-vnd" value={extraVnd} onChange={setExtraVnd} disabled={isActing} />
                  </div>
                </Field>
                <Button
                  variant="secondary"
                  disabled={isActing || !extraVnd}
                  onClick={() => act({ type: "PAY_EXTRA", extraVnd })}
                >
                  Trả thêm
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {view.history.length > 0 && (
        <Card>
          <CardBody>
            <SectionTitle>Lịch sử trả nợ</SectionTitle>
            <LedgerTable
              headers={["Tháng", "Hành động", "Trả", "Gốc còn lại"]}
              align={["left", "left", "right", "right"]}
              rows={view.history.map((h) => {
                const r = h as { month: number; action: string; paymentVnd?: string; remainingVnd?: string };
                return [r.month, r.action, r.paymentVnd ? formatVnd(r.paymentVnd) : "-", r.remainingVnd ? formatVnd(r.remainingVnd) : "-"];
              })}
            />
          </CardBody>
        </Card>
      )}
    </SimFrame>
  );
}
