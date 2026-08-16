"use client";

import { useLocale } from "@/components/Providers";
import type { Locale } from "@/lib/types";
import { cx } from "@/components/ui";

/** Compact VI | EN control for public chrome and the app header. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  function pick(next: Locale) {
    if (next === locale) return;
    setLocale(next);
  }

  return (
    <div
      className={cx("inline-flex items-center gap-0.5 text-xs", className)}
      role="group"
      aria-label={t("lang.switch")}
    >
      {(["vi", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => pick(code)}
          aria-pressed={locale === code}
          className={cx(
            "rounded-[var(--radius-control)] px-1.5 py-0.5 font-medium",
            locale === code
              ? "bg-moss-50 text-moss-600"
              : "text-ink-faint hover:bg-paper-sunken hover:text-ink",
          )}
        >
          {t(code === "vi" ? "lang.vi" : "lang.en")}
        </button>
      ))}
    </div>
  );
}
