"use client";

import { Button, EmptyState, Skeleton, cx } from "@/components/ui";
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
  return (
    <div className="flex h-full flex-col gap-3">
      <Button size="sm" onClick={onNew} disabled={newDisabled || newPending} loading={newPending}>
        Cuộc trò chuyện mới
      </Button>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : threads.length === 0 ? (
        <EmptyState title="Chưa có cuộc trò chuyện" description="Bắt đầu một cuộc trò chuyện mới với trợ giảng." />
      ) : (
        <ul className="space-y-1.5 overflow-y-auto">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onSelect(t.id)}
                aria-current={t.id === selectedId ? "true" : undefined}
                className={cx(
                  "w-full rounded-[var(--radius-control)] border px-3 py-2 text-left text-sm transition-colors",
                  t.id === selectedId
                    ? "border-moss-400 bg-moss-50 text-ink"
                    : "border-rule bg-paper-raised text-ink-soft hover:bg-paper-sunken",
                )}
              >
                <div className="truncate font-medium">
                  {t.title ?? t.contextTitle ?? "Cuộc trò chuyện chung"}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-ink-faint">
                  <span>{t.messageCount} tin nhắn</span>
                  <span>{formatRelative(t.lastMessageAt ?? t.createdAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
