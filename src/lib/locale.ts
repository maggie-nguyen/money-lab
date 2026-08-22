/** App is Vietnamese-only. DB may still store localePref = vi. */
export type Locale = "vi";

export const LOCALE_COOKIE = "ml_locale";
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALES: readonly Locale[] = ["vi"] as const;

let clientLocale: Locale = DEFAULT_LOCALE;

export function parseLocale(_value: string | null | undefined): Locale | null {
  return DEFAULT_LOCALE;
}

export function getClientLocale(): Locale {
  return clientLocale;
}

export function setClientLocale(_locale: Locale): void {
  clientLocale = DEFAULT_LOCALE;
}

export function readLocaleCookie(): Locale {
  return DEFAULT_LOCALE;
}

export function writeLocaleCookie(_locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=vi; path=/; max-age=31536000; SameSite=Lax`;
}

export function resolveGuestLocale(_opts?: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  return DEFAULT_LOCALE;
}

export function intlLocale(_locale?: Locale): string {
  return "vi-VN";
}
