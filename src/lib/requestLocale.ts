import { cookies, headers } from "next/headers";
import type { Locale } from "@/lib/types";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  parseLocale,
  resolveGuestLocale,
} from "@/lib/locale";

/** Resolve locale for Server Components (library, landing, metadata). */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const hdrs = await headers();
  return resolveGuestLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: hdrs.get("accept-language"),
  }) ?? DEFAULT_LOCALE;
}

export function localeFromCookieValue(value: string | undefined): Locale {
  return parseLocale(value) ?? DEFAULT_LOCALE;
}
