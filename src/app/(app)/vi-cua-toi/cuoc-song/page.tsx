"use client";

import Link from "next/link";
import { useT } from "@/components/Providers";
import {
  Card,
  CardBody,
  CardNavFooter,
  Chip,
  LedgerLabel,
  PageBackLink,
  SectionContinueLink,
} from "@/components/ui";

const LIFE_SECTIONS = [
  { href: "/ban-do", key: "food", live: true },
  { href: null, key: "transport", live: false },
  { href: null, key: "fun", live: false },
  { href: null, key: "shopping", live: false },
  { href: null, key: "study", live: false },
] as const;

export default function CuocSongPage() {
  const t = useT();

  return (
    <div className="space-y-6">
      <PageBackLink href="/vi-cua-toi">{t("wallet.back")}</PageBackLink>

      <header className="space-y-2">
        <LedgerLabel>{t("wallet.life.label")}</LedgerLabel>
        <h1 className="font-display text-2xl font-semibold">{t("wallet.life.title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{t("wallet.life.intro")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {LIFE_SECTIONS.map((s) => {
          const inner = (
            <Card
              className={`flex h-full flex-col ${s.live ? "transition-colors hover:border-moss-200 hover:bg-paper-sunken" : "opacity-90"}`}
            >
              <CardBody className="flex flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{t(`wallet.life.${s.key}.title`)}</h2>
                  {s.live ? (
                    <Chip tone="positive">{t("wallet.life.available")}</Chip>
                  ) : (
                    <Chip tone="neutral">{t("wallet.life.comingSoon")}</Chip>
                  )}
                </div>
                <p className="flex-1 text-sm leading-relaxed text-ink-soft">
                  {t(`wallet.life.${s.key}.description`)}
                </p>
                {!s.live && (
                  <ul className="space-y-1 border-t border-rule pt-3 text-xs text-ink-faint">
                    {(t(`wallet.life.${s.key}.tips`) as string).split("|").map((tip) => (
                      <li key={tip}>· {tip.trim()}</li>
                    ))}
                  </ul>
                )}
                {s.live && <CardNavFooter label={t("wallet.explore")} />}
              </CardBody>
            </Card>
          );

          return s.href ? (
            <Link key={s.key} href={s.href} className="group block h-full">
              {inner}
            </Link>
          ) : (
            <div key={s.key}>{inner}</div>
          );
        })}
      </div>

      <SectionContinueLink
        href="/vi-cua-toi/thu-thach"
        hint={t("wallet.habits.label")}
        label={t("wallet.life.nextHabits")}
      />
    </div>
  );
}
