import Link from "next/link";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";

export default async function NotFound() {
  const locale = await getRequestLocale();
  const t = createT(locale);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="ledger-label text-ink-faint">{t("notFound.code")}</p>
      <h1 className="mt-2 text-3xl">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t("notFound.description")}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-[var(--radius-control)] bg-moss-600 px-4 py-2 text-sm font-medium text-paper"
        >
          {t("notFound.backHome")}
        </Link>
        <Link
          href="/library"
          className="rounded-[var(--radius-control)] border border-rule px-4 py-2 text-sm font-medium text-ink-soft hover:bg-paper-sunken"
        >
          {t("nav.library")}
        </Link>
      </div>
    </div>
  );
}
