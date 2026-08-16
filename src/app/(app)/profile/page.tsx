"use client";

/**
 * The learner ledger (doc 10 scope): stats, level and XP progress, streak,
 * badges, certificates and recent XP activity.
 */

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe, useStats, useT } from "@/components/Providers";
import type { TranslateFn } from "@/lib/i18n";
import {
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  LedgerTable,
  ProgressBar,
  SectionTitle,
  Skeleton,
  StatRows,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { BadgeView, CertificateView } from "@/lib/types";

interface LedgerEntry {
  delta: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

interface LedgerPage {
  data: LedgerEntry[];
  nextCursor?: string | null;
}

function BadgeGrid({ badges }: { badges: BadgeView[] }) {
  const t = useT();
  if (badges.length === 0) {
    return (
      <EmptyState title={t("profile.badgesEmptyTitle")} description={t("profile.badgesEmptyDescription")} />
    );
  }
  // Earned first, so the ledger reads as a record of what the learner has done.
  const ordered = [...badges].sort((a, b) => Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt)));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((b) => (
        <Card key={b.code} className={b.earnedAt ? undefined : "opacity-70"}>
          <CardBody className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{b.title}</h3>
              {b.earnedAt ? (
                <Chip tone="positive">{t("profile.earned")}</Chip>
              ) : (
                <Chip tone="neutral">{t("profile.notEarned")}</Chip>
              )}
            </div>
            <p className="text-xs text-ink-soft">{b.description}</p>
            {b.earnedAt ? (
              <p className="text-xs text-ink-faint">
                {t("profile.earnedOn", { date: formatDate(b.earnedAt) })}
              </p>
            ) : (
              b.coinReward > 0 && (
                <p className="figure text-xs text-ink-faint">
                  {t("profile.coinReward", { count: b.coinReward })}
                </p>
              )
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function CertificateList({ certificates }: { certificates: CertificateView[] }) {
  const t = useT();
  if (certificates.length === 0) {
    return (
      <EmptyState
        title={t("profile.certsEmptyTitle")}
        description={t("profile.certsEmptyDescription")}
        action={
          <Link href="/learn" className="text-sm font-medium text-moss-400 underline underline-offset-2">
            {t("profile.certsBrowseCourses")}
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {certificates.map((c) => (
        <Card key={c.id}>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{c.courseTitle}</h3>
              <p className="mt-0.5 text-xs text-ink-faint">
                {t("profile.certIssued", { date: formatDate(c.issuedAt), code: c.code })}
              </p>
            </div>
            <a
              href={c.shareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-moss-400 underline underline-offset-2"
            >
              {t("profile.viewCert")}
            </a>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function ledgerReasonLabel(reason: string, t: TranslateFn): string {
  const key = `profile.ledger.${reason}`;
  const label = t(key);
  return label === key ? reason : label;
}

function RecentActivity() {
  const t = useT();
  const query = useQuery({
    queryKey: ["me", "ledger", "xp"],
    queryFn: () => api.get<LedgerPage>("/me/ledger", { type: "xp", limit: 10 }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />;
  }
  const entries = query.data?.data ?? [];
  if (entries.length === 0) {
    return (
      <EmptyState
        title={t("profile.activityEmptyTitle")}
        description={t("profile.activityEmptyDescription")}
      />
    );
  }
  return (
    <LedgerTable
      headers={[t("profile.table.date"), t("profile.table.activity"), t("profile.table.xp")]}
      align={["left", "left", "right"]}
      rows={entries.map((e) => [
        formatDate(e.createdAt),
        ledgerReasonLabel(e.reason, t),
        <span key="delta" className={e.delta >= 0 ? "text-positive" : "text-critical"}>
          {e.delta >= 0 ? "+" : ""}
          {e.delta}
        </span>,
      ])}
    />
  );
}

export default function ProfilePage() {
  const me = useMe();
  const stats = useStats();
  const t = useT();

  const badgesQuery = useQuery({
    queryKey: ["me", "badges"],
    queryFn: () => api.get<BadgeView[]>("/me/badges"),
  });
  const certificatesQuery = useQuery({
    queryKey: ["me", "certificates"],
    queryFn: () => api.get<CertificateView[]>("/me/certificates"),
  });

  if (!me || !stats) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <LedgerLabel>{t("profile.label")}</LedgerLabel>
        <h1 className="mt-1 text-2xl">{me.displayName}</h1>
        <p className="mt-1 text-sm text-ink-soft">{me.email ?? ""}</p>
      </div>

      <StatRows
        items={[
          { label: t("profile.levelLabel"), value: stats.level },
          { label: t("profile.totalXp"), value: stats.xpTotal },
          { label: t("stats.coinsTitle"), value: stats.coins },
          { label: t("profile.streakLabel"), value: stats.streakCurrent, hint: t("common.dayUnit") },
        ]}
      />

      <section>
        <SectionTitle>{t("profile.levelProgress")}</SectionTitle>
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">{t("stats.level", { level: stats.level })}</span>
              <span className="figure text-ink-soft">
                {stats.xpTotal} / {stats.xpForNextLevel} XP
              </span>
            </div>
            <ProgressBar
              value={stats.xpTotal}
              max={stats.xpForNextLevel}
              label={t("profile.levelProgressBar")}
            />
          </CardBody>
        </Card>
      </section>

      <section>
        <SectionTitle>{t("profile.streakLabel")}</SectionTitle>
        <StatRows
          items={[
            { label: t("profile.holding"), value: stats.streakCurrent, hint: t("common.dayUnit") },
            { label: t("profile.longest"), value: stats.streakLongest, hint: t("common.dayUnit") },
            { label: t("profile.freezesLeft"), value: stats.streakFreezes },
            { label: t("profile.lessonsCompleted"), value: stats.lessonsCompleted },
          ]}
        />
      </section>

      <section>
        <SectionTitle>{t("profile.badgesTitle")}</SectionTitle>
        {badgesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : badgesQuery.isError ? (
          <ErrorPanel error={badgesQuery.error} onRetry={() => badgesQuery.refetch()} />
        ) : (
          <BadgeGrid badges={badgesQuery.data ?? []} />
        )}
      </section>

      <section>
        <SectionTitle>{t("profile.certsTitle")}</SectionTitle>
        {certificatesQuery.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : certificatesQuery.isError ? (
          <ErrorPanel error={certificatesQuery.error} onRetry={() => certificatesQuery.refetch()} />
        ) : (
          <CertificateList certificates={certificatesQuery.data ?? []} />
        )}
      </section>

      <section>
        <SectionTitle>{t("profile.activityTitle")}</SectionTitle>
        <RecentActivity />
      </section>

      <p className="text-xs text-ink-faint">{t("profile.serverNote")}</p>
    </div>
  );
}
