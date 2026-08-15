import { prisma } from "@/server/db";

// Feature flags live in `feature_flag` (doc 02 §11). Reads are hot (every bootstrap and every
// tutor call), so cache the whole small table for a few seconds instead of querying per key.
// A flag toggled by an admin therefore takes effect within FLAG_TTL_MS - acceptable and documented.

const FLAG_TTL_MS = 10_000;

export const FLAG_DEFAULTS: Record<string, boolean> = {
  ai_tutor_enabled: true,
  sim_invest_enabled: true,
  shop_enabled: true,
  leaderboard_enabled: true,
  survey_prompt_enabled: false,
};

let cache: { at: number; values: Record<string, boolean> } | null = null;

async function loadFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (cache && now - cache.at < FLAG_TTL_MS) return cache.values;
  const values = { ...FLAG_DEFAULTS };
  try {
    const rows = await prisma.featureFlag.findMany({ select: { key: true, enabled: true } });
    for (const r of rows) values[r.key] = r.enabled;
  } catch {
    // DB hiccup must not take the whole API down - fall back to defaults (and don't cache them).
    return values;
  }
  cache = { at: now, values };
  return values;
}

export async function isFlagEnabled(key: string): Promise<boolean> {
  const values = await loadFlags();
  return values[key] ?? FLAG_DEFAULTS[key] ?? false;
}

export async function allFlags(): Promise<Record<string, boolean>> {
  return { ...(await loadFlags()) };
}

/** Test/admin helper: drop the cache so the next read hits the DB. */
export function resetFlagCache(): void {
  cache = null;
}
