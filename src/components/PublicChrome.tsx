import Link from "next/link";
import { PublicNavAuth } from "@/components/PublicNavAuth";

/**
 * Header and footer for the pages a signed-out visitor can reach: the landing
 * page and the article library. The app itself uses AppShell instead, which
 * needs a session.
 */
export function PublicChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-display text-xl font-semibold tracking-tight">
            MoneyLab
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/library" className="text-ink-soft hover:text-ink">
              Thư viện
            </Link>
            <PublicNavAuth />
          </nav>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-ink-faint">
          © {new Date().getFullYear()} MoneyLab. Số liệu trong mô phỏng là dữ liệu giả lập.
        </div>
      </footer>
    </div>
  );
}
