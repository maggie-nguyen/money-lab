import { env } from "@/server/config";
import { logger } from "@/server/lib/logger";

/**
 * Minimal transactional email sender via Resend HTTP API (doc 01 stack table).
 * No-op (logged) when RESEND_API_KEY is unset - local dev / tests.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = env().RESEND_API_KEY;
  if (!key) {
    // Locally this is how a developer reads the verification link. In
    // production the body would be a reset token sitting in the log collector,
    // so there only the fact that mail is unconfigured is recorded.
    if (env().NODE_ENV === "production") {
      logger.warn({ to, subject }, "email not sent, RESEND_API_KEY is unset");
    } else {
      logger.info({ to, subject, text }, "email skipped, no RESEND_API_KEY");
    }
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: "MoneyLab <no-reply@moneylab.vn>", to: [to], subject, text }),
    });
    if (!res.ok) {
      logger.error({ to, status: res.status }, "email send rejected");
    }
  } catch (e) {
    // Email failures must never fail the request (doc 03 §1.1)
    logger.error({ to, err: e instanceof Error ? e.message : String(e) }, "email send error");
  }
}
