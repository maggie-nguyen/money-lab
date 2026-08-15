/**
 * Structured server logging.
 *
 * One line of JSON per event, which is what every hosted log collector wants to
 * read. Deliberately thin: there is no transport, no file rotation and no
 * pretty printer, because the platform captures stdout and doing any of that in
 * process only adds a way for logging to take the server down with it.
 *
 * Reads process.env directly rather than server/config, so a logger call in the
 * env-validation failure path cannot recurse.
 */
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: "moneylab" },
  // Nothing here should ever carry a credential, but a future field named like
  // one gets masked rather than shipped to the collector.
  redact: {
    paths: [
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
});

/** Fields shared by every request-scoped log line. */
export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
}
