import type { Locale } from "@/lib/types";

export const LOCALE_COOKIE = "ml_locale";
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALES: readonly Locale[] = ["vi", "en"] as const;

/** Module-level locale the API client appends as ?locale=. LocaleProvider keeps this in sync. */
let clientLocale: Locale = DEFAULT_LOCALE;

export function parseLocale(value: string | null | undefined): Locale | null {
  if (value === "vi" || value === "en") return value;
  return null;
}

export function getClientLocale(): Locale {
  return clientLocale;
}

export function setClientLocale(locale: Locale): void {
  clientLocale = locale;
}

export function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return parseLocale(raw);
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Prefer cookie, then Accept-Language (en* → en), else Vietnamese. */
export function resolveGuestLocale(opts?: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  const fromCookie = parseLocale(opts?.cookie ?? null);
  if (fromCookie) return fromCookie;
  const al = opts?.acceptLanguage?.toLowerCase() ?? "";
  if (al.includes("en")) return "en";
  return DEFAULT_LOCALE;
}

export function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "vi-VN";
}
