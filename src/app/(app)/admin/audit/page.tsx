"use client";

/**
 * Audit log (doc 10 scope, doc 03 §14.7): GET /admin/audit-log with cursor
 * pagination, showing actor, action, target and time.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, CardBody, EmptyState, ErrorPanel, Input, LedgerTable, SectionTitle, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";

interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export default function AdminAuditPage() {
  const [entityType, setEntityType] = React.useState("");
  const [actorId, setActorId] = React.useState("");
  const [action, setAction] = React.useState("");
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = React.useState<string[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Changing a filter starts the list over. Done in the setter rather than in
  // an effect, so the query never fires once with the previous page's cursor
  // against the new filter before the reset lands.
  function changeFilter(set: (v: string) => void) {
    return (value: string) => {
      set(value);
      setCursor(undefined);
      setCursorStack([]);
    };
  }

  const list = useQuery({
    queryKey: ["admin-audit-log", entityType, actorId, action, cursor],
    queryFn: () =>
      api.getWithMeta<AuditEntry[], { nextCursor: string | null }>("/admin/audit-log", {
        entityType: entityType || undefined,
        actorId: actorId || undefined,
        action: action || undefined,
        cursor,
        limit: 50,
      }),
  });
  const nextCursor = list.data?.meta?.nextCursor ?? undefined;

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Nhật ký</SectionTitle>
        <p className="text-sm text-ink-soft">Mọi thao tác ghi dữ liệu của quản trị viên đều được ghi lại tại đây.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="ledger-label mb-1 block">Loại đối tượng</span>
          <Input value={entityType} onChange={(e) => changeFilter(setEntityType)(e.target.value)} placeholder="vd. lesson" className="w-40" />
        </label>
        <label className="text-sm">
          <span className="ledger-label mb-1 block">ID người thực hiện</span>
          <Input value={actorId} onChange={(e) => changeFilter(setActorId)(e.target.value)} className="w-56" />
        </label>
        <label className="text-sm">
          <span className="ledger-label mb-1 block">Hành động</span>
          <Input value={action} onChange={(e) => changeFilter(setAction)(e.target.value)} placeholder="vd. publish" className="w-40" />
        </label>
      </div>

      {list.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : list.isError ? (
        <ErrorPanel error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.data.length === 0 ? (
        <EmptyState title="Không có bản ghi nhật ký nào" description="Đổi bộ lọc để xem thêm." />
      ) : (
        <Card>
          <CardBody>
            <LedgerTable
              headers={["Thời gian", "Người thực hiện", "Hành động", "Đối tượng", ""]}
              align={["left", "left", "left", "left", "left"]}
              rows={list.data.data.map((entry) => [
                formatDate(entry.createdAt, { weekday: false }),
                <span key="actor" className="figure text-xs">{entry.actorId}</span>,
                entry.action,
                <span key="target" className="text-xs">
                  {entry.entityType}/{entry.entityId}
                </span>,
                <button
                  key="toggle"
                  className="text-moss-600 underline underline-offset-2"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  {expandedId === entry.id ? "Ẩn chi tiết" : "Chi tiết"}
                </button>,
              ])}
            />
            {expandedId && (
              <div className="mt-3 space-y-2 border-t border-rule pt-3">
                {list.data.data
                  .filter((e) => e.id === expandedId)
                  .map((e) => (
                    <div key={e.id} className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="ledger-label mb-1">Trước</div>
                        <pre className="scroll-x rounded-[var(--radius-control)] bg-paper-sunken p-2 text-xs">
                          {JSON.stringify(e.before, null, 2) ?? "null"}
                        </pre>
                      </div>
                      <div>
                        <div className="ledger-label mb-1">Sau</div>
                        <pre className="scroll-x rounded-[var(--radius-control)] bg-paper-sunken p-2 text-xs">
                          {JSON.stringify(e.after, null, 2) ?? "null"}
                        </pre>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardBody>
        </Card>
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
