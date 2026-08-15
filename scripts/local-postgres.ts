/**
 * Starts a local embedded PostgreSQL for development on port 5544.
 * Usage: pnpm db:local   (leave running; Ctrl-C stops it)
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(process.cwd(), ".pgdata"),
    user: "moneylab",
    password: "moneylab",
    port: 5544,
    persistent: true,
  });
  const initialized = await pg
    .initialise()
    .then(() => true)
    .catch(() => false); // already initialized
  await pg.start();
  if (initialized) {
    await pg.createDatabase("moneylab");
  }
   
  console.log("postgres ready on 127.0.0.1:5544 (db moneylab). Ctrl-C to stop.");
  process.on("SIGINT", async () => {
    await pg.stop();
    process.exit(0);
  });
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
