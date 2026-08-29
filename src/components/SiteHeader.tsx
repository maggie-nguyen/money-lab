"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PublicNavAuth } from "@/components/PublicNavAuth";
import { useT } from "@/components/Providers";
import { cx } from "@/components/ui";
import { isMainNavActive, mainNavItems } from "@/lib/mainNav";

/**
 * Shared header for public surfaces: landing, library, and article pages.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const t = useT();
  const links = mainNavItems(t);

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="shrink-0 font-display text-xl font-semibold tracking-tight">
            Money&amp;Me
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label={t("nav.main")}>
            {links.map((item) => {
              const active = isMainNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-[var(--radius-control)] px-3 py-1.5 text-sm",
                    active
                      ? "bg-moss-50 font-medium text-moss-600"
                      : "text-ink-soft hover:bg-paper-sunken hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <nav className="flex shrink-0 items-center gap-3 text-sm sm:gap-4">
          <PublicNavAuth />
        </nav>
      </div>

      <nav
        className="grid grid-cols-4 border-t border-rule md:hidden"
        aria-label={t("nav.main")}
      >
        {links.map((item) => {
          const active = isMainNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "py-2.5 text-center text-xs",
                active ? "font-medium text-moss-600" : "text-ink-soft",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
