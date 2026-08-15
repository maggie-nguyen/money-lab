"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, hasSessionHint, onSessionHintChange } from "@/lib/api";
import type { Bootstrap } from "@/lib/types";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Auth, validation and rule errors will not fix themselves.
          if (error instanceof ApiError && error.status < 500 && error.status !== 429) return false;
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

  const value = React.useMemo<SessionValue>(
    () => ({
      bootstrap: query.data ?? null,
      isLoading: hint === null || (hint && query.isLoading),
      isSignedOut:
        hint === false ||
        (query.isError && query.error instanceof ApiError && query.error.status === 401),
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      },
    }),
    [hint, query.data, query.isLoading, query.isError, query.error, qc],
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
        <SessionProvider>{children}</SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
