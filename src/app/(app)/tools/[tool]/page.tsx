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
import { useT } from "@/components/Providers";
import type { TranslateFn } from "@/lib/i18n";

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

const TOOL_SLUGS = [
  "compound-interest",
  "loan-payment",
  "loan-compare",
  "savings-goal",
  "inflation",
  "budget-503020",
] as const;

type ToolSlug = (typeof TOOL_SLUGS)[number];

function isToolSlug(value: string): value is ToolSlug {
  return (TOOL_SLUGS as readonly string[]).includes(value);
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
  const t = useT();
  return (
    <Field label={label} htmlFor={id} hint={t("tools.rateHint")}>
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
  const t = useT();
  if (!meta?.formula) return null;
  return (
    <Card tone="flat">
      <CardBody className="space-y-1">
        <LedgerLabel>{t("tools.formula")}</LedgerLabel>
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
  const t = useT();
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? error.ruleCode === "UNREACHABLE"
        ? t("tools.errorUnreachable")
        : error.message
      : t("tools.errorGeneric");
  return (
    <Alert tone="critical" title={t("tools.errorTitle")}>
      {message}
    </Alert>
  );
}

function methodLabel(method: "ANNUITY" | "DECLINING_BALANCE", t: TranslateFn): string {
  return method === "ANNUITY" ? t("tools.method.annuity") : t("tools.method.declining");
}

/* ----------------------------------------------------------- Compound interest (8.1) */

function CompoundInterestTool() {
  const t = useT();
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
          <Field label={t("tools.field.principal")} htmlFor="principal">
            <MoneyInput id="principal" value={principalVnd} onChange={setPrincipalVnd} />
          </Field>
          <Field
            label={t("tools.field.monthlyContribution")}
            htmlFor="contribution"
            hint={t("tools.field.contributionHint")}
          >
            <MoneyInput id="contribution" value={contributionVnd} onChange={setContributionVnd} />
          </Field>
          <RateField id="rate" label={t("tools.field.annualRate")} value={ratePercent} onChange={setRatePercent} />
          <Field label={t("tools.field.compounding")} htmlFor="compounding">
            <Select id="compounding" value={compounding} onChange={(e) => setCompounding(e.target.value as typeof compounding)}>
              <option value="MONTHLY">{t("tools.compounding.monthly")}</option>
              <option value="QUARTERLY">{t("tools.compounding.quarterly")}</option>
              <option value="ANNUALLY">{t("tools.compounding.annually")}</option>
            </Select>
          </Field>
          <Field label={t("tools.field.years")} htmlFor="years">
            <Input id="years" className="figure" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            {t("tools.action.compound")}
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <MoneyReadout
              items={[
                { label: t("tools.result.finalBalance"), vnd: mutation.data.data.finalAmountVnd, primary: true },
                { label: t("tools.result.totalContributed"), vnd: mutation.data.data.totalContributedVnd },
                { label: t("tools.result.totalInterest"), vnd: mutation.data.data.totalInterestVnd },
              ]}
            />
            <LedgerTable
              headers={[t("tools.table.year"), t("tools.table.balance")]}
              align={["left", "right"]}
              rows={mutation.data.data.yearly.map((y) => [y.year, formatVnd(y.balanceVnd)])}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title={t("tools.emptyTitle")} description={t("tools.emptyDescription")} />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Loan payment (8.2) */

function LoanPaymentTool() {
  const t = useT();
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
          <Field label={t("tools.field.loanAmount")} htmlFor="principal">
            <MoneyInput id="principal" value={principalVnd} onChange={setPrincipalVnd} />
          </Field>
          <RateField id="rate" label={t("tools.field.annualRate")} value={ratePercent} onChange={setRatePercent} />
          <Field label={t("tools.field.termMonths")} htmlFor="term">
            <Input id="term" className="figure" type="number" min={1} max={600} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
          </Field>
          <Field label={t("tools.field.repayMethod")} htmlFor="method">
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="ANNUITY">{t("tools.method.annuityFull")}</option>
              <option value="DECLINING_BALANCE">{t("tools.method.declining")}</option>
            </Select>
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            {t("tools.action.loan")}
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <MoneyReadout
              items={[
                { label: t("tools.result.firstPayment"), vnd: mutation.data.data.monthlyPaymentVnd, primary: true },
                { label: t("tools.result.totalPaid"), vnd: mutation.data.data.totalPaidVnd },
                { label: t("tools.result.totalInterest"), vnd: mutation.data.data.totalInterestVnd },
              ]}
            />
            <LedgerTable
              headers={[
                t("tools.table.month"),
                t("tools.table.payment"),
                t("tools.table.principal"),
                t("tools.table.interest"),
                t("tools.table.remaining"),
              ]}
              align={["left", "right", "right", "right", "right"]}
              caption={mutation.data.data.scheduleTruncated ? t("tools.scheduleTruncated") : undefined}
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
          <EmptyState title={t("tools.emptyTitle")} description={t("tools.emptySchedule")} />
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

function emptyLoan(n: number, t: TranslateFn): LoanCompareInput {
  return {
    name: t("tools.defaultLoanName", { n }),
    principalVnd: "100000000",
    ratePercent: "12",
    termMonths: "12",
    method: "ANNUITY",
  };
}

function LoanCompareTool() {
  const t = useT();
  const [loans, setLoans] = React.useState<LoanCompareInput[]>([emptyLoan(1, t), emptyLoan(2, t)]);

  const mutation = useMutation({
    mutationFn: () =>
      api.postWithMeta<LoanCompareData, ToolMeta>("/tools/loan-compare", {
        loans: loans.map((l) => ({
          name: l.name || t("tools.defaultLoan"),
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
                <Field label={t("tools.field.loanName")} htmlFor={`name-${i}`}>
                  <Input id={`name-${i}`} value={loan.name} onChange={(e) => updateLoan(i, { name: e.target.value })} />
                </Field>
                {loans.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-6"
                    onClick={() => setLoans((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    {t("tools.action.remove")}
                  </Button>
                )}
              </div>
              <Field label={t("tools.field.loanAmount")} htmlFor={`principal-${i}`}>
                <MoneyInput id={`principal-${i}`} value={loan.principalVnd} onChange={(v) => updateLoan(i, { principalVnd: v })} />
              </Field>
              <RateField
                id={`rate-${i}`}
                label={t("tools.field.annualRate")}
                value={loan.ratePercent}
                onChange={(v) => updateLoan(i, { ratePercent: v })}
              />
              <Field label={t("tools.field.termMonths")} htmlFor={`term-${i}`}>
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
              <Field label={t("tools.field.repayMethod")} htmlFor={`method-${i}`}>
                <Select
                  id={`method-${i}`}
                  value={loan.method}
                  onChange={(e) => updateLoan(i, { method: e.target.value as LoanCompareInput["method"] })}
                >
                  <option value="ANNUITY">{t("tools.method.annuityFull")}</option>
                  <option value="DECLINING_BALANCE">{t("tools.method.declining")}</option>
                </Select>
              </Field>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {loans.length < 4 && (
          <Button variant="secondary" onClick={() => setLoans((prev) => [...prev, emptyLoan(prev.length + 1, t)])}>
            {t("tools.action.addLoan")}
          </Button>
        )}
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
          {t("tools.action.compare")}
        </Button>
      </div>

      <ToolError error={mutation.error} />

      {mutation.data && (
        <div className="space-y-4">
          <LedgerTable
            headers={[
              t("tools.table.loan"),
              t("tools.table.method"),
              t("tools.table.firstPayment"),
              t("tools.table.totalPaid"),
              t("tools.table.totalInterest"),
              t("tools.table.deltaVsCheapest"),
            ]}
            align={["left", "left", "right", "right", "right", "right"]}
            rows={mutation.data.data.loans.map((l) => [
              l.name === mutation.data!.data.cheapestByTotal
                ? t("tools.result.cheapest", { name: l.name })
                : l.name,
              methodLabel(l.method, t),
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
  const t = useT();
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
          <Field label={t("tools.field.goal")} htmlFor="goal">
            <MoneyInput id="goal" value={goalVnd} onChange={setGoalVnd} />
          </Field>
          <Field label={t("tools.field.currentSavings")} htmlFor="current">
            <MoneyInput id="current" value={currentVnd} onChange={setCurrentVnd} />
          </Field>
          <RateField id="rate" label={t("tools.field.annualRate")} value={ratePercent} onChange={setRatePercent} />
          <Field label={t("tools.field.monthlyContribution")} htmlFor="contribution">
            <MoneyInput id="contribution" value={contributionVnd} onChange={setContributionVnd} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            {t("tools.action.savingsMonths")}
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
                { label: t("tools.result.monthsNeeded"), value: mutation.data.data.monthsNeeded, hint: t("tools.result.monthsHint") },
                { label: t("tools.result.achievedDate"), value: formatDate(mutation.data.data.achievedDate) },
              ]}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title={t("tools.emptyTitle")} description={t("tools.emptyMonths")} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Inflation (8.5) */

function InflationTool() {
  const t = useT();
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
          <Field label={t("tools.field.currentAmount")} htmlFor="amount">
            <MoneyInput id="amount" value={amountVnd} onChange={setAmountVnd} />
          </Field>
          <RateField id="rate" label={t("tools.field.inflationRate")} value={ratePercent} onChange={setRatePercent} />
          <Field label={t("tools.field.years")} htmlFor="years">
            <Input id="years" className="figure" type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            {t("tools.action.inflation")}
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
                  label: t("tools.result.purchasingPower"),
                  vnd: mutation.data.data.equivalentPurchasingPowerVnd,
                  primary: true,
                },
                { label: t("tools.result.cashFaceValue"), vnd: mutation.data.data.futureValueOfCashVnd },
              ]}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title={t("tools.emptyTitle")} description={t("tools.emptyInflation")} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Budget 50/30/20 (8.6) */

function BudgetSplitTool() {
  const t = useT();
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
          <Field label={t("tools.field.monthlyIncome")} htmlFor="income">
            <MoneyInput id="income" value={incomeVnd} onChange={setIncomeVnd} />
          </Field>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={mutation.isPending}>
            {t("tools.action.budget")}
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <ToolError error={mutation.error} />
        {mutation.data && (
          <>
            <MoneyReadout
              items={[
                { label: t("tools.result.needs"), vnd: mutation.data.data.needsVnd },
                { label: t("tools.result.wants"), vnd: mutation.data.data.wantsVnd },
                { label: t("tools.result.savings"), vnd: mutation.data.data.savingsVnd },
              ]}
            />
            <FormulaNote meta={mutation.data.meta} />
          </>
        )}
        {!mutation.data && !mutation.isPending && !mutation.error && (
          <EmptyState title={t("tools.emptyTitle")} description={t("tools.emptyBudget")} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- Page */

export default function ToolPage() {
  const t = useT();
  const params = useParams<{ tool: string }>();
  const router = useRouter();
  const tool = params.tool;

  if (!isToolSlug(tool)) {
    return (
      <EmptyState
        title={t("tools.notFoundTitle")}
        description={t("tools.notFoundDescription")}
        action={
          <Button variant="secondary" onClick={() => router.push("/tools")}>
            {t("tools.backToList")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <LedgerLabel>{t("tools.label")}</LedgerLabel>
        <h1 className="mt-1 text-2xl">{t(`tools.${tool}.title`)}</h1>
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
