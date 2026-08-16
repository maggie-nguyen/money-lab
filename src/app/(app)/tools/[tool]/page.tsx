"use client";

/**
 * Finance calculators (doc 03 §8). Every number in the results comes back
 * from the server; the browser only collects inputs and displays outputs.
 * `annualRateBps` is a rate the learner types as a percent (e.g. "12" for
 * 12% một năm); converting that to basis points is a unit change, not money math.
 */

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  LedgerLabel,
  LedgerTable,
  MoneyInput,
  Select,
  MoneyReadout,
  StatRows,
} from "@/components/ui";
import { formatDate, formatVnd } from "@/lib/format";

/* ------------------------------------------------------------- Response DTOs (doc 03 §8) */

interface CompoundInterestData {
  finalAmountVnd: string;
  totalContributedVnd: string;
  totalInterestVnd: string;
  yearly: Array<{ year: number; balanceVnd: string }>;
}

interface LoanScheduleRow {
  month: number;
  paymentVnd: string;
  principalVnd: string;
  interestVnd: string;
  remainingVnd: string;
}

interface LoanPaymentData {
  monthlyPaymentVnd: string;
  totalPaidVnd: string;
  totalInterestVnd: string;
  schedule: LoanScheduleRow[];
  scheduleTruncated: boolean;
}

interface LoanCompareRow {
  name: string;
  principalVnd: string;
  annualRateBps: number;
  termMonths: number;
  method: "ANNUITY" | "DECLINING_BALANCE";
  monthlyPaymentVnd: string;
  totalPaidVnd: string;
  totalInterestVnd: string;
  totalInterestDeltaVsCheapestVnd: string;
}

interface LoanCompareData {
  loans: LoanCompareRow[];
  cheapestByTotal: string;
  note: string;
}

interface SavingsGoalData {
  monthsNeeded: number;
  achievedDate: string;
}

interface InflationData {
  futureValueOfCashVnd: string;
  equivalentPurchasingPowerVnd: string;
}

interface BudgetSplitData {
  needsVnd: string;
  wantsVnd: string;
  savingsVnd: string;
}

interface ToolMeta {
  formula: string;
}

/* -------------------------------------------------------------------- Shared bits */

function toBps(percent: string): number {
  const n = Number(percent.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function RateField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint="Lãi suất theo năm, ví dụ 12 nghĩa là 12% một năm.">
      <div className="relative">
        <Input
          id={id}
          className="figure pr-8 text-right"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">%</span>
      </div>
    </Field>
  );
}

function FormulaNote({ meta }: { meta: ToolMeta | undefined }) {
  if (!meta?.formula) return null;
  return (
    <Card tone="flat">
      <CardBody className="space-y-1">
        <LedgerLabel>Công thức</LedgerLabel>
        <p className="text-sm text-ink-soft">{meta.formula}</p>
      </CardBody>
    </Card>
  );
}

/**
 * Initial field value, taken from the query string when a lesson sent the
 * learner here with presets (a CALCULATOR block, doc 05 §3). Anything that is
 * not a plain number is ignored, so a hand-edited URL cannot put the form into
 * a state the tool endpoints would reject.
 */
function usePreset(name: string, fallback: string): string {
  const sp = useSearchParams();
  const raw = sp.get(name);
  return raw !== null && /^\d{1,15}$/.test(raw) ? raw : fallback;
}

function ToolError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? error.ruleCode === "UNREACHABLE"
        ? "Với mức góp và lãi suất này, không bao giờ đạt được mục tiêu. Hãy tăng khoản góp hoặc lãi suất."
        : error.message
      : "Không tính được kết quả. Vui lòng thử lại.";
  return (
    <Alert tone="critical" title="Không tính được">
      {message}
    </Alert>
  );
}

/* ----------------------------------------------------------- Compound interest (8.1) */

function CompoundInterestTool() {
  const [principalVnd, setPrincipalVnd] = React.useState(usePreset("principalVnd", "10000000"));
  const [contributionVnd, setContributionVnd] = React.useState(usePreset("contributionVnd", "500000"));
  const [ratePercent, setRatePercent] = React.useState(usePreset("ratePercent", "6"));
  const [compounding, setCompounding] = React.useState<"MONTHLY" | "QUARTERLY" | "ANNUALLY">("MONTHLY");
  const [years, setYears] = React.useState(usePreset("years", "10"));

  const mutation = useMutation({
    mutationFn: () =>
      api.postWithMeta<CompoundInterestData, ToolMeta>("/tools/compound-interest", {
        principalVnd: principalVnd || "0",
        monthlyContributionVnd: contributionVnd || "0",
        annualRateBps: toBps(ratePercent),
        compounding,
        years: Number(years) || 1,
      }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <Field label="Số tiền gốc ban đầu" htmlFor="principal">
            <MoneyInput id="principal" value={principalVnd} onChange={setPrincipalVnd} />
          </Field>
          <Field label="Góp thêm mỗi tháng" htmlFor="contribution" hint="Để trống nếu không góp thêm.">
            <MoneyInput id="contribution" value={contributionVnd} onChange={setContributionVnd} />
          </Field>
          <RateField id="rate" label="Lãi suất mỗi năm" value={ratePercent} onChange={setRatePercent} />
          <Field label="Kỳ ghép lãi" htmlFor="compounding">
            <Select id="compounding" value={compounding} onChange={(e) => setCompounding(e.target.value as typeof compounding)}>
              <option value="MONTHLY">Hàng tháng</option>
              <option value="QUARTERLY">Hàng quý</option>
              <option value="ANNUALLY">Hàng năm</option>
            </Select>
          </Field>
          <Field label="Số năm" htmlFor="years">
            <Input id="years" className="figure" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            Tính lãi kép
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <MoneyReadout
              items={[
                { label: "Số dư cuối kỳ", vnd: mutation.data.data.finalAmountVnd, primary: true },
                { label: "Tổng đã góp", vnd: mutation.data.data.totalContributedVnd },
                { label: "Tổng tiền lãi", vnd: mutation.data.data.totalInterestVnd },
              ]}
            />
            <LedgerTable
              headers={["Năm", "Số dư"]}
              align={["left", "right"]}
              rows={mutation.data.data.yearly.map((y) => [y.year, formatVnd(y.balanceVnd)])}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title="Chưa có kết quả" description="Nhập thông tin và bấm tính để xem kết quả." />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Loan payment (8.2) */

const METHOD_LABEL: Record<"ANNUITY" | "DECLINING_BALANCE", string> = {
  ANNUITY: "Trả góp đều",
  DECLINING_BALANCE: "Dư nợ giảm dần",
};

function LoanPaymentTool() {
  const [principalVnd, setPrincipalVnd] = React.useState(usePreset("principalVnd", "100000000"));
  const [ratePercent, setRatePercent] = React.useState(usePreset("ratePercent", "12"));
  const [termMonths, setTermMonths] = React.useState(usePreset("termMonths", "12"));
  const [method, setMethod] = React.useState<"ANNUITY" | "DECLINING_BALANCE">("ANNUITY");

  const mutation = useMutation({
    mutationFn: () =>
      api.postWithMeta<LoanPaymentData, ToolMeta>("/tools/loan-payment", {
        principalVnd: principalVnd || "0",
        annualRateBps: toBps(ratePercent),
        termMonths: Number(termMonths) || 1,
        method,
      }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <Field label="Số tiền vay" htmlFor="principal">
            <MoneyInput id="principal" value={principalVnd} onChange={setPrincipalVnd} />
          </Field>
          <RateField id="rate" label="Lãi suất mỗi năm" value={ratePercent} onChange={setRatePercent} />
          <Field label="Kỳ hạn (tháng)" htmlFor="term">
            <Input id="term" className="figure" type="number" min={1} max={600} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
          </Field>
          <Field label="Cách trả nợ" htmlFor="method">
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="ANNUITY">Trả góp đều mỗi tháng</option>
              <option value="DECLINING_BALANCE">Dư nợ giảm dần</option>
            </Select>
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            Tính khoản vay
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <MoneyReadout
              items={[
                { label: "Trả tháng đầu", vnd: mutation.data.data.monthlyPaymentVnd, primary: true },
                { label: "Tổng đã trả", vnd: mutation.data.data.totalPaidVnd },
                { label: "Tổng tiền lãi", vnd: mutation.data.data.totalInterestVnd },
              ]}
            />
            <LedgerTable
              headers={["Tháng", "Trả", "Gốc", "Lãi", "Còn lại"]}
              align={["left", "right", "right", "right", "right"]}
              caption={
                mutation.data.data.scheduleTruncated
                  ? "Bảng chỉ hiển thị 360 dòng đầu."
                  : undefined
              }
              rows={mutation.data.data.schedule.map((r) => [
                r.month,
                formatVnd(r.paymentVnd),
                formatVnd(r.principalVnd),
                formatVnd(r.interestVnd),
                formatVnd(r.remainingVnd),
              ])}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title="Chưa có kết quả" description="Nhập thông tin và bấm tính để xem bảng trả nợ." />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Loan compare (8.3) */

interface LoanCompareInput {
  name: string;
  principalVnd: string;
  ratePercent: string;
  termMonths: string;
  method: "ANNUITY" | "DECLINING_BALANCE";
}

function emptyLoan(n: number): LoanCompareInput {
  return { name: `Khoản vay ${n}`, principalVnd: "100000000", ratePercent: "12", termMonths: "12", method: "ANNUITY" };
}

function LoanCompareTool() {
  const [loans, setLoans] = React.useState<LoanCompareInput[]>([emptyLoan(1), emptyLoan(2)]);

  const mutation = useMutation({
    mutationFn: () =>
      api.postWithMeta<LoanCompareData, ToolMeta>("/tools/loan-compare", {
        loans: loans.map((l) => ({
          name: l.name || "Khoản vay",
          principalVnd: l.principalVnd || "0",
          annualRateBps: toBps(l.ratePercent),
          termMonths: Number(l.termMonths) || 1,
          method: l.method,
        })),
      }),
  });

  function updateLoan(index: number, patch: Partial<LoanCompareInput>) {
    setLoans((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {loans.map((loan, i) => (
          <Card key={i}>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Field label="Tên khoản vay" htmlFor={`name-${i}`}>
                  <Input id={`name-${i}`} value={loan.name} onChange={(e) => updateLoan(i, { name: e.target.value })} />
                </Field>
                {loans.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-6"
                    onClick={() => setLoans((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    Xóa
                  </Button>
                )}
              </div>
              <Field label="Số tiền vay" htmlFor={`principal-${i}`}>
                <MoneyInput id={`principal-${i}`} value={loan.principalVnd} onChange={(v) => updateLoan(i, { principalVnd: v })} />
              </Field>
              <RateField
                id={`rate-${i}`}
                label="Lãi suất mỗi năm"
                value={loan.ratePercent}
                onChange={(v) => updateLoan(i, { ratePercent: v })}
              />
              <Field label="Kỳ hạn (tháng)" htmlFor={`term-${i}`}>
                <Input
                  id={`term-${i}`}
                  className="figure"
                  type="number"
                  min={1}
                  max={600}
                  value={loan.termMonths}
                  onChange={(e) => updateLoan(i, { termMonths: e.target.value })}
                />
              </Field>
              <Field label="Cách trả nợ" htmlFor={`method-${i}`}>
                <Select
                  id={`method-${i}`}
                  value={loan.method}
                  onChange={(e) => updateLoan(i, { method: e.target.value as LoanCompareInput["method"] })}
                >
                  <option value="ANNUITY">Trả góp đều mỗi tháng</option>
                  <option value="DECLINING_BALANCE">Dư nợ giảm dần</option>
                </Select>
              </Field>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {loans.length < 4 && (
          <Button variant="secondary" onClick={() => setLoans((prev) => [...prev, emptyLoan(prev.length + 1)])}>
            Thêm khoản vay
          </Button>
        )}
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
          So sánh
        </Button>
      </div>

      <ToolError error={mutation.error} />

      {mutation.data && (
        <div className="space-y-4">
          <LedgerTable
            headers={["Khoản vay", "Cách trả", "Trả tháng đầu", "Tổng đã trả", "Tổng lãi", "Chênh lệch so với rẻ nhất"]}
            align={["left", "left", "right", "right", "right", "right"]}
            rows={mutation.data.data.loans.map((l) => [
              l.name === mutation.data!.data.cheapestByTotal ? `${l.name} (rẻ nhất)` : l.name,
              METHOD_LABEL[l.method],
              formatVnd(l.monthlyPaymentVnd),
              formatVnd(l.totalPaidVnd),
              formatVnd(l.totalInterestVnd),
              formatVnd(l.totalInterestDeltaVsCheapestVnd),
            ])}
          />
          <Alert tone="info">{mutation.data.data.note}</Alert>
          <FormulaNote meta={mutation.data.meta} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Savings goal (8.4) */

function SavingsGoalTool() {
  const [goalVnd, setGoalVnd] = React.useState(usePreset("goalVnd", "50000000"));
  const [currentVnd, setCurrentVnd] = React.useState(usePreset("currentVnd", "5000000"));
  const [ratePercent, setRatePercent] = React.useState(usePreset("ratePercent", "5"));
  const [contributionVnd, setContributionVnd] = React.useState(usePreset("contributionVnd", "1000000"));

  const mutation = useMutation({
    mutationFn: () =>
      api.postWithMeta<SavingsGoalData, ToolMeta>("/tools/savings-goal", {
        goalVnd: goalVnd || "0",
        currentVnd: currentVnd || "0",
        annualRateBps: toBps(ratePercent),
        monthlyContributionVnd: contributionVnd || "0",
      }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <Field label="Mục tiêu tiết kiệm" htmlFor="goal">
            <MoneyInput id="goal" value={goalVnd} onChange={setGoalVnd} />
          </Field>
          <Field label="Số tiền đã có" htmlFor="current">
            <MoneyInput id="current" value={currentVnd} onChange={setCurrentVnd} />
          </Field>
          <RateField id="rate" label="Lãi suất mỗi năm" value={ratePercent} onChange={setRatePercent} />
          <Field label="Góp thêm mỗi tháng" htmlFor="contribution">
            <MoneyInput id="contribution" value={contributionVnd} onChange={setContributionVnd} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            Tính số tháng cần
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <StatRows
              columns={1}
              items={[
                { label: "Số tháng cần", value: mutation.data.data.monthsNeeded, hint: "tháng" },
                { label: "Ngày dự kiến đạt mục tiêu", value: formatDate(mutation.data.data.achievedDate) },
              ]}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title="Chưa có kết quả" description="Nhập thông tin và bấm tính để xem cần bao nhiêu tháng." />
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Inflation (8.5) */

function InflationTool() {
  const [amountVnd, setAmountVnd] = React.useState(usePreset("amountVnd", "10000000"));
  const [ratePercent, setRatePercent] = React.useState(usePreset("ratePercent", "4"));
  const [years, setYears] = React.useState(usePreset("years", "10"));

  const mutation = useMutation({
    mutationFn: () =>
      api.postWithMeta<InflationData, ToolMeta>("/tools/inflation", {
        amountVnd: amountVnd || "0",
        annualInflationBps: toBps(ratePercent),
        years: Number(years) || 1,
      }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <Field label="Số tiền hiện tại" htmlFor="amount">
            <MoneyInput id="amount" value={amountVnd} onChange={setAmountVnd} />
          </Field>
          <RateField id="rate" label="Lạm phát mỗi năm" value={ratePercent} onChange={setRatePercent} />
          <Field label="Số năm" htmlFor="years">
            <Input id="years" className="figure" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            Tính ảnh hưởng lạm phát
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <MoneyReadout
              items={[
                {
                  label: "Sức mua tương đương hôm nay",
                  vnd: mutation.data.data.equivalentPurchasingPowerVnd,
                  primary: true,
                },
                { label: "Số tiền mặt (giữ nguyên số)", vnd: mutation.data.data.futureValueOfCashVnd },
              ]}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title="Chưa có kết quả" description="Nhập thông tin và bấm tính để xem tác động của lạm phát." />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Budget 50/30/20 (8.6) */

function BudgetSplitTool() {
  const [incomeVnd, setIncomeVnd] = React.useState(usePreset("incomeVnd", "10000000"));

  const mutation = useMutation({
    mutationFn: () =>
      api.postWithMeta<BudgetSplitData, ToolMeta>("/tools/budget-503020", {
        monthlyIncomeVnd: incomeVnd || "0",
      }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardBody className="space-y-4">
          <Field label="Thu nhập hằng tháng" htmlFor="income">
            <MoneyInput id="income" value={incomeVnd} onChange={setIncomeVnd} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            Chia ngân sách
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <MoneyReadout
              items={[
                { label: "Nhu cầu thiết yếu (50%)", vnd: mutation.data.data.needsVnd },
                { label: "Mong muốn cá nhân (30%)", vnd: mutation.data.data.wantsVnd },
                { label: "Tiết kiệm và trả nợ (20%)", vnd: mutation.data.data.savingsVnd },
              ]}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title="Chưa có kết quả" description="Nhập thu nhập và bấm chia ngân sách." />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- Page */

const TOOL_TITLE: Record<string, string> = {
  "compound-interest": "Lãi kép",
  "loan-payment": "Tính khoản trả góp",
  "loan-compare": "So sánh khoản vay",
  "savings-goal": "Mục tiêu tiết kiệm",
  inflation: "Lạm phát",
  "budget-503020": "Ngân sách 50/30/20",
};

export default function ToolPage() {
  const params = useParams<{ tool: string }>();
  const router = useRouter();
  const tool = params.tool;

  const title = TOOL_TITLE[tool];

  if (!title) {
    return (
      <EmptyState
        title="Không tìm thấy công cụ này"
        description="Công cụ có thể đã đổi tên hoặc chưa tồn tại."
        action={
          <Button variant="secondary" onClick={() => router.push("/tools")}>
            Về danh sách công cụ
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <LedgerLabel>Công cụ</LedgerLabel>
        <h1 className="mt-1 text-2xl">{title}</h1>
      </div>

      {tool === "compound-interest" && <CompoundInterestTool />}
      {tool === "loan-payment" && <LoanPaymentTool />}
      {tool === "loan-compare" && <LoanCompareTool />}
      {tool === "savings-goal" && <SavingsGoalTool />}
      {tool === "inflation" && <InflationTool />}
      {tool === "budget-503020" && <BudgetSplitTool />}
    </div>
  );
}
