/**
 * Quiz runner, doc 03 §5. Loads an already-created attempt, answers one
 * question at a time, submits, then shows the result screen.
 *
 * The GET/PUT/POST routes are nested under /quizzes/{quizId}/attempts/{id},
 * so this screen needs the quizId as well as the attemptId. Every entry
 * point (lesson check quiz, course final quiz) routes here with
 * `?quizId=...` on the URL; `pass` (pass threshold pct) and `back` (where to
 * go after finishing) are optional companions set by the caller.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import type { AttemptState, Awards, QuestionPublic } from "@/lib/types";
import { BOOTSTRAP_KEY, useT, useToast } from "@/components/Providers";
import type { TranslateFn } from "@/lib/i18n";
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorPanel,
  LedgerLabel,
  ProgressBar,
  Skeleton,
} from "@/components/ui";
import { QuestionInput } from "@/components/quiz/QuestionInput";

type AttemptWithQuestions = AttemptState & { questions: QuestionPublic[] };
type SubmitResponse = AttemptState & { awards: Awards };

function questionTypeLabel(type: QuestionPublic["type"], t: TranslateFn): string {
  return t(`quiz.type.${type}`);
}

export default function QuizAttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;
  const search = useSearchParams();
  const quizId = search.get("quizId");
  const passParam = search.get("pass");
  const passThresholdPct = passParam ? Number(passParam) : null;
  const backHref = search.get("back");

  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();

  const attemptQuery = useQuery({
    queryKey: ["attempt", attemptId, quizId],
    queryFn: () => api.get<AttemptWithQuestions>(`/quizzes/${quizId}/attempts/${attemptId}`),
    enabled: Boolean(quizId && attemptId),
  });

  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [index, setIndex] = React.useState(0);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (seeded.current || !attemptQuery.data) return;
    seeded.current = true;
    const seed: Record<string, unknown> = {};
    for (const a of attemptQuery.data.answers) seed[a.questionId] = a.response;
    setAnswers(seed);
  }, [attemptQuery.data]);

  const saveAnswer = useMutation({
    mutationFn: async ({ questionId, response }: { questionId: string; response: unknown }) => {
      if (!quizId) throw new Error(t("quiz.missingId"));
      return api.put<{ saved: true }>(`/quizzes/${quizId}/attempts/${attemptId}/answers/${questionId}`, {
        response,
      });
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!quizId) throw new Error(t("quiz.missingId"));
      return api.post<SubmitResponse>(
        `/quizzes/${quizId}/attempts/${attemptId}/submit`,
        undefined,
        { idempotencyKey: idempotencyKey("quiz-submit", attemptId) },
      );
    },
    onSuccess: async (result) => {
      qc.setQueryData(["attempt", attemptId, quizId], (prev: AttemptWithQuestions | undefined) =>
        prev ? { ...prev, ...result } : prev,
      );
      await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      toast({ tone: "positive", message: t("quiz.submittedToast") });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : t("quiz.submitFailed");
      toast({ tone: "critical", message });
    },
  });

  const startNew = useMutation({
    mutationFn: async () => {
      if (!quizId) throw new Error(t("quiz.missingId"));
      return api.post<AttemptState>(`/quizzes/${quizId}/attempts`);
    },
    onSuccess: (attempt) => {
      const qs = new URLSearchParams();
      qs.set("quizId", attempt.quizId);
      if (passParam) qs.set("pass", passParam);
      if (backHref) qs.set("back", backHref);
      router.replace(`/quiz/${attempt.id}?${qs.toString()}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const existingId = err.details[0]?.message;
        if (existingId && quizId) {
          const qs = new URLSearchParams();
          qs.set("quizId", quizId);
          if (passParam) qs.set("pass", passParam);
          if (backHref) qs.set("back", backHref);
          router.replace(`/quiz/${existingId}?${qs.toString()}`);
          return;
        }
      }
      toast({
        tone: "critical",
        message: err instanceof ApiError ? err.message : t("quiz.restartFailed"),
      });
    },
  });

  if (!quizId) {
    return (
      <EmptyState
        title={t("quiz.missingTitle")}
        description={t("quiz.missingDescription")}
        action={
          <Link href="/learn">
            <Button variant="secondary">{t("quiz.backToLearn")}</Button>
          </Link>
        }
      />
    );
  }

  if (attemptQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (attemptQuery.isError) {
    return <ErrorPanel error={attemptQuery.error} onRetry={() => attemptQuery.refetch()} />;
  }

  const attempt = attemptQuery.data;
  if (!attempt) {
    return <EmptyState title={t("quiz.notFound")} />;
  }

  if (attempt.status === "EXPIRED") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone="warning" title={t("quiz.expiredTitle")}>
          {t("quiz.expiredBody")}
        </Alert>
        <Button onClick={() => startNew.mutate()} loading={startNew.isPending}>
          {t("quiz.tryAgain")}
        </Button>
      </div>
    );
  }

  const questionOrder = attempt.questionOrder;
  const questionsById = new Map(attempt.questions.map((q) => [q.id, q]));

  if (attempt.status === "SUBMITTED" && attempt.result) {
    const result = attempt.result;
    const passed = result.passed;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card tone={passed ? "ink" : "flat"}>
          <CardBody className="space-y-2 text-center">
            <LedgerLabel className={passed ? "text-paper/70" : undefined}>{t("quiz.result")}</LedgerLabel>
            <p className="font-display text-3xl font-semibold">
              <span className="figure">{result.scorePct}</span>%
            </p>
            <p className="figure text-sm opacity-90">
              {t("quiz.scorePoints", { score: result.scorePoints, max: result.maxPoints })}
              {passThresholdPct !== null && ` · ${t("quiz.passThreshold", { pct: passThresholdPct })}`}
            </p>
            <p className="text-base font-medium">{passed ? t("quiz.passed") : t("quiz.failed")}</p>
          </CardBody>
        </Card>

        {!passed && (
          <Button onClick={() => startNew.mutate()} loading={startNew.isPending} variant="secondary">
            {t("quiz.tryAgain")}
          </Button>
        )}

        <div className="space-y-4">
          <h2 className="text-lg">{t("quiz.reviewTitle")}</h2>
          {questionOrder.map((qid, i) => {
            const q = questionsById.get(qid);
            const pq = result.perQuestion.find((p) => p.questionId === qid);
            if (!q || !pq) return null;
            return (
              <Card key={qid}>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <LedgerLabel>
                        {t("quiz.reviewMeta", { n: i + 1, type: questionTypeLabel(q.type, t) })}
                      </LedgerLabel>
                      <p className="mt-1 font-medium">{q.prompt}</p>
                    </div>
                    <span className={`figure shrink-0 text-sm font-semibold ${pq.isCorrect ? "text-positive" : "text-critical"}`}>
                      {pq.isCorrect ? t("quiz.correct") : t("quiz.incorrect")} · {pq.pointsAwarded}/{q.points}
                    </span>
                  </div>
                  <QuestionInput
                    question={q}
                    value={answers[qid]}
                    onChange={() => undefined}
                    mode="review"
                    correctResponse={pq.correctResponse}
                  />
                  {pq.explanation && (
                    <Alert tone="info" title={t("quiz.explanation")}>
                      {pq.explanation}
                    </Alert>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Link href={backHref ?? "/learn"}>
            <Button variant="secondary">{t("common.continue")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  // In-progress: answer one question at a time.
  const currentId = questionOrder[index];
  const current = currentId ? questionsById.get(currentId) : undefined;
  const total = questionOrder.length;
  const isLast = index === total - 1;
  const answeredCount = questionOrder.filter((id) => answers[id] !== undefined).length;

  if (!current || !currentId) {
    return <EmptyState title={t("quiz.questionsLoadFailed")} />;
  }

  function updateAnswer(response: unknown) {
    if (!currentId) return;
    setAnswers((prev) => ({ ...prev, [currentId]: response }));
    saveAnswer.mutate({ questionId: currentId, response });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-ink-soft">
          <span className="figure">
            {t("quiz.questionOf", { current: index + 1, total })}
          </span>
          <span className="figure">
            {t("quiz.answeredCount", { answered: answeredCount, total })}
          </span>
        </div>
        <ProgressBar value={index + 1} max={total} label={t("quiz.progressLabel")} />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <LedgerLabel>{questionTypeLabel(current.type, t)}</LedgerLabel>
          <p className="text-base font-medium">{current.prompt}</p>
          <QuestionInput
            question={current}
            value={answers[currentId]}
            onChange={updateAnswer}
            disabled={submit.isPending}
          />
        </CardBody>
      </Card>

      {submit.isError && <ErrorPanel error={submit.error} />}

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          {t("quiz.prev")}
        </Button>
        {isLast ? (
          <Button onClick={() => submit.mutate()} loading={submit.isPending}>
            {t("quiz.submit")}
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>{t("quiz.next")}</Button>
        )}
      </div>
    </div>
  );
}
