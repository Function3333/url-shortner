import type { Server } from "node:http";
import { createApp } from "./app";
import { closeCache, connectCache } from "./cache";
import { config } from "./config";
import { closeDb, initDb } from "./db";
import { describeError, logger } from "./logger";

/**
 * Run the Postgres schema bootstrap, retrying until it succeeds.
 *
 * The HTTP server is already up serving /healthz; /readyz stays 503 until the
 * schema exists. We retry *indefinitely* (capped backoff) rather than giving up
 * after a fixed window: if Postgres is slow to accept connections on a cold
 * start, a bounded retry could exhaust before the table is created, leaving a
 * pod whose `SELECT 1` readiness passes but whose queries fail with "relation
 * does not exist". Retrying forever closes that gap — the table is created as
 * soon as Postgres is reachable.
 */
async function bootstrapDatabase(): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await initDb();
      return;
    } catch (err) {
      logger.warn("database not ready, will retry", {
        attempt,
        error: describeError(err),
      });
      const backoff = Math.min(attempt * 500, 5000);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

function start(): Server {
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info("server listening", {
      port: config.port,
      sha: config.buildSha,
      readyOverride: config.readyOverride || "(off)",
    });
  });

  // Bring dependencies up in the background; liveness is already green and
  // /readyz reports not-ready until both succeed.
  //
  // Redis: fire-and-forget. The always-on reconnect strategy keeps the connect
  // promise pending until Redis is reachable and reconnects automatically after
  // a drop, so there is nothing to retry here — the 'ready'/'error' events log
  // the transitions.
  void connectCache().catch((err) => {
    logger.warn("redis connect attempt errored", { error: describeError(err) });
  });
  // Database: CREATE TABLE must run once Postgres is up; retry until it does.
  void bootstrapDatabase();

  return server;
}

function installShutdown(server: Server): void {
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    server.close(async () => {
      await Promise.allSettled([closeCache(), closeDb()]);
      logger.info("shutdown complete");
      process.exit(0);
    });
    // Hard exit if graceful close hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

installShutdown(start());
