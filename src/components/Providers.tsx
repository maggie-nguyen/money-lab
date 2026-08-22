"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, hasSessionHint, onSessionHintChange } from "@/lib/api";
import type { Bootstrap } from "@/lib/types";
import type { Locale } from "@/lib/locale";
import { DEFAULT_LOCALE, setClientLocale } from "@/lib/locale";
import { createT, type TranslateFn } from "@/lib/i18n";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
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

export interface SessionValue {
  bootstrap: Bootstrap | null;
  isLoading: boolean;
  isSignedOut: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export const BOOTSTRAP_KEY = ["bootstrap"] as const;

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

export function useSession(): SessionValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside Providers");
  return ctx;
}

export function useMe() {
  return useSession().bootstrap?.user ?? null;
}

export function useStats() {
  return useSession().bootstrap?.stats ?? null;
}

export function useFeatureFlag(key: string): boolean {
  return useSession().bootstrap?.featureFlags[key] ?? false;
}

interface LocaleValue {
  locale: Locale;
  t: TranslateFn;
}

const LocaleContext = React.createContext<LocaleValue | null>(null);

function LocaleProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    setClientLocale(DEFAULT_LOCALE);
    if (typeof document !== "undefined") document.documentElement.lang = "vi";
  }, []);

  const t = React.useMemo(() => createT(), []);
  const value = React.useMemo(() => ({ locale: DEFAULT_LOCALE, t }), [t]);

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
