"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession, BOOTSTRAP_KEY } from "@/components/Providers";
import { Button, Chip, Skeleton, Alert, cx } from "@/components/ui";
import { CenteredAuthShell } from "../CenteredAuthShell";

const TOPICS = [
  "Chi tiêu và ngân sách",
  "Ngân hàng và tín dụng",
  "Thuế và bảo hiểm",
  "Nhận diện lừa đảo",
  "Đầu tư cơ bản",
  "Kinh doanh nhỏ",
];

const GOALS = [
  { key: "light", label: "Nhẹ nhàng", hint: "1-2 bài mỗi tuần" },
  { key: "steady", label: "Đều đặn", hint: "3-4 bài mỗi tuần" },
  { key: "intense", label: "Tập trung", hint: "5 bài trở lên mỗi tuần" },
];

export default function WelcomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { bootstrap, isLoading, isSignedOut } = useSession();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [topics, setTopics] = React.useState<string[]>([]);
  const [goal, setGoal] = React.useState<string>("steady");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isSignedOut) router.replace("/login");
  }, [isSignedOut, router]);

  function toggleTopic(t: string) {
    setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      // doc 03 §2.2 PATCH /me has no field for onboarding status or interest topics,
      // so we persist what it accepts and keep the topic/goal picks as local UI state.
      await api.patch("/me", { localePref: "vi" });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ml-onboarding-goal", goal);
        window.localStorage.setItem("ml-onboarding-topics", JSON.stringify(topics));
      }
      await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      router.push("/learn");
    } catch {
      setError("Không lưu được lựa chọn. Vui lòng thử lại.");
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <CenteredAuthShell title="Chào mừng">
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </CenteredAuthShell>
    );
  }

  const name = bootstrap?.user.displayName ?? "bạn";

  return (
    <CenteredAuthShell
      title={step === 1 ? `Chào ${name}` : "Đặt mục tiêu học tập"}
      subtitle={
        step === 1
          ? "Chọn những chủ đề bạn muốn học trước."
          : "Bạn muốn học với nhịp độ nào?"
      }
    >
      {error && (
        <div className="mb-4">
          <Alert tone="critical">{error}</Alert>
        </div>
      )}

      {step === 1 ? (
        <div>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => {
              const active = topics.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTopic(t)}
                  aria-pressed={active}
                  className="rounded-full"
                >
                  <Chip tone={active ? "moss" : "neutral"} className={cx("cursor-pointer", active && "border-moss-400")}>
                    {t}
                  </Chip>
                </button>
              );
            })}
          </div>
          <Button className="mt-6 w-full" onClick={() => setStep(2)}>
            Tiếp tục
          </Button>
        </div>
      ) : (
        <div>
          <div className="space-y-2" role="radiogroup" aria-label="Mục tiêu hằng tuần">
            {GOALS.map((g) => {
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
                  <div className="font-medium text-ink">{g.label}</div>
                  <div className="text-ink-soft">{g.hint}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={saving}>
              Quay lại
            </Button>
            <Button className="flex-1" onClick={finish} loading={saving}>
              Bắt đầu học
            </Button>
          </div>
        </div>
      )}
    </CenteredAuthShell>
  );
}
