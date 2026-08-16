/**
 * The single API client. Components never call fetch directly (doc 06 §5).
 *
 * Auth rides on the httpOnly ml_access cookie installed by /api/session/*.
 * On a 401 the client refreshes once and replays the request; a second failure
 * surfaces as ApiError so the UI can send the user to the login screen.
 *
 * Content reads append ?locale= from LocaleProvider via getClientLocale().
 */

import { getClientLocale } from "@/lib/locale";
import { createT } from "@/lib/i18n";

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ApiErrorDetail[];
  readonly requestId: string | null;
  readonly retryAfterSec: number | null;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    details?: ApiErrorDetail[];
    requestId?: string | null;
    retryAfterSec?: number | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? [];
    this.requestId = init.requestId ?? null;
    this.retryAfterSec = init.retryAfterSec ?? null;
  }

  /** Engine and business rules put their machine code in details[0].message. */
  get ruleCode(): string | null {
    return this.code === "RULE_VIOLATION" ? (this.details[0]?.message ?? null) : null;
  }

  /** Field errors keyed by the path the server reported, for form display. */
  fieldErrors(prefix = "body."): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) {
      if (d.path.startsWith(prefix)) out[d.path.slice(prefix.length)] = d.message;
    }
    return out;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Sent as Idempotency-Key. Required by the server for award-granting writes. */
  idempotencyKey?: string;
  /** Sent as If-Match. Required by admin PATCH routes for optimistic concurrency (doc 03 §14.1). */
  ifMatch?: string;
  signal?: AbortSignal;
}

const BASE = "/api/v1";

/** Paths that accept ?locale=vi|en (doc 03). Others ignore the param harmlessly if sent; we only attach where useful. */
const LOCALE_QUERY_PREFIXES = [
  "/catalog/",
  "/library/",
  "/sims",
  "/shop/",
  "/me/badges",
  "/me/enrollments",
  "/me/certificates",
  "/me/quests",
  "/quizzes/",
  "/tutor/",
  "/tools/",
];

function wantsLocaleQuery(path: string): boolean {
  return LOCALE_QUERY_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE}${path}`;
  const params = new URLSearchParams();
  if (wantsLocaleQuery(path) && (query?.locale === undefined || query?.locale === null || query?.locale === "")) {
    params.set("locale", getClientLocale());
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(res: Response): Promise<ApiError> {
  const t = createT(getClientLocale());
  let code = "INTERNAL";
  let message = t("error.generic");
  let details: ApiErrorDetail[] = [];
  let requestId: string | null = res.headers.get("x-request-id");
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: ApiErrorDetail[]; requestId?: string };
    };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? [];
      requestId = body.error.requestId ?? requestId;
    }
  } catch {
    // Non-JSON error body (proxy timeout, 502 page). Keep the defaults.
  }

  const codeKey = `error.code.${code}`;
  const codeTranslated = t(codeKey);
  if (codeTranslated !== codeKey) message = codeTranslated;

  if (code === "RULE_VIOLATION") {
    const machineCode = details[0]?.message;
    if (machineCode && /^[A-Z][A-Z0-9_]*$/.test(machineCode)) {
      const ruleKey = `error.rule.${machineCode}`;
      const ruleTranslated = t(ruleKey);
      if (ruleTranslated !== ruleKey) message = ruleTranslated;
    }
  }

  const retry = res.headers.get("retry-after");
  return new ApiError({
    code,
    message,
    status: res.status,
    details,
    requestId,
    retryAfterSec: retry ? Number(retry) : null,
  });
}

/**
 * Readable mirror of "a session probably exists", set by the /api/session
 * routes as ml_session=1. It holds no credential: the server still validates
 * the httpOnly access token on every call. Its only job is to let the app skip
 * a bootstrap request on public pages, where the answer is always 401.
 */
export function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith("ml_session="));
}

const hintListeners = new Set<() => void>();

/** Subscribe to session cookie changes made through this module. */
export function onSessionHintChange(listener: () => void): () => void {
  hintListeners.add(listener);
  return () => {
    hintListeners.delete(listener);
  };
}

function notifySessionHint(): void {
  for (const listener of hintListeners) listener();
}

let refreshInFlight: Promise<boolean> | null = null;

/** Refresh the session cookie. Concurrent 401s share one refresh call. */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch("/api/session/refresh", { method: "POST", credentials: "same-origin" });
      // A failed refresh clears the cookies server side, so the hint moved too.
      notifySessionHint();
      return res.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this promise still see it.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  if (opts.ifMatch) headers["if-match"] = opts.ifMatch;
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    credentials: "same-origin",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, opts);

  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) res = await rawRequest(path, opts);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;

  const body = (await res.json()) as { data: T };
  return body.data;
}

/**
 * Same as apiRequest but keeps the `meta` sibling of `data`. Some routes
 * (the calculators, doc 03 §8) send a `meta.formula` string alongside the
 * numbers and the plain apiRequest would otherwise discard it.
 */
export async function apiRequestWithMeta<T, M = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: M | undefined }> {
  let res = await rawRequest(path, opts);

  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) res = await rawRequest(path, opts);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return { data: undefined as T, meta: undefined };

  const body = (await res.json()) as { data: T; meta?: M };
  return { data: body.data, meta: body.meta };
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    apiRequest<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }) =>
    apiRequest<T>(path, { method: "POST", body, ...(opts ?? {}) }),
  patch: <T>(path: string, body?: unknown, opts?: { ifMatch?: string }) =>
    apiRequest<T>(path, { method: "PATCH", body, ...(opts ?? {}) }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  del: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "DELETE", body }),
  /** POST that returns `{ data, meta }` instead of just `data`. Tools use this for `meta.formula`. */
  postWithMeta: <T, M = unknown>(path: string, body?: unknown) =>
    apiRequestWithMeta<T, M>(path, { method: "POST", body }),
  /** GET that returns `{ data, meta }`. Admin lists use this for `meta.nextCursor` (doc 03 §14). */
  getWithMeta: <T, M = unknown>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    apiRequestWithMeta<T, M>(path, { method: "GET", query, signal }),
};

/** Session routes live outside /api/v1 and set cookies. */
export const session = {
  async login(email: string, password: string) {
    return sessionCall("/api/session/login", { email, password });
  },
  async signup(input: {
    email: string;
    password: string;
    displayName: string;
    birthYear?: number;
    province?: string;
  }) {
    return sessionCall("/api/session/signup", input);
  },
  async google(idToken: string, localePref?: "vi" | "en") {
    return sessionCall("/api/session/google", {
      idToken,
      ...(localePref ? { localePref } : {}),
    });
  },
  async logout() {
    return sessionCall("/api/session/logout", {});
  },
};

async function sessionCall(url: string, body: unknown): Promise<{ user?: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  notifySessionHint();
  const parsed = (await res.json()) as { data: { user?: unknown } };
  return parsed.data;
}

/** Stable key for idempotent mutations. One key per user intent, reused on retry. */
export function idempotencyKey(scope: string, ...parts: (string | number)[]): string {
  return `${scope}:${parts.join(":")}`;
}
