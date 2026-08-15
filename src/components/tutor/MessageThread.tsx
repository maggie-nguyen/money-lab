"use client";

import { EmptyState, Skeleton, Spinner, cx } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import type { TutorMessageView } from "@/lib/types";

function MessageBubble({ message }: { message: TutorMessageView }) {
  const mine = message.role === "USER";
  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-[var(--radius-card)] border px-3.5 py-2.5 text-sm whitespace-pre-wrap",
          mine ? "border-moss-600 bg-moss-600 text-paper" : "border-rule bg-paper-raised text-ink",
        )}
      >
        <p>{message.content}</p>
        <p className={cx("mt-1 text-[11px]", mine ? "text-paper/70" : "text-ink-faint")}>
          {formatRelative(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function MessageThread({
  messages,
  isLoading,
  pendingContent,
}: {
  messages: TutorMessageView[];
  isLoading: boolean;
  /** The learner's message shown optimistically while the reply is pending. */
  pendingContent: string | null;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-12 w-1/2" />
        <Skeleton className="h-16 w-2/3" />
      </div>
    );
  }

  if (messages.length === 0 && !pendingContent) {
    return (
      <EmptyState
        title="Bắt đầu hỏi trợ giảng"
        description="Hỏi về khái niệm tài chính, một bài học, hoặc một mô phỏng bạn đang làm."
      />
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {pendingContent && (
        <>
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-[var(--radius-card)] border border-moss-600 bg-moss-600 px-3.5 py-2.5 text-sm text-paper whitespace-pre-wrap">
              {pendingContent}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-faint">
            <Spinner />
            <span>Trợ giảng đang trả lời...</span>
          </div>
        </>
      )}
    </div>
  );
}
