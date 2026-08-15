"use client";

/**
 * Shared data hook for every simulation screen (doc 10 §6).
 *
 * Loads a session under key ["sim-session", id] and exposes `act(action)` to
 * post one engine action. On a stale `expectedStateVersion` (409
 * VERSION_CONFLICT) it refetches instead of resending and surfaces a notice.
 * Only one action may be in flight at a time.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, idempotencyKey } from "@/lib/api";
import { BOOTSTRAP_KEY } from "@/components/Providers";
import type { SimSessionView } from "@/lib/types";

export interface EngineAction {
  type: string;
  [key: string]: unknown;
}

export function simSessionKey(sessionId: string) {
  return ["sim-session", sessionId] as const;
}

export function useSimSession(sessionId: string) {
  const qc = useQueryClient();
  const [staleNotice, setStaleNotice] = React.useState(false);
  const [ruleCode, setRuleCode] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: simSessionKey(sessionId),
    queryFn: () => api.get<SimSessionView>(`/sims/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  const mutation = useMutation({
    mutationFn: async (action: EngineAction) => {
      const current = qc.getQueryData<SimSessionView>(simSessionKey(sessionId));
      const expectedStateVersion = current?.stateVersion ?? 0;
      return api.post<SimSessionView>(
        `/sims/sessions/${sessionId}/actions`,
        { expectedStateVersion, action },
        { idempotencyKey: idempotencyKey("sim-action", sessionId, expectedStateVersion, action.type) },
      );
    },
    onMutate: () => {
      setStaleNotice(false);
      setRuleCode(null);
    },
    onSuccess: (data) => {
      qc.setQueryData(simSessionKey(sessionId), data);
      if (data.awards) {
        void qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
      }
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.code === "VERSION_CONFLICT") {
          setStaleNotice(true);
          void qc.invalidateQueries({ queryKey: simSessionKey(sessionId) });
          return;
        }
        setRuleCode(error.ruleCode);
      }
    },
  });

  const act = React.useCallback(
    (action: EngineAction) => {
      if (mutation.isPending) return;
      mutation.mutate(action);
    },
    [mutation],
  );

  return {
    session: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    act,
    isActing: mutation.isPending,
    staleNotice,
    dismissStaleNotice: () => setStaleNotice(false),
    ruleCode,
    lastError: mutation.error instanceof ApiError ? mutation.error : null,
  };
}
