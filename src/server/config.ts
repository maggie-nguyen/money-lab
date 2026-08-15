import { z } from "zod";

// Boot-time env validation (doc 08 §2). Crash loudly on missing/malformed values.
const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgres"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  APP_ORIGIN: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  // Overridable so tests can point token verification at a local key set.
  GOOGLE_JWKS_URL: z
    .string()
    .url()
    .optional()
    .default("https://www.googleapis.com/oauth2/v3/certs"),
  RESEND_API_KEY: z.string().optional().default(""),
  CRON_SECRET: z.string().min(8),
  // Log level for the pino logger. Anything the platform captures from stdout.
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional()
    .default("info"),
  RATE_LIMIT_DISABLED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_LEARNER_EMAIL: z.string().email().optional(),
  SEED_LEARNER_PASSWORD: z.string().min(8).optional(),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  // Overridable so tests can point the tutor at a local stub server (doc 08 §3).
  ANTHROPIC_BASE_URL: z.string().url().optional().default("https://api.anthropic.com"),
  AI_TUTOR_MODEL: z.string().optional().default("claude-haiku-4-5"),
  AI_TUTOR_DAILY_MSG_LIMIT: z.coerce.number().int().positive().optional().default(50),
  NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`FATAL: invalid environment configuration:\n${missing}`);
    throw new Error("Invalid environment configuration");
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: reset the cache after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}
