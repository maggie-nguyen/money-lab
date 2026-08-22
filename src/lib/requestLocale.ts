import type { Locale } from "@/lib/locale";
import { DEFAULT_LOCALE } from "@/lib/locale";

/** App is Vietnamese-only. */
export async function getRequestLocale(): Promise<Locale> {
  return DEFAULT_LOCALE;
}

export function localeFromCookieValue(_value: string | undefined): Locale {
  return DEFAULT_LOCALE;
}
