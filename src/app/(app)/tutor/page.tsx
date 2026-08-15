"use client";

/**
 * AI tutor (doc 03 §9). Responses are synchronous, no streaming, so the
 * composer shows a pending state while the server call is in flight. Guests
 * and the feature flag gate access before any call is made.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, idempotencyKey } from "@/lib/api";
import { useFeatureFlag, useMe } from "@/components/Providers";
import { Alert, EmptyState, ErrorPanel, LedgerLabel, Skeleton } from "@/components/ui";
import { Composer } from "@/components/tutor/Composer";
import { MessageThread } from "@/components/tutor/MessageThread";
import { ThreadList } from "@/components/tutor/ThreadList";
import type { TutorMessageView, TutorThreadView, TutorUsage } from "@/lib/types";

interface ThreadDetail extends TutorThreadView {
  messages: TutorMessageView[];
}

interface SendMessageResult {
  userMessage: TutorMessageView;
  assistantMessage: TutorMessageView;
  remainingToday: number;
}

export default function TutorPage() {
  const me = useMe();
  const tutorEnabled = useFeatureFlag("ai_tutor_enabled");
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pendingContent, setPendingContent] = React.useState<string | null>(null);

  const canUseTutor = Boolean(me && tutorEnabled);

  const threadsQuery = useQuery({
    queryKey: ["tutor", "threads"],
    queryFn: () => api.get<TutorThreadView[]>("/tutor/threads"),
    enabled: canUseTutor,
  });

  const usageQuery = useQuery({
    queryKey: ["tutor", "usage"],
    queryFn: () => api.get<TutorUsage>("/tutor/usage"),
    enabled: canUseTutor,
  });

  React.useEffect(() => {
    if (!selectedId && threadsQuery.data && threadsQuery.data.length > 0) {
      setSelectedId(threadsQuery.data[0]!.id);
    }
  }, [selectedId, threadsQuery.data]);

  const threadQuery = useQuery({
    queryKey: ["tutor", "thread", selectedId],
    queryFn: () => api.get<ThreadDetail>(`/tutor/threads/${selectedId}`),
    enabled: canUseTutor && selectedId !== null,
  });

  const createThread = useMutation({
    mutationFn: () => api.post<TutorThreadView>("/tutor/threads", { contextType: "GENERAL" }),
    onSuccess: (thread) => {
      void qc.invalidateQueries({ queryKey: ["tutor", "threads"] });
      setSelectedId(thread.id);
    },
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => {
      if (!selectedId) throw new Error("Chưa chọn cuộc trò chuyện");
      return api.post<SendMessageResult>(
        `/tutor/threads/${selectedId}/messages`,
        { content },
        { idempotencyKey: idempotencyKey("tutor-message", selectedId, crypto.randomUUID()) },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tutor", "thread", selectedId] });
      void qc.invalidateQueries({ queryKey: ["tutor", "threads"] });
      void qc.invalidateQueries({ queryKey: ["tutor", "usage"] });
    },
    onSettled: () => setPendingContent(null),
  });

  function handleSend(content: string) {
    setPendingContent(content);
    sendMessage.mutate(content);
  }

  const sendError = sendMessage.error instanceof ApiError ? sendMessage.error : null;
  const usedUp = usageQuery.data ? usageQuery.data.remainingToday <= 0 : false;

  let composerDisabledReason: string | undefined;
  if (sendError) {
    composerDisabledReason =
      sendError.status === 429
        ? "Bạn đã dùng hết lượt hỏi hôm nay. Quay lại vào ngày mai."
        : sendError.message;
  } else if (usedUp) {
    composerDisabledReason = "Bạn đã dùng hết lượt hỏi hôm nay. Quay lại vào ngày mai.";
  }

  if (!me) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tutorEnabled) {
    return (
      <div className="space-y-5">
        <div>
          <LedgerLabel>Trợ giảng</LedgerLabel>
          <h1 className="mt-1 text-2xl">Trợ giảng AI</h1>
        </div>
        <EmptyState title="Trợ giảng AI hiện chưa bật" description="Tính năng này sẽ sớm được mở cho tài khoản của bạn." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <LedgerLabel>Trợ giảng</LedgerLabel>
          <h1 className="mt-1 text-2xl">Trợ giảng AI</h1>
        </div>
        {usageQuery.data && (
          <p className="figure text-sm text-ink-soft">
            Còn lại hôm nay: {usageQuery.data.remainingToday}/{usageQuery.data.limitPerDay} tin nhắn
          </p>
        )}
      </div>

      <Alert tone="info">
        Trợ giảng hỗ trợ học tập, không phải lời khuyên đầu tư hay tài chính cá nhân. Hãy kiểm tra lại
        thông tin quan trọng với người lớn đáng tin cậy.
      </Alert>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="md:h-[560px]">
          <ThreadList
            threads={threadsQuery.data ?? []}
            isLoading={threadsQuery.isLoading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNew={() => createThread.mutate()}
            newPending={createThread.isPending}
          />
        </div>

        <div className="flex h-[560px] flex-col rounded-[var(--radius-card)] border border-rule bg-paper-raised p-4">
          {threadsQuery.isError ? (
            <ErrorPanel error={threadsQuery.error} onRetry={() => threadsQuery.refetch()} />
          ) : !selectedId ? (
            <EmptyState title="Chưa có cuộc trò chuyện nào" description="Bấm “Cuộc trò chuyện mới” để bắt đầu hỏi trợ giảng." />
          ) : threadQuery.isError ? (
            <ErrorPanel error={threadQuery.error} onRetry={() => threadQuery.refetch()} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto pr-1">
                <MessageThread
                  messages={threadQuery.data?.messages ?? []}
                  isLoading={threadQuery.isLoading}
                  pendingContent={pendingContent}
                />
              </div>
              <Composer
                disabled={Boolean(composerDisabledReason) && !sendMessage.isPending}
                disabledReason={composerDisabledReason}
                pending={sendMessage.isPending}
                onSend={handleSend}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
