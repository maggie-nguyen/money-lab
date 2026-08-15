"use client";

/**
 * The learner ledger (doc 10 scope): stats, level and XP progress, streak,
 * badges, certificates and recent XP activity.
 */

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe, useStats } from "@/components/Providers";
import {
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  LedgerTable,
  ProgressBar,
  SectionTitle,
  Skeleton,
  StatStrip,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { BadgeView, CertificateView } from "@/lib/types";

interface LedgerEntry {
  delta: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

interface LedgerPage {
  data: LedgerEntry[];
  nextCursor?: string | null;
}

function BadgeGrid({ badges }: { badges: BadgeView[] }) {
  if (badges.length === 0) {
    return <EmptyState title="Chưa có huy hiệu nào" description="Hoàn thành bài học và mô phỏng để mở khóa huy hiệu." />;
  }
  // Earned first, so the ledger reads as a record of what the learner has done.
  const ordered = [...badges].sort((a, b) => Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt)));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((b) => (
        <Card key={b.code} className={b.earnedAt ? undefined : "opacity-70"}>
          <CardBody className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{b.title}</h3>
              {b.earnedAt ? <Chip tone="positive">Đã đạt</Chip> : <Chip tone="neutral">Chưa đạt</Chip>}
            </div>
            <p className="text-xs text-ink-soft">{b.description}</p>
            {b.earnedAt ? (
              <p className="text-xs text-ink-faint">Đạt được {formatDate(b.earnedAt)}</p>
            ) : (
              b.coinReward > 0 && (
                <p className="figure text-xs text-ink-faint">Thưởng {b.coinReward} xu</p>
              )
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function CertificateList({ certificates }: { certificates: CertificateView[] }) {
  if (certificates.length === 0) {
    return (
      <EmptyState
        title="Chưa có chứng chỉ nào"
        description="Hoàn thành trọn vẹn một khóa học để nhận chứng chỉ."
        action={
          <Link href="/learn" className="text-sm font-medium text-moss-400 underline underline-offset-2">
            Xem các khóa học
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {certificates.map((c) => (
        <Card key={c.id}>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{c.courseTitle}</h3>
              <p className="mt-0.5 text-xs text-ink-faint">
                Cấp ngày {formatDate(c.issuedAt)} · Mã {c.code}
              </p>
            </div>
            <a
              href={c.shareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-moss-400 underline underline-offset-2"
            >
              Xem chứng chỉ
            </a>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function ledgerReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    LESSON_COMPLETE: "Hoàn thành bài học",
    QUIZ_PASSED: "Đạt bài kiểm tra",
    SIM_COMPLETE: "Hoàn thành mô phỏng",
    QUEST_COMPLETE: "Hoàn thành nhiệm vụ",
    BADGE_AWARDED: "Được trao huy hiệu",
    STREAK_BONUS: "Thưởng chuỗi ngày học",
    SHOP_PURCHASE: "Mua trong cửa hàng",
  };
  return map[reason] ?? reason;
}

function RecentActivity() {
  const query = useQuery({
    queryKey: ["me", "ledger", "xp"],
    queryFn: () => api.get<LedgerPage>("/me/ledger", { type: "xp", limit: 10 }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />;
  }
  const entries = query.data?.data ?? [];
  if (entries.length === 0) {
    return <EmptyState title="Chưa có hoạt động nào" description="Hoàn thành một bài học hoặc một mô phỏng để bắt đầu ghi sổ." />;
  }
  return (
    <LedgerTable
      headers={["Ngày", "Hoạt động", "XP"]}
      align={["left", "left", "right"]}
      rows={entries.map((e) => [
        formatDate(e.createdAt),
        ledgerReasonLabel(e.reason),
        <span key="delta" className={e.delta >= 0 ? "text-positive" : "text-critical"}>
          {e.delta >= 0 ? "+" : ""}
          {e.delta}
        </span>,
      ])}
    />
  );
}

export default function ProfilePage() {
  const me = useMe();
  const stats = useStats();

  const badgesQuery = useQuery({
    queryKey: ["me", "badges"],
    queryFn: () => api.get<BadgeView[]>("/me/badges"),
  });
  const certificatesQuery = useQuery({
    queryKey: ["me", "certificates"],
    queryFn: () => api.get<CertificateView[]>("/me/certificates"),
  });

  if (!me || !stats) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <LedgerLabel>Hồ sơ học tập</LedgerLabel>
        <h1 className="mt-1 text-2xl">{me.displayName}</h1>
        <p className="mt-1 text-sm text-ink-soft">{me.email ?? ""}</p>
      </div>

      <StatStrip
        items={[
          { label: "Cấp độ", value: stats.level },
          { label: "Tổng XP", value: stats.xpTotal },
          { label: "Xu", value: stats.coins },
          { label: "Chuỗi ngày học", value: stats.streakCurrent, hint: "ngày" },
        ]}
      />

      <section>
        <SectionTitle>Tiến độ lên cấp</SectionTitle>
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">Cấp {stats.level}</span>
              <span className="figure text-ink-soft">
                {stats.xpTotal} / {stats.xpForNextLevel} XP
              </span>
            </div>
            <ProgressBar
              value={stats.xpTotal}
              max={stats.xpForNextLevel}
              label="Tiến độ lên cấp tiếp theo"
            />
          </CardBody>
        </Card>
      </section>

      <section>
        <SectionTitle>Chuỗi ngày học</SectionTitle>
        <StatStrip
          items={[
            { label: "Đang giữ", value: stats.streakCurrent, hint: "ngày" },
            { label: "Dài nhất", value: stats.streakLongest, hint: "ngày" },
            { label: "Lượt bảo lưu còn lại", value: stats.streakFreezes },
            { label: "Bài học đã hoàn thành", value: stats.lessonsCompleted },
          ]}
        />
      </section>

      <section>
        <SectionTitle>Huy hiệu</SectionTitle>
        {badgesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : badgesQuery.isError ? (
          <ErrorPanel error={badgesQuery.error} onRetry={() => badgesQuery.refetch()} />
        ) : (
          <BadgeGrid badges={badgesQuery.data ?? []} />
        )}
      </section>

      <section>
        <SectionTitle>Chứng chỉ</SectionTitle>
        {certificatesQuery.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : certificatesQuery.isError ? (
          <ErrorPanel error={certificatesQuery.error} onRetry={() => certificatesQuery.refetch()} />
        ) : (
          <CertificateList certificates={certificatesQuery.data ?? []} />
        )}
      </section>

      <section>
        <SectionTitle>Hoạt động gần đây</SectionTitle>
        <RecentActivity />
      </section>

      <p className="text-xs text-ink-faint">
        Mọi con số trong hồ sơ này do máy chủ tính toán, trình duyệt chỉ hiển thị lại.
      </p>
    </div>
  );
}
