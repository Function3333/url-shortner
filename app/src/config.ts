/**
 * 12-factor configuration: every knob comes from the environment.
 * See docs/app-spec.md for the locked-in env contract.
 */

function optional(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const value = env[name];
  return value === undefined || value === "" ? fallback : value;
}

export interface Config {
  /** HTTP port the server listens on. */
  port: number;
  /** Postgres connection string (pg understands the URL form). */
  databaseUrl: string;
  /** Redis connection string (redis@4 understands the URL form). */
  redisUrl: string;
  /** Build SHA injected at image-build time (Docker ARG → runtime env). */
  buildSha: string;
  /**
   * Bad-version reproduction switch. When set to "fail", /readyz returns 503
   * even though the process is alive — this is what the rollback demo trips.
   */
  readyOverride: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number.parseInt(optional(env, "PORT", "3000"), 10),
    databaseUrl: optional(
      env,
      "DATABASE_URL",
      "postgres://postgres:postgres@localhost:5432/shortener",
    ),
    redisUrl: optional(env, "REDIS_URL", "redis://localhost:6379"),
    buildSha: optional(env, "BUILD_SHA", "dev"),
    readyOverride: optional(env, "READY_OVERRIDE", ""),
  };
}

export const config = loadConfig();

/** True when the bad-version switch is engaged. */
export function isReadyOverrideFailing(cfg: Config = config): boolean {
  return cfg.readyOverride.toLowerCase() === "fail";
}
