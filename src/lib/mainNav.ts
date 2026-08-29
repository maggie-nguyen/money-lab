import type { TranslateFn } from "@/lib/i18n";
import { ROUTES } from "@/lib/routes";

export const FOOD_HREF = ROUTES.food;
export const WALLET_HREF = ROUTES.wallet;
export const LIBRARY_HREF = ROUTES.library;
export const CHALLENGES_HREF = ROUTES.walletChallenges;

/** Primary product areas shown in the main header on every surface. */
export function mainNavItems(t: TranslateFn) {
  return [
    { href: FOOD_HREF, label: t("nav.map") },
    { href: WALLET_HREF, label: t("nav.wallet") },
    { href: LIBRARY_HREF, label: t("nav.library") },
    { href: CHALLENGES_HREF, label: t("nav.challenges") },
  ] as const;
}

export function isMainNavActive(pathname: string, href: string): boolean {
  if (href === LIBRARY_HREF) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === WALLET_HREF) {
    return (
      pathname === href ||
      (pathname.startsWith(`${href}/`) && !pathname.startsWith(`${CHALLENGES_HREF}`))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
