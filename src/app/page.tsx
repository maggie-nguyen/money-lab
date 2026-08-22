import Link from "next/link";
import type { Metadata } from "next";
import { Button, Card, CardBody, CardNavFooter, LedgerLabel } from "@/components/ui";
import { LedgerScene } from "@/components/auth/LedgerScene";
import { WalletGlyph, type WalletGlyphKind } from "@/components/art/WalletGlyph";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createT(locale);
  return { title: t("landing.metaTitle") };
}

const PILLARS: Array<{
  href: string;
  titleKey: string;
  descKey: string;
  tagKey: string;
  glyph: WalletGlyphKind;
}> = [
  {
    href: "/ban-do",
    titleKey: "landing.pillar.map",
    descKey: "landing.pillar.mapDesc",
    tagKey: "nav.map",
    glyph: "map",
  },
  {
    href: "/vi-cua-toi/hieu-minh",
    titleKey: "landing.pillar.mind",
    descKey: "landing.pillar.mindDesc",
    tagKey: "wallet.mind.tag",
    glyph: "mind",
  },
  {
    href: "/vi-cua-toi/chia-vi",
    titleKey: "landing.pillar.wallet",
    descKey: "landing.pillar.walletDesc",
    tagKey: "wallet.manage.tag",
    glyph: "manage",
  },
  {
    href: "/vi-cua-toi/thu-thach",
    titleKey: "landing.pillar.habits",
    descKey: "landing.pillar.habitsDesc",
    tagKey: "wallet.habits.tag",
    glyph: "habits",
  },
];

export default async function LandingPage() {
  const locale = await getRequestLocale();
  const t = createT(locale);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-display text-xl font-semibold tracking-tight">MoneyLab</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-ink-soft hover:text-ink">
              {t("landing.signIn")}
            </Link>
            <Link href="/signup">
              <Button size="sm">{t("landing.startFree")}</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="border-b border-rule">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <LedgerLabel>{t("landing.eyebrow")}</LedgerLabel>
              <h1 className="mt-3 text-4xl sm:text-5xl">{t("landing.heroTitle")}</h1>
              <p className="mt-5 max-w-xl text-base text-ink-soft">{t("landing.heroBody")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/ban-do">
                  <Button size="lg">{t("landing.exploreMap")}</Button>
                </Link>
                <Link href="/signup">
                  <Button size="lg" variant="secondary">
                    {t("landing.startFree")}
                  </Button>
                </Link>
              </div>
              <p className="mt-3 text-sm text-ink-faint">
                {t("landing.hasAccount")}{" "}
                <Link href="/login" className="text-moss-400 underline hover:text-moss-600">
                  {t("landing.signIn")}
                </Link>
              </p>
            </div>

            <div className="relative hidden overflow-hidden rounded-[var(--radius-card)] lg:block lg:h-[34rem]">
              <LedgerScene uid="ml-hero" className="absolute inset-0 h-full w-full" />
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0b2a1e]/85 to-transparent" />
              <div className="absolute inset-x-0 top-0 p-6">
                <p className="ledger-label text-[#f0ead9]/70">{t("landing.journey")}</p>
                <p className="mt-1 max-w-[14rem] font-display text-lg text-[#f0ead9]">
                  {t("landing.journeyCaption")}
                </p>
              </div>
            </div>
          </div>

          <div className="relative h-44 w-full overflow-hidden sm:h-56 lg:hidden">
            <LedgerScene
              uid="ml-hero-banner"
              viewBox="0 386 900 398"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </section>

        <section className="border-y border-rule bg-paper-sunken">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="font-display text-2xl">{t("landing.topicsTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{t("landing.topicsBody")}</p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PILLARS.map((item) => (
                <Link key={item.href} href={item.href} className="group block h-full">
                  <Card className="flex h-full flex-col transition-colors hover:border-moss-200 hover:bg-paper-raised">
                    <CardBody className="flex flex-1 flex-col">
                      <WalletGlyph kind={item.glyph} className="h-10 w-10 text-moss-600" />
                      <LedgerLabel className="mt-4">{t(item.tagKey)}</LedgerLabel>
                      <h3 className="mt-2 font-display text-base font-semibold group-hover:text-moss-600">
                        {t(item.titleKey)}
                      </h3>
                      <p className="mt-1.5 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-soft">
                        {t(item.descKey)}
                      </p>
                      <CardNavFooter label={t("wallet.explore")} />
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
            <div>
              <LedgerLabel>{t("landing.simLabel")}</LedgerLabel>
              <h2 className="mt-2 font-display text-2xl">{t("landing.simTitle")}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t("landing.simBody")}</p>
              <p className="mt-3 text-xs text-ink-faint">{t("landing.simNote")}</p>
            </div>
            <Card tone="ink">
              <CardBody>
                <LedgerLabel className="text-paper/70">{t("landing.simCardLabel")}</LedgerLabel>
                <div className="figure mt-2 text-3xl font-semibold">8.500.000 ₫</div>
                <p className="mt-1 text-sm text-paper/80">{t("landing.simIncome")}</p>
                <div className="mt-5 space-y-2 text-sm text-paper/90">
                  <div className="flex justify-between border-b border-paper/20 pb-2">
                    <span>{t("landing.simNeeds")}</span>
                    <span className="figure">4.250.000 ₫</span>
                  </div>
                  <div className="flex justify-between border-b border-paper/20 pb-2">
                    <span>{t("landing.simWants")}</span>
                    <span className="figure">2.550.000 ₫</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("landing.simSave")}</span>
                    <span className="figure">1.700.000 ₫</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </section>

        <section className="relative border-t border-rule">
          <LedgerScene uid="ml-cta" viewBox="0 1010 900 190" className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-[#0b2a1e]/75" />
          <div className="relative mx-auto max-w-5xl px-4 py-20 text-center">
            <h2 className="font-display text-2xl text-[#f0ead9]">{t("landing.ctaTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#f0ead9]/85">{t("landing.ctaBody")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/ban-do">
                <Button size="lg" className="!bg-[#f0ead9] !text-[#16211c] hover:!bg-white">
                  {t("landing.exploreMap")}
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  size="lg"
                  variant="secondary"
                  className="!border-[#f0ead9]/60 !text-[#f0ead9] hover:!bg-[#f0ead9]/10"
                >
                  {t("landing.startFree")}
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-ink-faint">
          {t("footer.public", { year: new Date().getFullYear() })}
        </div>
      </footer>
    </div>
  );
}
