-- One ACTIVE session per (user, sim); doc 02 §6
CREATE UNIQUE INDEX IF NOT EXISTS "sim_session_active_unique"
  ON "sim_session" ("userId", "simId") WHERE "status" = 'ACTIVE';
-- Case-insensitive email uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_lower_unique" ON "user" (LOWER("email")) WHERE "email" IS NOT NULL;
