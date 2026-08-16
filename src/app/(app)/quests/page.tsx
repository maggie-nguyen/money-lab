"use client";

/**
 * Daily quests (doc 03 §6.1). Quests reset every day at 00:00 Vietnam time
 * (Asia/Ho_Chi_Minh), regardless of the learner's own device time zone.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/components/Providers";
import { Alert, Card, CardBody, Chip, EmptyState, ErrorPanel, LedgerLabel, ProgressBar, Skeleton } from "@/components/ui";
import type { DailyQuest, QuestsToday } from "@/lib/types";

function QuestCard({ quest }: { quest: DailyQuest }) {
  const t = useT();
  const completed = quest.completedAt !== null;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{quest.title}</h2>
          {completed ? (
            <Chip tone="positive">{t("quests.completed")}</Chip>
          ) : (
            <Chip tone="neutral">{t("quests.inProgress")}</Chip>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-soft">{t("quests.progress")}</span>
            <span className="figure text-ink-soft">
              {Math.min(quest.progressInt, quest.targetInt)} / {quest.targetInt}
            </span>
          </div>
          <ProgressBar value={quest.progressInt} max={quest.targetInt} label={quest.title} />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Chip tone="moss" className="figure">
            +{quest.xpReward} XP
          </Chip>
          <Chip tone="caution" className="figure">
            {t("quests.coinReward", { count: quest.coinReward })}
          </Chip>
        </div>
      </CardBody>
    </Card>
  );
}

export default function QuestsPage() {
  const t = useT();
  const query = useQuery({
    queryKey: ["quests", "today"],
    queryFn: () => api.get<QuestsToday>("/me/quests/today"),
  });

  const quests = query.data?.quests ?? [];

  return (
    <div className="space-y-5">
      <div>
        <LedgerLabel>{t("nav.quests")}</LedgerLabel>
        <h1 className="mt-1 text-2xl">{t("nav.quests")}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t("quests.emptyDescription")}</p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : quests.length === 0 ? (
        <EmptyState title={t("quests.emptyTitle")} description={t("quests.emptyDescription")} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quests.map((q) => (
              <QuestCard key={q.code} quest={q} />
            ))}
          </div>
          {quests.every((q) => q.completedAt !== null) && (
            <Alert tone="positive" title={t("quests.allDoneTitle")}>
              {t("quests.emptyDescription")}
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
