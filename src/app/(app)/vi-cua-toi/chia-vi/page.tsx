"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  PageBackLink,
  ProgressBar,
  SectionContinueLink,
  Skeleton,
} from "@/components/ui";
import { formatVnd } from "@/lib/format";
import type { SpendingJarView, JarCategoryView } from "@/server/services/spendingJarService";

function JarRow({
  cat,
  onChange,
  onRemove,
  canRemove,
}: {
  cat: JarCategoryView;
  onChange: (patch: Partial<{ name: string; budgetVnd: string; spentVnd: string }>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const t = useT();
  const tone = cat.warning === "over" ? "critical" : cat.warning === "approaching" ? "caution" : "neutral";

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Field label={t("wallet.manage.categoryName")} htmlFor={`name-${cat.id}`}>
            <Input
              id={`name-${cat.id}`}
              value={cat.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>
          {canRemove && (
            <Button variant="ghost" size="sm" className="mt-6" onClick={onRemove}>
              {t("wallet.manage.removeCategory")}
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("wallet.manage.budget")} htmlFor={`budget-${cat.id}`}>
            <MoneyInput
              id={`budget-${cat.id}`}
              value={cat.budgetVnd}
              onChange={(v) => onChange({ budgetVnd: v })}
            />
          </Field>
          <Field label={t("wallet.manage.spent")} htmlFor={`spent-${cat.id}`}>
            <MoneyInput
              id={`spent-${cat.id}`}
              value={cat.spentVnd}
              onChange={(v) => onChange({ spentVnd: v })}
            />
          </Field>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink-soft">
              {t("wallet.manage.budgetPct", { pct: cat.budgetPct })}
            </span>
            <Chip tone={tone === "critical" ? "critical" : tone === "caution" ? "caution" : "neutral"}>
              {t("wallet.manage.spentOfBudget", { pct: cat.spentOfBudgetPct })}
            </Chip>
          </div>
          <ProgressBar value={Math.min(cat.spentOfBudgetPct, 100)} max={100} label={cat.name} />
          {cat.warning === "approaching" && (
            <Alert tone="warning" title={t("wallet.manage.warningApproaching")}>
              {t("wallet.manage.warningApproachingBody", { name: cat.name })}
            </Alert>
          )}
          {cat.warning === "over" && (
            <Alert tone="critical" title={t("wallet.manage.warningOver")}>
              {t("wallet.manage.warningOverBody", { name: cat.name })}
            </Alert>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function HuChiTieuPage() {
  const t = useT();
  const qc = useQueryClient();
  const [local, setLocal] = React.useState<SpendingJarView | null>(null);

  const query = useQuery({
    queryKey: ["me", "spending-jars"],
    queryFn: () => api.get<SpendingJarView>("/me/spending-jars"),
  });

  React.useEffect(() => {
    if (query.data) setLocal(query.data);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!local) throw new Error("No data");
      return api.put<SpendingJarView>("/me/spending-jars", {
        totalBudgetVnd: local.totalBudgetVnd,
        categories: local.categories.map((c) => ({
          id: c.id,
          name: c.name,
          budgetVnd: c.budgetVnd,
          spentVnd: c.spentVnd,
        })),
      });
    },
    onSuccess: (data) => {
      setLocal(data);
      void qc.invalidateQueries({ queryKey: ["me", "spending-jars"] });
    },
  });

  function updateCategory(id: string, patch: Partial<{ name: string; budgetVnd: string; spentVnd: string }>) {
    setLocal((prev) => {
      if (!prev) return prev;
      const categories = prev.categories.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        const total = Number(prev.totalBudgetVnd);
        const budget = Number(next.budgetVnd);
        const spent = Number(next.spentVnd);
        const budgetPct = total > 0 ? Math.round((budget / total) * 1000) / 10 : 0;
        const spentPct = total > 0 ? Math.round((spent / total) * 1000) / 10 : 0;
        const spentOfBudgetPct = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : 0;
        const warning = spentOfBudgetPct > 100 ? "over" : spentOfBudgetPct >= 80 ? "approaching" : "none";
        return { ...next, budgetPct, spentPct, spentOfBudgetPct, warning } as JarCategoryView;
      });
      const totalSpent = categories.reduce((s, c) => s + Number(c.spentVnd), 0);
      const total = Number(prev.totalBudgetVnd);
      return {
        ...prev,
        categories,
        totalSpentVnd: String(totalSpent),
        totalSpentPct: total > 0 ? Math.round((totalSpent / total) * 1000) / 10 : 0,
      };
    });
  }

  function addCategory() {
    setLocal((prev) => {
      if (!prev || prev.categories.length >= 12) return prev;
      const id = `custom-${Date.now()}`;
      const cat: JarCategoryView = {
        id,
        name: t("wallet.manage.newCategory"),
        budgetVnd: "0",
        spentVnd: "0",
        budgetPct: 0,
        spentPct: 0,
        spentOfBudgetPct: 0,
        warning: "none",
      };
      return { ...prev, categories: [...prev.categories, cat] };
    });
  }

  function removeCategory(id: string) {
    setLocal((prev) => {
      if (!prev || prev.categories.length <= 1) return prev;
      return { ...prev, categories: prev.categories.filter((c) => c.id !== id) };
    });
  }

  const data = local ?? query.data;

  return (
    <div className="space-y-5">
      <PageBackLink href="/vi-cua-toi">{t("wallet.back")}</PageBackLink>

      <header className="space-y-2">
        <LedgerLabel>{t("wallet.manage.label")}</LedgerLabel>
        <h1 className="font-display text-2xl font-semibold">{t("wallet.manage.title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{t("wallet.manage.subtitle")}</p>
      </header>

      {query.isLoading ? (
        <Skeleton className="h-48 w-full" aria-busy="true" />
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : !data ? (
        <EmptyState title={t("wallet.manage.emptyTitle")} description={t("wallet.manage.emptyDescription")} />
      ) : (
        <>
          <Card tone="ink">
            <CardBody className="space-y-3">
              <Field label={t("wallet.manage.totalBudget")} htmlFor="total-budget">
                <MoneyInput
                  id="total-budget"
                  value={data.totalBudgetVnd}
                  onChange={(v) =>
                    setLocal((prev) => (prev ? { ...prev, totalBudgetVnd: v } : prev))
                  }
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-paper/90">
                <span>{t("wallet.manage.totalSpent")}</span>
                <span className="figure text-lg">{formatVnd(data.totalSpentVnd)}</span>
              </div>
              <ProgressBar value={Math.min(data.totalSpentPct, 100)} max={100} label={t("wallet.manage.totalSpent")} />
              {data.totalSpentPct >= 90 && (
                <Alert tone="warning" title={t("wallet.manage.totalWarning")}>
                  {t("wallet.manage.totalWarningBody", { pct: data.totalSpentPct })}
                </Alert>
              )}
            </CardBody>
          </Card>

          <div className="space-y-3">
            {data.categories.map((cat) => (
              <JarRow
                key={cat.id}
                cat={cat}
                onChange={(patch) => updateCategory(cat.id, patch)}
                onRemove={() => removeCategory(cat.id)}
                canRemove={data.categories.length > 1}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {data.categories.length < 12 && (
              <Button variant="secondary" onClick={addCategory}>
                {t("wallet.manage.addCategory")}
              </Button>
            )}
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {t("wallet.manage.save")}
            </Button>
          </div>
        </>
      )}

      <SectionContinueLink
        href="/vi-cua-toi/cuoc-song"
        hint={t("wallet.life.label")}
        label={t("wallet.manage.nextLife")}
      />
    </div>
  );
}
