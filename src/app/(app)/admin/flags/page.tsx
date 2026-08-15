"use client";

/**
 * Feature flags (doc 10 scope, doc 03 §14.7): GET /admin/flags to list,
 * PUT /admin/flags/{key} to toggle.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { Alert, Card, CardBody, Chip, EmptyState, ErrorPanel, LedgerTable, SectionTitle, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";

interface Flag {
  key: string;
  enabled: boolean;
  payload: Record<string, unknown> | null;
  isDefault: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

function FlagToggle({ flag }: { flag: Flag }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.put<Flag>(`/admin/flags/${flag.key}`, { enabled, payload: flag.payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-flags"] });
    },
  });
  const err = toggle.error instanceof ApiError ? toggle.error : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        role="switch"
        aria-checked={flag.enabled}
        aria-label={`Bật hoặc tắt cờ ${flag.key}`}
        onClick={() => toggle.mutate(!flag.enabled)}
        disabled={toggle.isPending}
        className={
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 " +
          (flag.enabled ? "border-moss-600 bg-moss-600" : "border-rule-strong bg-paper-sunken")
        }
      >
        <span
          className={
            "absolute top-0.5 h-4 w-4 rounded-full bg-paper-raised transition-transform " +
            (flag.enabled ? "translate-x-6" : "translate-x-1")
          }
        />
      </button>
      {err && <span className="text-xs text-critical">{err.message}</span>}
    </div>
  );
}

export default function AdminFlagsPage() {
  const list = useQuery({
    queryKey: ["admin-flags"],
    queryFn: () => api.get<Flag[]>("/admin/flags"),
  });

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Cờ tính năng</SectionTitle>
        <p className="text-sm text-ink-soft">Bật hoặc tắt tính năng cho toàn bộ người dùng.</p>
      </div>

      <Alert tone="info">Thay đổi có hiệu lực ngay lập tức và bỏ qua bộ nhớ đệm cờ tính năng phía máy chủ.</Alert>

      {list.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : list.isError ? (
        <ErrorPanel error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title="Chưa có cờ tính năng nào" />
      ) : (
        <Card>
          <CardBody>
            <LedgerTable
              headers={["Khóa", "Nguồn", "Cập nhật lần cuối", "Bật/tắt"]}
              align={["left", "left", "left", "right"]}
              rows={list.data.map((flag) => [
                <span key="key" className="figure">{flag.key}</span>,
                <Chip key="src" tone={flag.isDefault ? "neutral" : "moss"}>
                  {flag.isDefault ? "Mặc định" : "Đã ghi đè"}
                </Chip>,
                flag.updatedAt ? formatDate(flag.updatedAt) : "-",
                <FlagToggle key="toggle" flag={flag} />,
              ])}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
