import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import swaggerUi from "swagger-ui-express";
import { describeError, logger } from "./logger";
import { metricsMiddleware } from "./metrics";
import { healthRouter } from "./routes/health";
import { linksRouter } from "./routes/links";
import { metricsRouter } from "./routes/metrics";
import { redirectRouter } from "./routes/redirect";
import { buildOpenApiSpec } from "./swagger";

/**
 * Extract a sane HTTP status from a thrown error. body-parser (and other
 * http-errors producers) attach `status`/`statusCode`; anything else, or an
 * out-of-range value, is treated as a 500.
 */
function clientErrorStatus(err: unknown): number {
  const e = err as { status?: unknown; statusCode?: unknown };
  const raw =
    typeof e?.statusCode === "number"
      ? e.statusCode
      : typeof e?.status === "number"
        ? e.status
        : 500;
  return raw >= 400 && raw <= 599 ? raw : 500;
}

/**
 * Build the Express application.
 *
 * Factored out of index.ts so tests can mount it with supertest without opening
 * a port. Route registration order matters: every specific path is registered
 * before the `GET /:code` catch-all so it is never shadowed by the redirect.
 */
export function createApp(): Application {
  const app = express();
  app.disable("x-powered-by");

  app.use(express.json({ limit: "16kb" }));
  app.use(metricsMiddleware);

  // Service root → point humans at the API docs.
  app.get("/", (_req: Request, res: Response) => {
    res.json({ service: "url-shortener", docs: "/docs" });
  });

  // Observability + API docs (all specific paths, registered before /:code).
  app.use(healthRouter); // /healthz, /readyz, /version
  app.use(metricsRouter); // /metrics

  const openApiSpec = buildOpenApiSpec();
  app.get("/openapi.json", (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // Application routes.
  app.use(linksRouter); // POST /links
  app.use(redirectRouter); // GET /:code  (catch-all — must be last)

  // 404 for anything unmatched.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not found" });
  });

  // Centralized error handler — never leak internals to the client.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Honor a client-error status carried by the error (e.g. body-parser raises
    // 400 for malformed JSON, 413 for an oversized body). Misreporting those as
    // 500 would both contradict the API contract and pollute the 5xx signal the
    // rollback demo watches.
    const status = clientErrorStatus(err);
    if (status >= 500) {
      logger.error("unhandled error", {
        method: req.method,
        path: req.path,
        error: describeError(err),
      });
    }
    if (res.headersSent) {
      return;
    }
    res.status(status).json({
      error: status >= 500 ? "internal server error" : describeError(err),
    });
  });

  return app;
}
