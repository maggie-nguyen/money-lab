"use client";

/**
 * Shared chrome for every simulation screen (doc 10 §6): title, turn
 * indicator, the simulated-data disclaimer, the turn report panel, the
 * awards line and the finished state. The interactive part of each sim is
 * passed as `children` and only rendered while the session is ACTIVE.
 */

import * as React from "react";
import Link from "next/link";
import { Alert, Button, Card, CardBody, Chip, LedgerLabel, SectionTitle } from "@/components/ui";
import { formatBps, formatPct, formatVnd } from "@/lib/format";
import type { Awards, SimSessionView } from "@/lib/types";

const GRADE_TONE: Record<string, "positive" | "moss" | "caution" | "critical"> = {
  A: "positive",
  B: "moss",
  C: "caution",
  D: "critical",
};

function labelForKey(key: string): string {
  return key
    .replace(/Vnd$/, "")
    .replace(/Bps$/, "")
    .replace(/Pct$/, "")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Renders a summary/report object generically: money, bps and pct fields
 * are recognized by their key suffix; everything else prints as text. */
export function KeyValueGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && !["awardBadge", "grade"].includes(k) && typeof v !== "object",
  );
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="ledger-label">{labelForKey(key)}</dt>
          <dd className="figure mt-0.5 text-sm text-ink">{formatValue(key, value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (key.endsWith("Vnd") && (typeof value === "string" || typeof value === "number")) {
    return formatVnd(String(value));
  }
  if (key.endsWith("Bps") && typeof value === "number") return formatBps(value);
  if (key.endsWith("Pct") && typeof value === "number") return formatPct(value);
  return String(value);
}

export function AwardsLine({ awards }: { awards: Awards }) {
  const hasAny = awards.xp > 0 || awards.coins > 0 || awards.badges.length > 0 || awards.levelUp;
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {awards.xp > 0 && (
        <Chip tone="moss" className="figure">
          +{awards.xp} XP
        </Chip>
      )}
      {awards.coins > 0 && (
        <Chip tone="moss" className="figure">
          +{awards.coins} xu
        </Chip>
      )}
      {awards.badges.map((b) => (
        <Chip key={b.code} tone="positive">
          Huy hiệu: {b.title}
        </Chip>
      ))}
      {awards.levelUp && (
        <Chip tone="positive" className="figure">
          Lên cấp {awards.levelUp.to}
        </Chip>
      )}
    </div>
  );
}

export interface SimFrameProps {
  title: string;
  subtitle?: string;
  turnLabel?: string;
  session: SimSessionView;
  /** Rendered inside the "kết quả lượt này" panel; each screen shapes its own report. */
  turnReport?: React.ReactNode;
  staleNotice?: boolean;
  onDismissStaleNotice?: () => void;
  children: React.ReactNode;
}

export function SimFrame({
  title,
  subtitle,
  turnLabel,
  session,
  turnReport,
  staleNotice,
  onDismissStaleNotice,
  children,
}: SimFrameProps) {
  const finished = session.status !== "ACTIVE";
  const summary = session.summary;
  const grade = summary && typeof summary.grade === "string" ? (summary.grade as string) : null;
  const insights = summary && Array.isArray(summary.insights) ? (summary.insights as string[]) : [];
  const tips = summary && Array.isArray(summary.tips) ? (summary.tips as string[]) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {turnLabel && !finished && (
          <Chip tone="neutral" className="figure">
            {turnLabel}
          </Chip>
        )}
      </div>

      <Alert tone="info">
        Đây là dữ liệu mô phỏng, không phải tài khoản tiền thật hay lời khuyên đầu tư.
      </Alert>

      {staleNotice && (
        <Alert tone="warning" title="Phiên đã thay đổi">
          Phiên đã thay đổi, đã tải lại. Vui lòng kiểm tra lại trước khi thao tác tiếp.
          {onDismissStaleNotice && (
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={onDismissStaleNotice}>
                Đã hiểu
              </Button>
            </div>
          )}
        </Alert>
      )}

      {finished ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>
                {session.status === "COMPLETED"
                  ? "Đã hoàn thành"
                  : session.status === "FAILED"
                    ? "Chưa thành công"
                    : "Đã hủy phiên"}
              </SectionTitle>
              {grade && (
                <Chip tone={GRADE_TONE[grade] ?? "neutral"} className="figure">
                  Xếp loại {grade}
                </Chip>
              )}
            </div>
            {summary ? <KeyValueGrid data={summary} /> : <p className="text-sm text-ink-soft">Không có tóm tắt.</p>}
            {insights.length > 0 && (
              <div>
                <LedgerLabel>Bài học rút ra</LedgerLabel>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {insights.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            {tips.length > 0 && (
              <div>
                <LedgerLabel>Gợi ý</LedgerLabel>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {tips.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.awards && <AwardsLine awards={session.awards} />}
            <div>
              <Link href="/sims">
                <Button variant="secondary">Quay lại danh sách mô phỏng</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          {children}

          {turnReport && (
            <Card>
              <CardBody className="space-y-3">
                <SectionTitle>Kết quả lượt này</SectionTitle>
                {turnReport}
              </CardBody>
            </Card>
          )}

          {session.awards && <AwardsLine awards={session.awards} />}
        </>
      )}
    </div>
  );
}
