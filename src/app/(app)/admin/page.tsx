"use client";

/**
 * Admin overview (doc 10 scope): the key numbers from
 * GET /admin/analytics/overview (doc 03 §14.6).
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardBody, EmptyState, ErrorPanel, LedgerTable, SectionTitle, Skeleton, StatStrip } from "@/components/ui";
import { formatDate, formatInt, formatPct } from "@/lib/format";

interface SeriesPoint {
  date: string;
  value: number;
}

interface AnalyticsOverview {
  range: { from: string; to: string };
  series: {
    dau: SeriesPoint[];
    signups: SeriesPoint[];
    lessonsCompleted: SeriesPoint[];
    d1Retention: SeriesPoint[];
  };
  totals: { users: number; activeEnrollments: number; certificates: number };
  activation: { cohortSize: number; activated: number; pct: number | null };
}

function latest(series: SeriesPoint[]): SeriesPoint | null {
  return series.length > 0 ? series[series.length - 1]! : null;
}

export default function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ["admin-analytics-overview"],
    queryFn: () => api.get<AnalyticsOverview>("/admin/analytics/overview"),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />;
  }

  const data = query.data;
  if (!data) {
    return <EmptyState title="Chưa có dữ liệu thống kê" description="Số liệu sẽ xuất hiện sau khi có hoạt động." />;
  }

  const dauLatest = latest(data.series.dau);
  const d1Latest = latest(data.series.d1Retention);
  const days = [...new Set([
    ...data.series.dau.map((p) => p.date),
    ...data.series.signups.map((p) => p.date),
    ...data.series.lessonsCompleted.map((p) => p.date),
  ])].sort();

  const byDate = (series: SeriesPoint[]) => {
    const m = new Map(series.map((p) => [p.date, p.value]));
    return (date: string) => m.get(date) ?? 0;
  };
  const dauOf = byDate(data.series.dau);
  const signupsOf = byDate(data.series.signups);
  const lessonsOf = byDate(data.series.lessonsCompleted);

  return (
    <div className="space-y-6">
      <SectionTitle>Tổng quan</SectionTitle>
      <p className="text-sm text-ink-soft">
        Khoảng thời gian {formatDate(data.range.from)} đến {formatDate(data.range.to)}.
      </p>

      <StatStrip
        items={[
          { label: "Người dùng", value: formatInt(data.totals.users) },
          { label: "Lượt đăng ký khóa học đang hoạt động", value: formatInt(data.totals.activeEnrollments) },
          { label: "Chứng chỉ đã cấp", value: formatInt(data.totals.certificates) },
          { label: "DAU gần nhất", value: dauLatest ? formatInt(dauLatest.value) : "-" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <SectionTitle>Kích hoạt người dùng mới</SectionTitle>
            {data.activation.cohortSize === 0 ? (
              <p className="text-sm text-ink-soft">Chưa có người dùng mới trong khoảng thời gian này.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="figure font-medium">{formatInt(data.activation.activated)}</span> /{" "}
                  <span className="figure">{formatInt(data.activation.cohortSize)}</span> người dùng mới đã hoàn
                  thành ít nhất một bài học.
                </p>
                <p className="figure text-2xl font-semibold">
                  {data.activation.pct !== null ? formatPct(data.activation.pct) : "-"}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <SectionTitle>Giữ chân ngày 1 (D1)</SectionTitle>
            <p className="figure text-2xl font-semibold">
              {d1Latest ? formatPct(d1Latest.value) : "-"}
            </p>
            <p className="mt-1 text-xs text-ink-faint">Giá trị gần nhất trong khoảng thời gian đã chọn.</p>
          </CardBody>
        </Card>
      </div>

      <div>
        <SectionTitle>Chuỗi số liệu theo ngày</SectionTitle>
        {days.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu theo ngày" description="Chuỗi số liệu sẽ được cập nhật theo tác vụ hằng ngày." />
        ) : (
          <LedgerTable
            headers={["Ngày", "DAU", "Đăng ký mới", "Bài học hoàn thành"]}
            align={["left", "right", "right", "right"]}
            rows={days.map((d) => [
              formatDate(d),
              formatInt(dauOf(d)),
              formatInt(signupsOf(d)),
              formatInt(lessonsOf(d)),
            ])}
          />
        )}
      </div>
    </div>
  );
}
