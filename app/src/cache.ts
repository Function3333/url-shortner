import { createClient, type RedisClientType } from "redis";
import { withTimeout } from "./async";
import { config } from "./config";
import { describeError, logger } from "./logger";

/**
 * Redis access layer for the redirect hot path.
 *
 * Like db.ts, the client is created lazily and accessed only through the
 * exported functions so unit tests can mock the whole module.
 */
let client: RedisClientType | undefined;
let connecting: Promise<void> | undefined;
/** Suppress the per-reconnect error flood: log on the way down, once. */
let errorLogged = false;

/** Cached codes expire after a day; misses repopulate from Postgres. */
const TTL_SECONDS = 60 * 60 * 24;
const PING_TIMEOUT_MS = 1000;
/** Hot-path cache ops are bounded so a slow/dead Redis can't stall a request. */
const OP_TIMEOUT_MS = 1000;
const keyFor = (code: string) => `link:${code}`;

export function getClient(): RedisClientType {
  if (!client) {
    client = createClient({
      url: config.redisUrl,
      // Keep reconnecting (capped backoff) so the app recovers automatically
      // when Redis comes back — important for the rollback/monitoring demo.
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });
    client.on("error", (err: Error) => {
      // node-redis emits 'error' on every failed reconnect; log only the first
      // of a disconnected streak to keep logs readable.
      if (!errorLogged) {
        logger.error("redis error", { error: describeError(err) });
        errorLogged = true;
      }
    });
    client.on("ready", () => {
      errorLogged = false;
      logger.info("redis ready");
    });
  }
  return client;
}

/**
 * Begin connecting. With the always-on reconnect strategy this promise stays
 * pending until Redis is reachable, so callers should fire-and-forget it (the
 * HTTP server is already up; /readyz reports not-ready until it connects).
 */
export async function connectCache(): Promise<void> {
  const c = getClient();
  if (c.isOpen) return;
  if (!connecting) {
    connecting = c.connect().then(
      () => {
        connecting = undefined;
      },
      (err) => {
        connecting = undefined;
        throw err;
      },
    );
  }
  await connecting;
}

/**
 * Look up a code in the cache. Returns null on miss.
 *
 * Guards on `isReady` and bounds the GET with a timeout: when Redis is down,
 * node-redis would otherwise queue the command in its offline queue forever
 * (the always-on reconnect strategy never gives up), hanging the redirect hot
 * path instead of letting the caller fall back to Postgres.
 */
export async function cacheGet(code: string): Promise<string | null> {
  const c = getClient();
  if (!c.isReady) return null;
  return withTimeout(c.get(keyFor(code)), OP_TIMEOUT_MS, null);
}

/** Populate the cache after a Postgres lookup (best-effort, never blocks). */
export async function cacheSet(code: string, url: string): Promise<void> {
  const c = getClient();
  if (!c.isReady) return;
  await withTimeout(
    c.set(keyFor(code), url, { EX: TTL_SECONDS }).then(() => undefined),
    OP_TIMEOUT_MS,
    undefined,
  );
}

/**
 * Readiness check used by /readyz. Gates on `isReady` (handshake complete) — not
 * `isOpen`, which can be briefly true mid-reconnect and cause a queued PING to
 * block — and bounds the PING with a timeout so the probe can never hang.
 */
export async function pingCache(): Promise<boolean> {
  const c = getClient();
  if (!c.isReady) return false;
  return withTimeout(
    c
      .ping()
      .then((pong) => pong === "PONG")
      .catch(() => false),
    PING_TIMEOUT_MS,
    false,
  );
}

export async function closeCache(): Promise<void> {
  if (client && client.isOpen) {
    await client.quit();
  }
  client = undefined;
  connecting = undefined;
}
