"use client";

/**
 * Content list (doc 10 scope): tracks, courses, lessons and library articles
 * with status and a filter, linking through to the editor at
 * /admin/content/{type}/{id}.
 * Doc 03 §14.1 also covers modules, quizzes, questions, badges, shop items and
 * surveys, but the brief scopes this screen to tracks, courses and lessons.
 */

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, CardBody, Chip, EmptyState, ErrorPanel, Input, LedgerTable, Select, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";

type ContentType = "tracks" | "courses" | "lessons" | "articles";
type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã xuất bản",
  ARCHIVED: "Đã lưu trữ",
};

const STATUS_TONE: Record<Status, "neutral" | "positive" | "caution"> = {
  DRAFT: "caution",
  PUBLISHED: "positive",
  ARCHIVED: "neutral",
};

interface AdminRow {
  id: string;
  slug: string;
  order: number;
  status: Status;
  updatedAt: string;
  i18n: Record<string, { title?: string } | undefined>;
  trackId?: string;
  courseId?: string;
}

function titleOf(row: AdminRow): string {
  return row.i18n.vi?.title ?? row.slug;
}

export default function AdminContentPage() {
  const [type, setType] = React.useState<ContentType>("tracks");
  const [status, setStatus] = React.useState<Status | "">("");
  const [q, setQ] = React.useState("");
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

  const query = useQuery({
    queryKey: ["admin-content", type, status, q, cursor],
    queryFn: () =>
      api.getWithMeta<AdminRow[], { nextCursor: string | null }>(`/admin/${type}`, {
        status: status || undefined,
        q: q || undefined,
        cursor,
        limit: 20,
      }),
  });
  const nextCursor = query.data?.meta?.nextCursor ?? undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="ledger-label mb-1 block">Loại nội dung</span>
            <Select value={type} onChange={(e) => changeFilter(setType)(e.target.value as ContentType)}>
              <option value="tracks">Chủ đề</option>
              <option value="courses">Khóa học</option>
              <option value="lessons">Bài học</option>
              <option value="articles">Bài viết</option>
            </Select>
          </label>
          <label className="text-sm">
            <span className="ledger-label mb-1 block">Trạng thái</span>
            <Select value={status} onChange={(e) => changeFilter(setStatus)(e.target.value as Status | "")}>
              <option value="">Tất cả</option>
              <option value="DRAFT">Bản nháp</option>
              <option value="PUBLISHED">Đã xuất bản</option>
              <option value="ARCHIVED">Đã lưu trữ</option>
            </Select>
          </label>
          <label className="text-sm">
            <span className="ledger-label mb-1 block">Tìm kiếm</span>
            <Input value={q} onChange={(e) => changeFilter(setQ)(e.target.value)} placeholder="Slug hoặc tiêu đề" className="w-56" />
          </label>
        </div>
        <Link href={`/admin/content/${type}/new`}>
          <Button size="sm">Tạo mới</Button>
        </Link>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.data.length === 0 ? (
        <EmptyState
          title="Không có nội dung nào"
          description="Đổi bộ lọc hoặc tạo mới để bắt đầu."
        />
      ) : (
        <Card>
          <CardBody>
            <LedgerTable
              headers={["Slug", "Tiêu đề", "Thứ tự", "Trạng thái", "Cập nhật", ""]}
              align={["left", "left", "right", "left", "left", "left"]}
              rows={query.data.data.map((row) => [
                <span key="slug" className="figure">{row.slug}</span>,
                titleOf(row),
                row.order,
                <Chip key="status" tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Chip>,
                formatDate(row.updatedAt),
                <Link key="edit" href={`/admin/content/${type}/${row.id}`} className="text-moss-600 underline underline-offset-2">
                  Sửa
                </Link>,
              ])}
            />
          </CardBody>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-faint">
          {query.data ? `${query.data.data.length} mục ở trang này` : ""}
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
