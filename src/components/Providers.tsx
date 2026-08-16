"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, hasSessionHint, onSessionHintChange } from "@/lib/api";
import type { Bootstrap, Locale } from "@/lib/types";
import {
  DEFAULT_LOCALE,
  getClientLocale,
  readLocaleCookie,
  setClientLocale,
  writeLocaleCookie,
} from "@/lib/locale";
import { createT, type TranslateFn } from "@/lib/i18n";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Auth, validation and rule errors will not fix themselves, and 429 is
          // in the same group: the server names a retry-after in minutes, so
          // trying again a second later only spends an allowance that is already
          // exhausted. The screen shows the error and the learner can retry.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

/* ---------------------------------------------------------------- Session */

export interface SessionValue {
  bootstrap: Bootstrap | null;
  isLoading: boolean;
  /** True once we know there is no usable session. */
  isSignedOut: boolean;
  /**
   * A bootstrap failure that signing in again would not fix: the server is down,
   * the network dropped, or the call was rate limited. Without this the app
   * cannot tell "no session" from "no answer" and every screen waits forever on
   * data that is never going to arrive.
   */
  error: unknown;
  refresh: () => Promise<void>;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export const BOOTSTRAP_KEY = ["bootstrap"] as const;

/**
 * The session routes set a readable ml_session=1 alongside the httpOnly pair.
 * It proves nothing on its own, the server still checks the access token, but it
 * lets public pages skip a bootstrap call that would always answer 401. Cookies
 * are unreadable during server render, so the value resolves after hydration.
 */
function useSessionHint(): boolean | null {
  const hint = React.useSyncExternalStore(
    onSessionHintChange,
    () => (hasSessionHint() ? "yes" : "no"),
    () => "unknown",
  );
  return hint === "unknown" ? null : hint === "yes";
}

function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const hint = useSessionHint();

  const query = useQuery({
    queryKey: BOOTSTRAP_KEY,
    queryFn: () => api.get<Bootstrap>("/me/bootstrap"),
    retry: false,
    staleTime: 60_000,
    enabled: hint === true,
  });

  const isUnauthenticated =
    query.isError && query.error instanceof ApiError && query.error.status === 401;

  const value = React.useMemo<SessionValue>(
    () => ({
      bootstrap: query.data ?? null,
      isLoading: hint === null || (hint && query.isLoading),
      isSignedOut: hint === false || isUnauthenticated,
      error: query.isError && !isUnauthenticated ? query.error : null,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      },
    }),
    [hint, query.data, query.isLoading, query.isError, query.error, isUnauthenticated, qc],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Session state for any client component under the app shell. */
export function useSession(): SessionValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside Providers");
  return ctx;
}

/** Convenience for screens that require a signed-in learner. */
export function useMe() {
  return useSession().bootstrap?.user ?? null;
}

export function useStats() {
  return useSession().bootstrap?.stats ?? null;
}

export function useFeatureFlag(key: string): boolean {
  return useSession().bootstrap?.featureFlags[key] ?? false;
}

/* ---------------------------------------------------------------- Locale */

interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const LocaleContext = React.createContext<LocaleValue | null>(null);

function applyDocumentLang(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { bootstrap } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const [locale, setLocaleState] = React.useState<Locale>(() => {
    const fromCookie = typeof window !== "undefined" ? readLocaleCookie() : null;
    const initial = fromCookie ?? DEFAULT_LOCALE;
    setClientLocale(initial);
    return initial;
  });

  // Signed-in preference is source of truth when it differs from the guest cookie.
  React.useEffect(() => {
    const pref = bootstrap?.user.localePref;
    if (!pref || pref === locale) return;
    setClientLocale(pref);
    writeLocaleCookie(pref);
    setLocaleState(pref);
    applyDocumentLang(pref);
  }, [bootstrap?.user.localePref]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    applyDocumentLang(locale);
    if (getClientLocale() !== locale) setClientLocale(locale);
  }, [locale]);

  const setLocale = React.useCallback(
    (next: Locale) => {
      setClientLocale(next);
      writeLocaleCookie(next);
      setLocaleState(next);
      applyDocumentLang(next);
      void qc.invalidateQueries();
      router.refresh();
    },
    [qc, router],
  );

  const t = React.useMemo(() => createT(locale), [locale]);
  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside Providers");
  return ctx;
}

export function useT(): TranslateFn {
  return useLocale().t;
}

/* ------------------------------------------------------------------ Toast */

interface Toast {
  id: number;
  tone: "info" | "positive" | "critical";
  message: string;
}

const ToastContext = React.createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return React.useContext(ToastContext);
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 space-y-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "pointer-events-auto rounded-[var(--radius-card)] border px-4 py-3 text-sm shadow-sm " +
              (t.tone === "critical"
                ? "border-critical/30 bg-critical-soft text-ink"
                : t.tone === "positive"
                  ? "border-positive/30 bg-positive-soft text-ink"
                  : "border-rule bg-paper-raised text-ink")
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(getQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SessionProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
