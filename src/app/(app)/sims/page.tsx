"use client";

/**
 * Simulation hub (doc 10 scope): lists sim definitions and starts or resumes
 * a session, then routes to the matching sim screen.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, idempotencyKey } from "@/lib/api";
import { BOOTSTRAP_KEY } from "@/components/Providers";
import { Button, Card, CardBody, Chip, EmptyState, ErrorPanel, Skeleton } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { TopicGlyph, type TopicKind } from "@/components/art/TopicGlyph";
import type { SimDefinitionSummary, SimSessionView, SimType } from "@/lib/types";

const ROUTE_SEGMENT: Record<SimType, string> = {
  BUDGET: "budget",
  LOANS: "loans",
  SCAM: "scam",
  BUSINESS: "business",
  INVEST: "invest",
};

/** The sims reuse the landing page marks, since they cover the same subjects. */
const SIM_GLYPH: Record<SimType, TopicKind> = {
  BUDGET: "budget",
  LOANS: "credit",
  SCAM: "scam",
  BUSINESS: "business",
  INVEST: "invest",
};

const LOCK_REASON_VI: Record<string, string> = {
  LOGIN_REQUIRED: "Đăng nhập để mở khóa",
  COMPLETE_LESSON_FIRST: "Hãy hoàn thành bài học liên quan trước",
  COMPLETE_COURSE_FIRST: "Hãy hoàn thành khóa học liên quan trước",
};

function lockReasonLabel(reason: string | null): string {
  if (!reason) return "Chưa mở khóa";
  return LOCK_REASON_VI[reason] ?? reason;
}

function SimCard({ sim, autoStart }: { sim: SimDefinitionSummary; autoStart: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const segment = ROUTE_SEGMENT[sim.type];

  const start = useMutation({
    mutationFn: () =>
      api.post<SimSessionView>(
        `/sims/${sim.id}/sessions`,
        {},
        // One key per click, as with tutor messages. A key of just the sim id is
        // held for 24 hours, so after finishing or abandoning a run the next
        // start replays the old response and drops the learner back into a
        // session that has already ended.
        { idempotencyKey: idempotencyKey("sim-start", `${sim.id}:${crypto.randomUUID()}`) },
      ),
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      router.push(`/sims/${segment}/${session.id}`);
    },
    onError: (error) => {
      // A run is already open, usually because it was started in another tab.
      // The server names it, so continue into it rather than leaving the card
      // showing a start button that can only ever fail again.
      if (error instanceof ApiError && error.code === "CONFLICT") {
        const sessionId = error.details.find((d) => d.path === "sessionId")?.message;
        void qc.invalidateQueries({ queryKey: ["sims"] });
        if (sessionId) router.push(`/sims/${segment}/${sessionId}`);
      }
    },
  });

  // A SIM_LINK block inside a lesson lands here with ?start=<slug>. The learner
  // already asked for this sim by clicking it, so open it rather than making
  // them find the same card again. Locked sims fall through to the normal card.
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (!autoStart || fired.current || sim.locked) return;
    fired.current = true;
    if (sim.activeSessionId) router.replace(`/sims/${segment}/${sim.activeSessionId}`);
    else start.mutate();
    // start and router are stable for the life of this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, sim.locked, sim.activeSessionId, segment]);

  const startError = start.error instanceof ApiError ? start.error : null;

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <TopicGlyph kind={SIM_GLYPH[sim.type]} className="mt-0.5 h-9 w-9 shrink-0 text-moss-600" />
            <div>
              <h2 className="text-lg">{sim.title}</h2>
              {sim.subtitle && <p className="mt-1 text-sm text-ink-soft">{sim.subtitle}</p>}
            </div>
          </div>
          {sim.locked && <Chip tone="caution">{lockReasonLabel(sim.lockReason)}</Chip>}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-ink-faint">
          <span>{formatMinutes(sim.estimatedMinutes)}</span>
          <span aria-hidden>·</span>
          <span className="figure">+{sim.xpRewardComplete} XP khi hoàn thành</span>
        </div>

        {startError && (
          <p className="text-xs text-critical">
            {startError.code === "CONFLICT"
              ? "Đã có phiên đang chạy cho mô phỏng này, đang mở lại phiên đó."
              : startError.message}
          </p>
        )}

        <div>
          {sim.locked ? (
            <Button variant="secondary" disabled>
              Bị khóa
            </Button>
          ) : sim.activeSessionId ? (
            <Button onClick={() => router.push(`/sims/${segment}/${sim.activeSessionId}`)}>Tiếp tục</Button>
          ) : (
            <Button onClick={() => start.mutate()} loading={start.isPending} disabled={start.isPending}>
              Bắt đầu
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function SimsHubPage() {
  const startSlug = useSearchParams().get("start");
  const query = useQuery({
    queryKey: ["sims"],
    queryFn: () => api.get<SimDefinitionSummary[]>("/sims"),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">Mô phỏng</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Thực hành các tình huống tài chính trong môi trường giả lập, an toàn để mắc lỗi.
        </p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState title="Chưa có mô phỏng nào" description="Quay lại sau khi có nội dung mới." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {query.data.map((sim) => (
            <SimCard key={sim.id} sim={sim} autoStart={sim.slug === startSlug} />
          ))}
        </div>
      )}
    </div>
  );
}
