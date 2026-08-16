"use client";

import { Button, EmptyState, Skeleton, cx } from "@/components/ui";
import { useT } from "@/components/Providers";
import { formatRelative } from "@/lib/format";
import type { TutorThreadView } from "@/lib/types";

export function ThreadList({
  threads,
  isLoading,
  selectedId,
  onSelect,
  onNew,
  newDisabled,
  newPending,
}: {
  threads: TutorThreadView[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  newDisabled?: boolean;
  newPending?: boolean;
}) {
  const t = useT();

  return (
    <div className="flex h-full flex-col gap-3">
      <Button size="sm" onClick={onNew} disabled={newDisabled || newPending} loading={newPending}>
        {t("tutor.thread.new")}
      </Button>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : threads.length === 0 ? (
        <EmptyState title={t("tutor.thread.emptyTitle")} description={t("tutor.thread.emptyDescription")} />
      ) : (
        <ul className="space-y-1.5 overflow-y-auto">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                onClick={() => onSelect(thread.id)}
                aria-current={thread.id === selectedId ? "true" : undefined}
                className={cx(
                  "w-full rounded-[var(--radius-control)] border px-3 py-2 text-left text-sm transition-colors",
                  thread.id === selectedId
                    ? "border-moss-400 bg-moss-50 text-ink"
                    : "border-rule bg-paper-raised text-ink-soft hover:bg-paper-sunken",
                )}
              >
                <div className="truncate font-medium">
                  {thread.title ?? thread.contextTitle ?? t("tutor.thread.general")}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-ink-faint">
                  <span>{t("tutor.thread.messageCount", { count: thread.messageCount })}</span>
                  <span>{formatRelative(thread.lastMessageAt ?? thread.createdAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
