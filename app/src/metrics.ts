import type { NextFunction, Request, Response } from "express";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";

/**
 * A dedicated registry (rather than the global default) keeps metrics isolated
 * and lets tests build a clean app without cross-test bleed.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests, labelled by method, route and status code.",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds.",
  labelNames: ["method", "route", "status"] as const,
  // Buckets tuned for a fast redirect API (sub-millisecond to ~2s).
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [registry],
});

export const cacheEventsTotal = new Counter({
  name: "cache_events_total",
  help: "Redis cache lookups for the redirect path, labelled by result.",
  labelNames: ["result"] as const, // hit | miss
  registers: [registry],
});

export function recordCacheHit(): void {
  cacheEventsTotal.labels("hit").inc();
}

export function recordCacheMiss(): void {
  cacheEventsTotal.labels("miss").inc();
}

/**
 * Express middleware that times every request and records count + latency.
 * Uses the matched route pattern (e.g. "/:code") rather than the raw URL so
 * cardinality stays bounded.
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const endTimer = httpRequestDurationSeconds.startTimer();
  res.on("finish", () => {
    // Use the matched route *pattern* (e.g. "/:code") so cardinality stays
    // bounded. Unmatched requests (404s, wrong method) never set req.route, so
    // collapse them to the mount path or a single "unmatched" sentinel rather
    // than the attacker-controlled raw URL — otherwise each distinct unknown
    // path would mint a new time series (a metrics-cardinality DoS vector).
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.baseUrl || "unmatched";
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    endTimer(labels);
  });
  next();
}
