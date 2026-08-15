/**
 * Vitest global setup - doc 08 §3: all tests run on a disposable Postgres.
 * Starts an embedded Postgres on 127.0.0.1:5545 (separate from the dev DB on
 * 5544), recreates the test database, applies all migrations, and exports the
 * env every worker inherits. Never touches dev/staging data.
 */
import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import path from "node:path";

const PORT = 5545;
const DB = "moneylab_test";
const URL = `postgres://moneylab:moneylab@127.0.0.1:${PORT}/${DB}`;

let pg: EmbeddedPostgres | null = null;

export async function setup(): Promise<void> {
  pg = new EmbeddedPostgres({
    databaseDir: path.join(process.cwd(), ".pgdata-test"),
    user: "moneylab",
    password: "moneylab",
    port: PORT,
    persistent: true,
  });
  await pg
    .initialise()
    .catch(() => undefined); // already initialized
  await pg.start();
  await pg.dropDatabase(DB).catch(() => undefined);
  await pg.createDatabase(DB);

  process.env.DATABASE_URL = URL;
  process.env.DIRECT_URL = URL;
  process.env.AUTH_SECRET = "test-secret-0000000000000000000000000000000000000000";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.RATE_LIMIT_DISABLED = "true"; // withApi tests opt back in per-case
  (process.env as Record<string, string>).NODE_ENV = "test"; // typed read-only in @types/node

  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: URL },
    stdio: "pipe",
  });
}

export async function teardown(): Promise<void> {
  await pg?.stop();
}
