/**
 * Minimal structured (JSON-lines) logger.
 *
 * Kept dependency-free on purpose: one log line == one JSON object on stdout,
 * which is exactly what container log collectors (and later Prometheus/Grafana's
 * Loki-style stacks) want. Easy to explain in an interview, nothing hidden.
 */

type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function emit(level: Level, message: string, fields?: Fields): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  debug: (message: string, fields?: Fields) => emit("debug", message, fields),
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};

/**
 * Produce a useful one-line description of an unknown error. Notably unwraps
 * AggregateError (Node wraps dual-stack ECONNREFUSED in one with an empty
 * message) so connection failures don't log as a bare "AggregateError".
 */
export function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map(describeError).filter(Boolean).join("; ");
    return inner || err.message || err.name;
  }
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    const base = err.message || err.name;
    return typeof code === "string" && !base.includes(code)
      ? `${base} (${code})`
      : base;
  }
  return String(err);
}
