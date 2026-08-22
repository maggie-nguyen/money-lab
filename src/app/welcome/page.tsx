"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, BOOTSTRAP_KEY, useT } from "@/components/Providers";
import { loginHref, readReturnTo } from "@/lib/returnTo";
import { Button, Chip, Skeleton, Alert, cx } from "@/components/ui";
import { CenteredAuthShell } from "../CenteredAuthShell";

const TOPIC_KEYS = [
  "welcome.topic.budget",
  "welcome.topic.credit",
  "welcome.topic.tax",
  "welcome.topic.scam",
  "welcome.topic.invest",
  "welcome.topic.business",
] as const;

const GOAL_KEYS = [
  { key: "light", label: "welcome.goal.light", hint: "welcome.goal.lightHint" },
  { key: "steady", label: "welcome.goal.steady", hint: "welcome.goal.steadyHint" },
  { key: "intense", label: "welcome.goal.intense", hint: "welcome.goal.intenseHint" },
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { bootstrap, isLoading, isSignedOut } = useSession();
  const t = useT();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [topics, setTopics] = React.useState<string[]>([]);
  const [goal, setGoal] = React.useState<string>("steady");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isSignedOut) router.replace(loginHref("/welcome"));
  }, [isSignedOut, router]);

  function toggleTopic(key: string) {
    setTopics((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ml-onboarding-goal", goal);
        window.localStorage.setItem("ml-onboarding-topics", JSON.stringify(topics));
      }
      await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      router.replace(readReturnTo());
    } catch {
      setError(t("welcome.saveFailed"));
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <CenteredAuthShell title={t("welcome.title")}>
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </CenteredAuthShell>
    );
  }

  const name = bootstrap?.user.displayName ?? t("welcome.you");

  return (
    <CenteredAuthShell
      title={step === 1 ? t("welcome.hello", { name }) : t("welcome.setGoal")}
      subtitle={step === 1 ? t("welcome.pickTopics") : t("welcome.goalPrompt")}
    >
      {error && (
        <div className="mb-4">
          <Alert tone="critical">{error}</Alert>
        </div>
      )}

      {step === 1 ? (
        <div>
          <div className="flex flex-wrap gap-2">
            {TOPIC_KEYS.map((key) => {
              const active = topics.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleTopic(key)}
                  aria-pressed={active}
                  className="rounded-full"
                >
                  <Chip tone={active ? "moss" : "neutral"} className={cx("cursor-pointer", active && "border-moss-400")}>
                    {t(key)}
                  </Chip>
                </button>
              );
            })}
          </div>
          <Button className="mt-6 w-full" onClick={() => setStep(2)}>
            {t("common.continue")}
          </Button>
        </div>
      ) : (
        <div>
          <div className="space-y-2" role="radiogroup" aria-label={t("welcome.goalGroup")}>
            {GOAL_KEYS.map((g) => {
              const active = goal === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setGoal(g.key)}
                  className={cx(
                    "w-full rounded-[var(--radius-control)] border px-4 py-3 text-left text-sm",
                    active ? "border-moss-400 bg-moss-50" : "border-rule-strong bg-paper-raised",
                  )}
                >
                  <div className="font-medium text-ink">{t(g.label)}</div>
                  <div className="text-ink-soft">{t(g.hint)}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={saving}>
              {t("common.back")}
            </Button>
            <Button className="flex-1" onClick={finish} loading={saving}>
              {t("welcome.start")}
            </Button>
          </div>
        </div>
      )}
    </CenteredAuthShell>
  );
}
