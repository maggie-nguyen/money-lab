import { z } from "zod";
import { prisma } from "@/server/db";
import { parseVnd, vndToString } from "@/server/lib/money";

const moneyVnd = z
  .string()
  .regex(/^\d{1,15}$/, "Số tiền phải là số nguyên không âm, tính theo đồng.");

const jarCategorySchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  budgetVnd: moneyVnd,
  spentVnd: moneyVnd.default("0"),
});

export const spendingJarBodySchema = z.object({
  totalBudgetVnd: moneyVnd,
  categories: z.array(jarCategorySchema).min(1).max(12),
});

export type JarCategory = z.infer<typeof jarCategorySchema>;

export interface JarCategoryView {
  id: string;
  name: string;
  budgetVnd: string;
  spentVnd: string;
  budgetPct: number;
  spentPct: number;
  spentOfBudgetPct: number;
  warning: "none" | "approaching" | "over";
}

export interface SpendingJarView {
  totalBudgetVnd: string;
  totalSpentVnd: string;
  totalSpentPct: number;
  categories: JarCategoryView[];
  updatedAt: string | null;
}

const DEFAULT_CATEGORIES = [
  { id: "essential", name: "Thiết yếu" },
  { id: "food", name: "Căng tin & ăn uống" },
  { id: "study", name: "Học tập" },
  { id: "fun", name: "Giải trí & đi chơi" },
  { id: "savings", name: "Tiết kiệm" },
];

function warningLevel(spentPct: number): JarCategoryView["warning"] {
  if (spentPct > 100) return "over";
  if (spentPct >= 80) return "approaching";
  return "none";
}

function buildView(totalBudgetVnd: bigint, categories: JarCategory[], updatedAt: Date | null): SpendingJarView {
  const total = Number(totalBudgetVnd);
  let totalSpent = 0n;
  const views: JarCategoryView[] = categories.map((c) => {
    const budget = parseVnd(c.budgetVnd);
    const spent = parseVnd(c.spentVnd);
    totalSpent += spent;
    const budgetPct = total > 0 ? Math.round((Number(budget) / total) * 1000) / 10 : 0;
    const spentPct = total > 0 ? Math.round((Number(spent) / total) * 1000) / 10 : 0;
    const spentOfBudgetPct = Number(budget) > 0 ? Math.round((Number(spent) / Number(budget)) * 1000) / 10 : 0;
    return {
      id: c.id,
      name: c.name,
      budgetVnd: vndToString(budget),
      spentVnd: vndToString(spent),
      budgetPct,
      spentPct,
      spentOfBudgetPct,
      warning: warningLevel(spentOfBudgetPct),
    };
  });
  const totalSpentPct = total > 0 ? Math.round((Number(totalSpent) / total) * 1000) / 10 : 0;
  return {
    totalBudgetVnd: vndToString(totalBudgetVnd),
    totalSpentVnd: vndToString(totalSpent),
    totalSpentPct,
    categories: views,
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}

export function defaultJarPlan(_locale?: "vi", totalBudgetVnd = 3000000n): SpendingJarView {
  const defs = DEFAULT_CATEGORIES;
  const perCat = totalBudgetVnd / BigInt(defs.length);
  const categories: JarCategory[] = defs.map((d) => ({
    id: d.id,
    name: d.name,
    budgetVnd: vndToString(perCat),
    spentVnd: "0",
  }));
  return buildView(totalBudgetVnd, categories, null);
}

export async function getSpendingJar(userId: string, _locale?: "vi"): Promise<SpendingJarView> {
  const row = await prisma.spendingJarPlan.findUnique({ where: { userId } });
  if (!row) return defaultJarPlan();
  const categories = jarCategorySchema.array().parse(row.categories);
  return buildView(row.totalBudgetVnd, categories, row.updatedAt);
}

export async function saveSpendingJar(
  userId: string,
  input: z.infer<typeof spendingJarBodySchema>,
): Promise<SpendingJarView> {
  const total = parseVnd(input.totalBudgetVnd);
  const row = await prisma.spendingJarPlan.upsert({
    where: { userId },
    create: {
      userId,
      totalBudgetVnd: total,
      categories: input.categories,
    },
    update: {
      totalBudgetVnd: total,
      categories: input.categories,
    },
  });
  const categories = jarCategorySchema.array().parse(row.categories);
  return buildView(row.totalBudgetVnd, categories, row.updatedAt);
}
