import { SiteHeader } from "@/components/SiteHeader";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";

/**
 * Header and footer for public pages: landing, library, and articles.
 * Signed-in app screens use AppShell instead.
 */
export async function PublicChrome({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const t = createT(locale);

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />

      <main id="main">{children}</main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-ink-faint">
          {t("footer.public", { year: new Date().getFullYear() })}
        </div>
      </footer>
    </div>
  );
}
