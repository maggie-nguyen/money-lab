import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { Button, Card, CardBody, CardNavFooter, Chip, LedgerLabel } from "@/components/ui";
import { LedgerScene } from "@/components/auth/LedgerScene";
import { WalletGlyph, type WalletGlyphKind } from "@/components/art/WalletGlyph";
import { CoverArt } from "@/components/art/CoverArt";
import { coverStyle } from "@/lib/cover";
import { listArticles } from "@/server/services/libraryService";
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
    href: "/food",
    titleKey: "landing.pillar.map",
    descKey: "landing.pillar.mapDesc",
    tagKey: "nav.map",
    glyph: "map",
  },
  {
    href: "/library",
    titleKey: "landing.pillar.mind",
    descKey: "landing.pillar.mindDesc",
    tagKey: "wallet.mind.tag",
    glyph: "mind",
  },
  {
    href: "/wallet/budget",
    titleKey: "landing.pillar.wallet",
    descKey: "landing.pillar.walletDesc",
    tagKey: "wallet.manage.tag",
    glyph: "manage",
  },
  {
    href: "/wallet/challenges",
    titleKey: "landing.pillar.habits",
    descKey: "landing.pillar.habitsDesc",
    tagKey: "wallet.habits.tag",
    glyph: "habits",
  },
];

export default async function LandingPage() {
  const locale = await getRequestLocale();
  const t = createT(locale);
  const { data: featuredArticles } = await listArticles({ limit: 3 }, locale);

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />

      <main id="main">
        <section className="border-b border-rule">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <LedgerLabel>{t("landing.eyebrow")}</LedgerLabel>
              <h1 className="mt-3 text-4xl sm:text-5xl">{t("landing.heroTitle")}</h1>
              <p className="mt-5 max-w-xl text-base text-ink-soft">{t("landing.heroBody")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/food">
                  <Button size="lg">{t("landing.exploreMap")}</Button>
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
                {" · "}
                <Link href="/signup" className="text-moss-400 underline hover:text-moss-600">
                  {t("landing.startFree")}
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

        {featuredArticles.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 py-16">
            <LedgerLabel>{t("library.label")}</LedgerLabel>
            <h2 className="mt-2 font-display text-2xl">{t("landing.libraryTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{t("landing.libraryBody")}</p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {featuredArticles.map((article) => (
                <Link key={article.id} href={`/library/${article.slug}`} className="group block">
                  <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                    <div className="h-32 w-full" style={article.coverImageUrl ? undefined : coverStyle(article.slug)}>
                      {article.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={article.coverImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <CoverArt slug={article.slug} className="h-full w-full" />
                      )}
                    </div>
                    <CardBody>
                      <Chip>{t(`library.category.${article.category}`)}</Chip>
                      <h3 className="mt-2 line-clamp-2 text-base group-hover:underline">{article.title}</h3>
                      {article.summary && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{article.summary}</p>
                      )}
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
            <div className="mt-8">
              <Link href="/library">
                <Button variant="secondary">{t("landing.libraryBrowse")}</Button>
              </Link>
            </div>
          </section>
        )}

        <section className="relative border-t border-rule">
          <LedgerScene uid="ml-cta" viewBox="0 1010 900 190" className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-[#0b2a1e]/75" />
          <div className="relative mx-auto max-w-5xl px-4 py-20 text-center">
            <h2 className="font-display text-2xl text-[#f0ead9]">{t("landing.ctaTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#f0ead9]/85">{t("landing.ctaBody")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/food">
                <Button size="lg" className="!bg-[#f0ead9] !text-[#16211c] hover:!bg-white">
                  {t("landing.exploreMap")}
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
