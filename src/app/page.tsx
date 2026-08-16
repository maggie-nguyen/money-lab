import Link from "next/link";
import type { Metadata } from "next";
import { Button, Card, CardBody, LedgerLabel } from "@/components/ui";
import { LedgerScene } from "@/components/auth/LedgerScene";
import { TopicGlyph, type TopicKind } from "@/components/art/TopicGlyph";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createT(locale);
  return { title: t("landing.metaTitle") };
}

const TOPIC_KINDS: Array<{ kind: TopicKind; titleKey: string; descKey: string }> = [
  { kind: "budget", titleKey: "landing.topic.budget", descKey: "landing.topic.budgetDesc" },
  { kind: "credit", titleKey: "landing.topic.credit", descKey: "landing.topic.creditDesc" },
  { kind: "tax", titleKey: "landing.topic.tax", descKey: "landing.topic.taxDesc" },
  { kind: "scam", titleKey: "landing.topic.scam", descKey: "landing.topic.scamDesc" },
  { kind: "invest", titleKey: "landing.topic.invest", descKey: "landing.topic.investDesc" },
  { kind: "business", titleKey: "landing.topic.business", descKey: "landing.topic.businessDesc" },
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
            <LanguageSwitcher />
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
                <Link href="/signup">
                  <Button size="lg">{t("landing.startFree")}</Button>
                </Link>
                <Link href="/library">
                  <Button size="lg" variant="secondary">
                    {t("landing.readArticles")}
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
            <h2 className="text-2xl">{t("landing.topicsTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">{t("landing.topicsBody")}</p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TOPIC_KINDS.map((item) => (
                <Card key={item.kind}>
                  <CardBody>
                    <TopicGlyph kind={item.kind} className="h-10 w-10 text-moss-600" />
                    <h3 className="mt-3 text-base">{t(item.titleKey)}</h3>
                    <p className="mt-1.5 text-sm text-ink-soft">{t(item.descKey)}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
            <div>
              <LedgerLabel>{t("landing.simLabel")}</LedgerLabel>
              <h2 className="mt-2 text-2xl">{t("landing.simTitle")}</h2>
              <p className="mt-3 text-sm text-ink-soft">{t("landing.simBody")}</p>
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
            <h2 className="text-2xl text-[#f0ead9]">{t("landing.ctaTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#f0ead9]/85">{t("landing.ctaBody")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="!bg-[#f0ead9] !text-[#16211c] hover:!bg-white">
                  {t("landing.startFree")}
                </Button>
              </Link>
              <Link href="/library">
                <Button
                  size="lg"
                  variant="secondary"
                  className="!border-[#f0ead9]/60 !text-[#f0ead9] hover:!bg-[#f0ead9]/10"
                >
                  {t("landing.readArticles")}
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
