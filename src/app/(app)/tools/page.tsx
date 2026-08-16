"use client";

/** Index of the finance calculators (doc 03 §8). */

import Link from "next/link";
import { Card, CardBody, LedgerLabel } from "@/components/ui";
import { ToolGlyph, type ToolKind } from "@/components/art/ToolGlyph";
import { useT } from "@/components/Providers";

const TOOL_SLUGS: ReadonlyArray<ToolKind> = [
  "compound-interest",
  "loan-payment",
  "loan-compare",
  "savings-goal",
  "inflation",
  "budget-503020",
];

export default function ToolsIndexPage() {
  const t = useT();

  return (
    <div className="space-y-5">
      <div>
        <LedgerLabel>{t("tools.label")}</LedgerLabel>
        <h1 className="mt-1 text-2xl">{t("tools.indexTitle")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("tools.indexSubtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOL_SLUGS.map((slug) => (
          <Link key={slug} href={`/tools/${slug}`}>
            <Card className="h-full transition-colors hover:bg-paper-sunken">
              <CardBody className="flex h-full flex-col gap-2">
                <ToolGlyph kind={slug} className="h-11 w-11 text-moss-600" />
                <h2 className="mt-1 text-base font-semibold">{t(`tools.${slug}.title`)}</h2>
                <p className="text-sm text-ink-soft">{t(`tools.${slug}.description`)}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
