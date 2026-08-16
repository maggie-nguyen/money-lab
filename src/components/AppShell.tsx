"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, useT } from "@/components/Providers";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOut } from "@/lib/signOut";
import { Button, Chip, cx } from "@/components/ui";

function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = React.useState<"light" | "dark" | null>(null);

  React.useEffect(() => {
    const saved = window.localStorage.getItem("ml-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);

  function toggle() {
    const current =
      theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("ml-theme", next);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      className="rounded-[var(--radius-control)] px-2 py-1 text-sm text-ink-soft hover:bg-paper-sunken hover:text-ink"
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}

function Wordmark() {
  return (
    <Link href="/learn" className="flex items-baseline gap-2">
      <span className="font-display text-xl font-semibold tracking-tight">MoneyLab</span>
    </Link>
  );
}

function StreakAndCoins() {
  const { bootstrap } = useSession();
  const t = useT();
  if (!bootstrap) return null;
  const { stats } = bootstrap;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="figure text-ink-soft" title={t("stats.streakTitle")}>
        {t("stats.streakDays", { count: stats.streakCurrent })}
      </span>
      <span className="figure text-ink-soft" title={t("stats.coinsTitle")}>
        {t("stats.coins", { count: stats.coins })}
      </span>
      <Chip tone="moss" className="figure">
        {t("stats.level", { level: stats.level })}
      </Chip>
    </div>
  );
}

function AccountMenu() {
  const { bootstrap } = useSession();
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!bootstrap) {
    return (
      <Link href="/login">
        <Button size="sm" variant="secondary">
          {t("nav.signIn")}
        </Button>
      </Link>
    );
  }

  const name = bootstrap.user.displayName;
  const menu = [
    { href: "/profile", label: t("nav.profile") },
    { href: "/quests", label: t("nav.quests") },
    { href: "/leaderboard", label: t("nav.leaderboard") },
    { href: "/shop", label: t("nav.shop") },
    { href: "/settings", label: t("nav.settings") },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-rule-strong bg-paper-raised text-sm font-semibold"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav.account")}
      >
        {name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 rounded-[var(--radius-card)] border border-rule bg-paper-raised py-1 text-sm shadow-sm"
        >
          <div className="border-b border-rule px-3 py-2">
            <div className="truncate font-medium">{name}</div>
            <div className="truncate text-xs text-ink-faint">
              {bootstrap.user.email}
            </div>
          </div>
          {menu.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              role="menuitem"
              className="block px-3 py-2 hover:bg-paper-sunken"
              onClick={() => setOpen(false)}
            >
              {i.label}
            </Link>
          ))}
          {bootstrap.user.role === "ADMIN" && (
            <Link href="/admin" role="menuitem" className="block px-3 py-2 hover:bg-paper-sunken" onClick={() => setOpen(false)}>
              {t("nav.admin")}
            </Link>
          )}
          <button role="menuitem" onClick={() => void signOut("/")} className="block w-full px-3 py-2 text-left text-critical hover:bg-paper-sunken">
            {t("nav.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const nav = [
    { href: "/learn", label: t("nav.courses") },
    { href: "/library", label: t("nav.library") },
    { href: "/sims", label: t("nav.sims") },
    { href: "/tools", label: t("nav.tools") },
    { href: "/tutor", label: t("nav.tutor") },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Wordmark />
          <nav className="hidden items-center gap-1 md:flex" aria-label={t("nav.main")}>
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-[var(--radius-control)] px-3 py-1.5 text-sm",
                    active ? "bg-moss-50 font-medium text-moss-600" : "text-ink-soft hover:bg-paper-sunken hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden lg:block">
              <StreakAndCoins />
            </div>
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </header>


      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-20 md:pb-6">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-paper-raised md:hidden"
        aria-label={t("nav.main")}
      >
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx("py-3 text-center text-xs", active ? "font-medium text-moss-600" : "text-ink-soft")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <footer className="hidden border-t border-rule px-4 py-6 text-xs text-ink-faint md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2">
          <span>{t("footer.disclaimer")}</span>
          <span>{t("footer.simDisclaimer")}</span>
        </div>
      </footer>
    </div>
  );
}
