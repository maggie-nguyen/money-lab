"use client";

/**
 * Weekly leaderboard (doc 03 §6.3): current-week XP ranking, own row
 * highlighted, with a separate line for the learner's rank when it falls
 * outside the visible list.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe, useStats } from "@/components/Providers";
import { Chip, EmptyState, ErrorPanel, LedgerLabel, LedgerTable, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { LeaderboardWeekly } from "@/lib/types";

export default function LeaderboardPage() {
  const me = useMe();
  const stats = useStats();
  const query = useQuery({
    queryKey: ["leaderboard", "weekly"],
    queryFn: () => api.get<LeaderboardWeekly>("/leaderboards/weekly", { around: "me", limit: 20 }),
  });

  return (
    <div className="space-y-5">
      <div>
        <LedgerLabel>Xếp hạng theo tuần</LedgerLabel>
        <h1 className="mt-1 text-2xl">Bảng xếp hạng</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Xếp hạng theo tổng XP kiếm được trong tuần này, tính lại theo thời gian thực.
        </p>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.entries.length === 0 ? (
        <EmptyState
          title="Tuần này chưa có ai ghi điểm"
          description="Học một bài hoặc hoàn thành nhiệm vụ để mở đầu bảng xếp hạng tuần này."
        />
      ) : (
        <>
          <p className="text-xs text-ink-faint">Tuần bắt đầu từ {formatDate(query.data.weekStart)}</p>

          <LedgerTable
            headers={["Hạng", "Học sinh", "Cấp", "XP tuần này"]}
            align={["left", "left", "right", "right"]}
            rows={query.data.entries.map((e) => [
              <span key="rank" className="figure">
                {e.rank}
              </span>,
              <span key="name" className="flex items-center gap-2">
                {e.user.displayName}
                {e.isMe && <Chip tone="moss">Bạn</Chip>}
              </span>,
              <span key="level" className="figure">
                {e.user.level}
              </span>,
              <span key="xp" className="figure">
                {e.xpEarned}
              </span>,
            ])}
          />

          {query.data.me && !query.data.entries.some((e) => e.isMe) && (
            <div className="border-t border-dashed border-rule-strong pt-3">
              <p className="ledger-label mb-2">Hạng của bạn</p>
              <LedgerTable
                headers={["Hạng", "Học sinh", "Cấp", "XP tuần này"]}
                align={["left", "left", "right", "right"]}
                rows={[
                  [
                    <span key="rank" className="figure">
                      {query.data.me.rank}
                    </span>,
                    <span key="name" className="flex items-center gap-2">
                      {me?.displayName ?? "Bạn"}
                      <Chip tone="moss">Bạn</Chip>
                    </span>,
                    <span key="level" className="figure">
                      {stats?.level ?? "-"}
                    </span>,
                    <span key="xp" className="figure">
                      {query.data.me.xpEarned}
                    </span>,
                  ],
                ]}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
