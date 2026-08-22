"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useT } from "@/components/Providers";
import { CoverArt } from "@/components/art/CoverArt";
import { ChallengeGlyph, challengeGlyphKind } from "@/components/art/ChallengeGlyph";
import { coverStyle } from "@/lib/cover";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  PageBackLink,
  ProgressBar,
  RelatedNavLink,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import type { UserChallengeView, ChallengeDefView } from "@/server/services/challengeService";

function CoverBand({ slug, children }: { slug: string; children?: React.ReactNode }) {
  return (
    <div className="relative h-24 w-full shrink-0 overflow-hidden" style={coverStyle(slug)}>
      <CoverArt slug={slug} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      {children}
    </div>
  );
}

function ChallengeCard({
  def,
  active,
  onStart,
  onTick,
  starting,
  ticking,
}: {
  def: ChallengeDefView;
  active?: UserChallengeView;
  onStart: () => void;
  onTick: () => void;
  starting: boolean;
  ticking: boolean;
}) {
  const t = useT();
  const completed = active?.status === "COMPLETED";
  const inProgress = active?.status === "ACTIVE" && !completed;
  const glyph = challengeGlyphKind(def.iconKey);
  const coverSlug = `challenge-${def.slug}`;

  return (
    <Card
      className={`flex h-full flex-col overflow-hidden ${
        completed ? "border-moss-200" : "transition-colors hover:border-moss-200 hover:bg-paper-sunken"
      }`}
    >
      <CoverBand slug={coverSlug}>
        <ChallengeGlyph kind={glyph} className="absolute bottom-3 left-4 h-9 w-9 text-white/90" />
        <div className="absolute right-3 top-3">
          {completed && <Chip tone="positive">{t("wallet.habits.completed")}</Chip>}
          {inProgress && <Chip tone="caution">{t("wallet.habits.inProgress")}</Chip>}
          {!active && (
            <Chip tone="neutral" className="bg-paper/90">
              {t("wallet.habits.durationDays", { count: def.durationDays })}
            </Chip>
          )}
        </div>
      </CoverBand>

      <CardBody className="flex flex-1 flex-col gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">{def.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{def.description}</p>
        </div>

        {def.savingsHint && (
          <div className="rounded-[var(--radius-control)] border border-rule bg-paper-sunken px-3 py-2 text-xs leading-relaxed text-ink-soft">
            {def.savingsHint}
          </div>
        )}

        {active && (
          <div className="space-y-2 border-t border-rule pt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">{t("wallet.habits.progress")}</span>
              <span className="figure text-ink-soft">
                {active.progressDays} / {active.targetDays} {t("common.dayUnit")}
              </span>
            </div>
            <ProgressBar value={active.progressDays} max={active.targetDays} label={def.title} />
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {!active && (
            <Button onClick={onStart} loading={starting} size="sm">
              {t("wallet.habits.start")}
            </Button>
          )}
          {active?.canTickToday && (
            <Button onClick={onTick} loading={ticking} size="sm">
              {t("wallet.habits.tickToday")}
            </Button>
          )}
          {active?.todayTicked && inProgress && (
            <Chip tone="positive">{t("wallet.habits.doneToday")}</Chip>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function HabitsSidebar({ activeCount, totalCount }: { activeCount: number; totalCount: number }) {
  const t = useT();

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <Card tone="flat">
        <CardBody className="space-y-3">
          <LedgerLabel>{t("wallet.habits.label")}</LedgerLabel>
          <p className="text-sm leading-relaxed text-ink-soft">{t("wallet.habits.howItWorks")}</p>
          <dl className="grid border-y border-rule divide-y divide-rule">
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-sm text-ink-soft">{t("wallet.habits.sidebar.active")}</dt>
              <dd className="figure text-sm font-semibold">{activeCount}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-sm text-ink-soft">{t("wallet.habits.sidebar.available")}</dt>
              <dd className="figure text-sm font-semibold">{totalCount}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card tone="flat">
        <CardBody className="space-y-1">
          <LedgerLabel>{t("wallet.sidebar.quickLinks")}</LedgerLabel>
          <div className="mt-2 space-y-0.5">
            <RelatedNavLink href="/vi-cua-toi/chia-vi">{t("wallet.manage.title")}</RelatedNavLink>
            <RelatedNavLink href="/ban-do">{t("map.metaTitle")}</RelatedNavLink>
          </div>
        </CardBody>
      </Card>
    </aside>
  );
}

export default function ThuThachPage() {
  const t = useT();
  const qc = useQueryClient();
  const [awardMsg, setAwardMsg] = React.useState<string | null>(null);

  const defsQuery = useQuery({
    queryKey: ["challenges", "defs"],
    queryFn: () => api.get<ChallengeDefView[]>("/challenges"),
  });

  const mineQuery = useQuery({
    queryKey: ["challenges", "mine"],
    queryFn: () => api.get<UserChallengeView[]>("/challenges/mine"),
  });

  const startMutation = useMutation({
    mutationFn: (slug: string) => api.post<UserChallengeView>(`/challenges/${slug}/start`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["challenges", "mine"] });
    },
  });

  const tickMutation = useMutation({
    mutationFn: (participationId: string) =>
      api.post<UserChallengeView>(
        `/challenges/participations/${participationId}/tick`,
        {},
        { idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["challenges", "mine"] });
      setAwardMsg(t("wallet.habits.dayRecorded"));
    },
  });

  const activeBySlug = React.useMemo(() => {
    const map = new Map<string, UserChallengeView>();
    for (const p of mineQuery.data ?? []) {
      if (p.status === "ACTIVE" || p.status === "COMPLETED") {
        const existing = map.get(p.slug);
        if (!existing || new Date(p.startedAt) > new Date(existing.startedAt)) {
          map.set(p.slug, p);
        }
      }
    }
    return map;
  }, [mineQuery.data]);

  const defs = defsQuery.data ?? [];
  const activeDefs = defs.filter((d) => {
    const p = activeBySlug.get(d.slug);
    return p?.status === "ACTIVE";
  });
  const otherDefs = defs.filter((d) => !activeDefs.includes(d));
  const activeParticipations = [...activeBySlug.values()].filter((p) => p.status === "ACTIVE");

  const renderGrid = (items: ChallengeDefView[]) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((def) => {
        const active = activeBySlug.get(def.slug);
        return (
          <ChallengeCard
            key={def.id}
            def={def}
            active={active}
            onStart={() => startMutation.mutate(def.slug)}
            onTick={() => active && tickMutation.mutate(active.id)}
            starting={startMutation.isPending && startMutation.variables === def.slug}
            ticking={tickMutation.isPending}
          />
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
      <div className="space-y-6">
        <PageBackLink href="/vi-cua-toi">{t("wallet.back")}</PageBackLink>

        <header className="space-y-2">
          <LedgerLabel>{t("wallet.habits.label")}</LedgerLabel>
          <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{t("wallet.habits.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{t("wallet.habits.subtitle")}</p>
        </header>

        {awardMsg && (
          <Alert tone="positive" title={t("wallet.habits.congrats")}>
            {awardMsg}
          </Alert>
        )}

        {defsQuery.isLoading || mineQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : defsQuery.isError ? (
          <ErrorPanel error={defsQuery.error} onRetry={() => defsQuery.refetch()} />
        ) : mineQuery.isError ? (
          <ErrorPanel error={mineQuery.error} onRetry={() => mineQuery.refetch()} />
        ) : !defs.length ? (
          <EmptyState
            title={t("wallet.habits.emptyTitle")}
            description={t("wallet.habits.emptyDescription")}
          />
        ) : (
          <div className="space-y-8">
            {activeDefs.length > 0 && (
              <section>
                <SectionTitle>{t("wallet.habits.activeSection")}</SectionTitle>
                {renderGrid(activeDefs)}
              </section>
            )}
            {otherDefs.length > 0 && (
              <section>
                <SectionTitle>{t("wallet.habits.catalogSection")}</SectionTitle>
                {renderGrid(otherDefs)}
              </section>
            )}
          </div>
        )}

        {(startMutation.error || tickMutation.error) && (
          <Alert tone="critical" title={t("common.errorTitle")}>
            {(startMutation.error ?? tickMutation.error) instanceof ApiError
              ? (startMutation.error ?? tickMutation.error)!.message
              : t("error.generic")}
          </Alert>
        )}
      </div>

      <HabitsSidebar activeCount={activeParticipations.length} totalCount={defs.length} />
    </div>
  );
}
