import vi from "@/messages/vi.json";

export type MessageKey = keyof typeof vi;

type Catalog = Record<string, string>;

const catalog = vi as Catalog;

export type TranslateFn = (key: MessageKey | string, vars?: Record<string, string | number>) => string;

/** Vietnamese-only UI strings. */
export function createT(_locale?: "vi"): TranslateFn {
  return (key, vars) => {
    let text = catalog[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function getMessages(): Catalog {
  return catalog;
}
