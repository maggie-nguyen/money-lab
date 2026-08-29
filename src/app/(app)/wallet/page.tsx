"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession, useT } from "@/components/Providers";
import { WalletGlyph } from "@/components/art/WalletGlyph";
import { PillarCoverCard } from "@/components/wallet/PillarCoverCard";
import { coverStyle } from "@/lib/cover";
import { CoverArt } from "@/components/art/CoverArt";
import {
  Button,
  Card,
  CardBody,
  LedgerLabel,
  MoneyReadout,
  ProgressBar,
  SectionTitle,
  StatRows,
} from "@/components/ui";
import type { SpendingJarView } from "@/server/services/spendingJarService";

function FeaturedMapCard() {
  const t = useT();

  return (
    <Link href="/food" className="group block">
      <div
        className="relative flex min-h-[12rem] items-end overflow-hidden rounded-[var(--radius-card)] sm:min-h-[14rem]"
        style={coverStyle("wallet-food-map")}
      >
        <CoverArt slug="wallet-food-map" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/40 to-transparent" />
        <div className="relative flex w-full flex-wrap items-end justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0 flex-1 text-white">
            <WalletGlyph kind="map" className="mb-3 h-10 w-10 text-white/85" />
            <LedgerLabel className="text-white/70">{t("nav.map")}</LedgerLabel>
            <p className="mt-1 font-display text-2xl font-semibold">{t("map.metaTitle")}</p>
            <p className="mt-1.5 max-w-lg text-sm text-white/80">{t("map.metaDescription")}</p>
          </div>
          <span className="shrink-0 rounded-[var(--radius-control)] bg-white px-4 py-2 text-sm font-medium text-ink transition-colors group-hover:bg-paper-sunken">
            {t("wallet.openMap")}
          </span>
        </div>
      </div>
    </Link>
  );
}

function WalletSidebar() {
  const { bootstrap } = useSession();
  const t = useT();

  const jarQuery = useQuery({
    queryKey: ["spending-jar"],
    queryFn: () => api.get<SpendingJarView>("/me/spending-jars"),
    enabled: Boolean(bootstrap),
  });

  const stats = bootstrap?.stats;

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      {stats && (
        <StatRows
          columns={1}
          items={[
            { label: t("wallet.sidebar.streak"), value: stats.streakCurrent, hint: t("common.dayUnit") },
            { label: t("stats.coinsTitle"), value: stats.coins },
          ]}
        />
      )}

      {bootstrap && (
        <Card>
          <CardBody className="space-y-3">
            <LedgerLabel>{t("wallet.manage.label")}</LedgerLabel>
            {jarQuery.isLoading ? (
              <p className="text-sm text-ink-faint">{t("common.loading")}</p>
            ) : jarQuery.data && Number(jarQuery.data.totalBudgetVnd) > 0 ? (
              <>
                <MoneyReadout
                  items={[
                    {
                      label: t("wallet.manage.totalBudget"),
                      vnd: jarQuery.data.totalBudgetVnd,
                      primary: true,
                    },
                    { label: t("wallet.manage.totalSpent"), vnd: jarQuery.data.totalSpentVnd },
                  ]}
                />
                <ProgressBar
                  value={jarQuery.data.totalSpentPct}
                  max={100}
                  label={t("wallet.manage.totalSpent")}
                />
                <Link href="/wallet/budget">
                  <Button size="sm" variant="secondary" className="w-full">
                    {t("wallet.sidebar.editJar")}
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft">{t("wallet.sidebar.jarEmpty")}</p>
                <Link href="/wallet/budget">
                  <Button size="sm" className="w-full">
                    {t("wallet.sidebar.setupJar")}
                  </Button>
                </Link>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <Card tone="flat">
        <CardBody className="space-y-1">
          <LedgerLabel>{t("wallet.sidebar.quickLinks")}</LedgerLabel>
          <div className="mt-2 divide-y divide-rule border-y border-rule">
            <Link
              href="/library"
              className="block py-2.5 text-sm text-ink-soft transition-colors hover:text-moss-600"
            >
              {t("library.label")}
            </Link>
            <Link
              href="/food"
              className="block py-2.5 text-sm text-ink-soft transition-colors hover:text-moss-600"
            >
              {t("map.metaTitle")}
            </Link>
            <Link
              href="/wallet/challenges"
              className="block py-2.5 text-sm text-ink-soft transition-colors hover:text-moss-600"
            >
              {t("wallet.habits.title")}
            </Link>
            <Link
              href="/wallet/budget"
              className="block py-2.5 text-sm text-ink-soft transition-colors hover:text-moss-600"
            >
              {t("wallet.manage.title")}
            </Link>
          </div>
        </CardBody>
      </Card>
    </aside>
  );
}

const PILLARS = [
  { href: "/wallet/mind", key: "mind", coverSlug: "wallet-mind", glyph: "mind" as const },
  { href: "/wallet/budget", key: "manage", coverSlug: "wallet-manage", glyph: "manage" as const },
  { href: "/wallet/life", key: "life", coverSlug: "wallet-life", glyph: "life" as const },
  { href: "/wallet/challenges", key: "habits", coverSlug: "wallet-habits", glyph: "habits" as const },
] as const;

export default function WalletHubPage() {
  const t = useT();
  const moments = t("wallet.moments").split("|");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
      <div className="space-y-8">
        <header>
          <LedgerLabel>{t("wallet.label")}</LedgerLabel>
          <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{t("wallet.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{t("wallet.subtitle")}</p>
        </header>

        <FeaturedMapCard />

        <section>
          <SectionTitle>{t("wallet.sectionsTitle")}</SectionTitle>
          <p className="-mt-1 mb-4 max-w-2xl text-sm text-ink-soft">{t("wallet.footerNote")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <PillarCoverCard
                key={p.href}
                href={p.href}
                coverSlug={p.coverSlug}
                glyph={p.glyph}
                tag={t(`wallet.${p.key}.tag`)}
                title={t(`wallet.${p.key}.title`)}
                description={t(`wallet.${p.key}.description`)}
                meta={t("wallet.topicCount", {
                  count: (t(`wallet.${p.key}.includes`) as string).split("|").length,
                })}
              />
            ))}
          </div>
        </section>

        <Card tone="flat">
          <CardBody>
            <LedgerLabel>{t("wallet.momentsLabel")}</LedgerLabel>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{t("wallet.momentsIntro")}</p>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {moments.map((line) => (
                <li key={line} className="py-2.5 text-sm text-ink-soft">
                  {line.trim()}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <WalletSidebar />
    </div>
  );
}
