"use client";

/**
 * SCAM sim, "Nhận diện lừa đảo" (doc 04 §4). Inbox game: one message per round,
 * decide SCAM or SAFE, then see the immediate feedback before the next one.
 */

import * as React from "react";
import { useParams } from "next/navigation";
import { SimFrame } from "@/components/sim/SimFrame";
import { useSimSession } from "@/components/sim/useSimSession";
import { useT } from "@/components/Providers";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  ProgressBar,
  SectionTitle,
  Skeleton,
} from "@/components/ui";

interface ScamDecisionView {
  key: string;
  verdict: "SCAM" | "SAFE";
  correct: boolean;
  isScam: boolean;
  scamType: string | null;
  cueHits: number;
  pointsDelta: number;
  explanation: string;
  cues: string[];
}

interface ScamView {
  round: number;
  rounds: number;
  score: number;
  current: { key: string; channel: string; sender: string; text: string } | null;
  decisions: ScamDecisionView[];
}

function hasAction(actions: Array<{ type: string }>, type: string): boolean {
  return actions.some((a) => a.type === type);
}

export default function ScamSimPage() {
  const t = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, isLoading, isError, error, refetch, act, isActing, staleNotice, dismissStaleNotice } =
    useSimSession(sessionId);

  const view = session?.view as ScamView | undefined;

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError) return <ErrorPanel error={error} onRetry={() => refetch()} />;
  if (!session || !view) return <EmptyState title={t("sims.sessionNotFound")} />;

  const availableActions = session.availableActions;
  const lastDecision = view.decisions[view.decisions.length - 1];

  return (
    <SimFrame
      title={t("sims.scam.title")}
      subtitle={t("sims.scam.subtitle")}
      turnLabel={t("sims.scam.turnLabel", { round: view.round, rounds: view.rounds })}
      session={session}
      staleNotice={staleNotice}
      onDismissStaleNotice={dismissStaleNotice}
    >
      <Card>
        <CardBody className="flex items-center justify-between gap-4">
          <div>
            <LedgerLabel>{t("sims.scam.score")}</LedgerLabel>
            <div className="figure mt-1 text-2xl font-semibold">{view.score}</div>
          </div>
          <div className="w-40">
            <ProgressBar value={view.round - 1} max={view.rounds} />
          </div>
        </CardBody>
      </Card>

      {lastDecision && (
        <Alert
          tone={lastDecision.correct ? "positive" : "critical"}
          title={lastDecision.correct ? t("sims.scam.correct") : t("sims.scam.incorrect")}
        >
          <p>{lastDecision.explanation}</p>
          <p className="mt-1 text-xs">
            {lastDecision.isScam ? t("sims.scam.feedbackScam") : t("sims.scam.feedbackSafe")}
            {lastDecision.isScam && lastDecision.cues.length > 0
              ? t("sims.scam.cues", { cues: lastDecision.cues.join(", ") })
              : ""}
            .{" "}
            {t("sims.scam.points", {
              delta: `${lastDecision.pointsDelta >= 0 ? "+" : ""}${lastDecision.pointsDelta}`,
            })}
          </p>
        </Alert>
      )}

      {view.current && (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle action={<Chip tone="neutral">{view.current.channel}</Chip>}>
              {t("sims.scam.newMessage")}
            </SectionTitle>
            <div className="rounded-[var(--radius-control)] border border-rule bg-paper-sunken p-4">
              <p className="text-sm font-medium text-ink">{view.current.sender}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{view.current.text}</p>
            </div>
            {hasAction(availableActions, "DECIDE") && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={isActing}
                  loading={isActing}
                  onClick={() => act({ type: "DECIDE", verdict: "SCAM" })}
                >
                  {t("sims.scam.verdictScam")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={isActing}
                  onClick={() => act({ type: "DECIDE", verdict: "SAFE" })}
                >
                  {t("sims.scam.verdictSafe")}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </SimFrame>
  );
}
