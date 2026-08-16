import type { Locale } from "@/lib/types";
import { DEFAULT_LOCALE } from "@/lib/locale";
import vi from "@/messages/vi.json";
import en from "@/messages/en.json";

export type MessageKey = keyof typeof vi;

type Catalog = Record<string, string>;

const catalogs: Record<Locale, Catalog> = {
  vi: vi as Catalog,
  en: en as Catalog,
};

export type TranslateFn = (key: MessageKey | string, vars?: Record<string, string | number>) => string;

export function createT(locale: Locale): TranslateFn {
  const primary = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  const fallback = catalogs[DEFAULT_LOCALE];
  return (key, vars) => {
    let text = primary[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function getMessages(locale: Locale): Catalog {
  return catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
}
