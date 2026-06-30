import { Pool } from "pg";
import { withTimeout } from "./async";
import { config } from "./config";
import { describeError, logger } from "./logger";

/**
 * Postgres access layer.
 *
 * The pool is created lazily so that importing this module (e.g. in unit tests
 * that mock it) never opens a socket. Routes depend only on the exported
 * functions, which makes the whole layer trivial to stub.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl });
    pool.on("error", (err) => {
      logger.error("postgres pool error", { error: describeError(err) });
    });
  }
  return pool;
}

/** Idempotent schema bootstrap — fine for a single-table demo. */
export async function initDb(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS links (
      id         BIGSERIAL PRIMARY KEY,
      code       TEXT NOT NULL UNIQUE,
      url        TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  logger.info("database schema ready");
}

/** Return the existing code for a URL, or null if it has not been shortened. */
export async function findCodeByUrl(url: string): Promise<string | null> {
  const result = await getPool().query<{ code: string }>(
    "SELECT code FROM links WHERE url = $1",
    [url],
  );
  return result.rows[0]?.code ?? null;
}

/** Resolve a short code back to its original URL, or null if unknown. */
export async function findUrlByCode(code: string): Promise<string | null> {
  const result = await getPool().query<{ url: string }>(
    "SELECT url FROM links WHERE code = $1",
    [code],
  );
  return result.rows[0]?.url ?? null;
}

/**
 * Insert a (code, url) pair.
 *
 * Returns the code that ended up persisted:
 *  - On a URL conflict, the pre-existing code is returned (idempotent shorten).
 *  - On a code collision, the caller is told via {@link CodeCollisionError} so
 *    it can retry with a fresh code.
 */
export class CodeCollisionError extends Error {
  constructor(code: string) {
    super(`code collision: ${code}`);
    this.name = "CodeCollisionError";
  }
}

export async function insertLink(code: string, url: string): Promise<string> {
  const pg = getPool();
  try {
    // ON CONFLICT (url) keeps the operation idempotent for the same URL: a
    // concurrent shorten of the same URL returns the code that won the race.
    const result = await pg.query<{ code: string }>(
      `INSERT INTO links (code, url)
       VALUES ($1, $2)
       ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url
       RETURNING code`,
      [code, url],
    );
    const persisted = result.rows[0]?.code;
    if (!persisted) {
      // Should not happen given RETURNING, but stay defensive.
      throw new Error("insert returned no row");
    }
    return persisted;
  } catch (err) {
    // A unique violation here means the *code* collided with a different URL
    // (the url conflict is absorbed above). Signal the caller to retry.
    if (isUniqueViolation(err)) {
      throw new CodeCollisionError(code);
    }
    throw err;
  }
}

/** Detect Postgres unique-violation (SQLSTATE 23505) on the code constraint. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

const PING_TIMEOUT_MS = 1500;

/**
 * Readiness check used by /readyz. Bounded with a timeout so a wedged
 * connection reads as "not ready" rather than hanging the probe.
 */
export async function pingDb(): Promise<boolean> {
  return withTimeout(
    getPool()
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false),
    PING_TIMEOUT_MS,
    false,
  );
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
