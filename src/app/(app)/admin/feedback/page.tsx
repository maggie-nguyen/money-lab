"use client";

/**
 * Feedback list (doc 10 scope, doc 03 §14.5): status filters and the status
 * update action, PATCH /admin/feedback/{id} { resolved, resolutionNote? }.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  Input,
  Select,
  Skeleton,
} from "@/components/ui";
import { formatRelative } from "@/lib/format";

type Kind = "BUG" | "CONTENT_ERROR" | "SUGGESTION" | "PRAISE" | "OTHER";

const KIND_LABEL: Record<Kind, string> = {
  BUG: "Lỗi",
  CONTENT_ERROR: "Lỗi nội dung",
  SUGGESTION: "Góp ý",
  PRAISE: "Khen ngợi",
  OTHER: "Khác",
};

interface FeedbackItem {
  id: string;
  userId: string | null;
  kind: Kind;
  screenPath: string | null;
  entityType: string | null;
  entityId: string | null;
  body: string;
  screenshotUrl: string | null;
  appVersion: string | null;
  resolvedAt: string | null;
  resolverId: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

function FeedbackRow({ item }: { item: FeedbackItem }) {
  const qc = useQueryClient();
  const [note, setNote] = React.useState(item.resolutionNote ?? "");

  const setResolved = useMutation({
    mutationFn: (resolved: boolean) =>
      api.patch<FeedbackItem>(`/admin/feedback/${item.id}`, { resolved, resolutionNote: note || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
  });

  const err = setResolved.error instanceof ApiError ? setResolved.error : null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Chip tone={item.kind === "BUG" || item.kind === "CONTENT_ERROR" ? "critical" : "neutral"}>
              {KIND_LABEL[item.kind]}
            </Chip>
            <span className="text-xs text-ink-faint">{formatRelative(item.createdAt)}</span>
          </div>
          <Chip tone={item.resolvedAt ? "positive" : "caution"}>{item.resolvedAt ? "Đã xử lý" : "Chưa xử lý"}</Chip>
        </div>

        <p className="text-sm">{item.body}</p>

        <div className="flex flex-wrap gap-3 text-xs text-ink-faint">
          {item.screenPath && <span>Màn hình: {item.screenPath}</span>}
          {item.entityType && (
            <span>
              Đối tượng: {item.entityType}/{item.entityId}
            </span>
          )}
          {item.appVersion && <span>Phiên bản: {item.appVersion}</span>}
        </div>

        {err && (
          <Alert tone="critical" title="Không cập nhật được">
            {err.message}
          </Alert>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-rule pt-3">
          <label className="flex-1 text-sm">
            <span className="ledger-label mb-1 block">Ghi chú xử lý</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tùy chọn" />
          </label>
          {item.resolvedAt ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setResolved.mutate(false)}
              loading={setResolved.isPending}
              disabled={setResolved.isPending}
            >
              Mở lại
            </Button>
          ) : (
            <Button size="sm" onClick={() => setResolved.mutate(true)} loading={setResolved.isPending} disabled={setResolved.isPending}>
              Đánh dấu đã xử lý
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminFeedbackPage() {
  const [resolved, setResolved] = React.useState<"" | "true" | "false">("");
  const [kind, setKind] = React.useState<Kind | "">("");
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = React.useState<string[]>([]);

  // Changing a filter starts the list over. Done in the setter rather than in
  // an effect, so the query never fires once with the previous page's cursor
  // against the new filter before the reset lands.
  function changeFilter<T>(set: (v: T) => void) {
    return (value: T) => {
      set(value);
      setCursor(undefined);
      setCursorStack([]);
    };
  }

  const list = useQuery({
    queryKey: ["admin-feedback", resolved, kind, cursor],
    queryFn: () =>
      api.getWithMeta<FeedbackItem[], { nextCursor: string | null }>("/admin/feedback", {
        resolved: resolved || undefined,
        kind: kind || undefined,
        cursor,
        limit: 20,
      }),
  });
  const nextCursor = list.data?.meta?.nextCursor ?? undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg">Phản hồi</h2>
        <p className="mt-1 text-sm text-ink-soft">Phản hồi và báo lỗi từ người dùng.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="ledger-label mb-1 block">Trạng thái</span>
          <Select value={resolved} onChange={(e) => changeFilter(setResolved)(e.target.value as "" | "true" | "false")}>
            <option value="">Tất cả</option>
            <option value="false">Chưa xử lý</option>
            <option value="true">Đã xử lý</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="ledger-label mb-1 block">Loại</span>
          <Select value={kind} onChange={(e) => changeFilter(setKind)(e.target.value as Kind | "")}>
            <option value="">Tất cả</option>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {list.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : list.isError ? (
        <ErrorPanel error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.data.length === 0 ? (
        <EmptyState title="Không có phản hồi nào" description="Đổi bộ lọc để xem phản hồi khác." />
      ) : (
        <div className="space-y-3">
          {list.data.data.map((item) => (
            <FeedbackRow key={item.id} item={item} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-faint">
          {list.data ? `${list.data.data.length} mục ở trang này` : ""}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={cursorStack.length === 0}
            onClick={() => {
              const next = [...cursorStack];
              const prev = next.pop();
              setCursorStack(next);
              setCursor(prev);
            }}
          >
            Trang trước
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!nextCursor}
            onClick={() => {
              if (!nextCursor) return;
              setCursorStack((prev) => [...prev, cursor ?? ""]);
              setCursor(nextCursor);
            }}
          >
            Trang sau
          </Button>
        </div>
      </div>
    </div>
  );
}
