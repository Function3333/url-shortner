import { Router, type Request, type Response, type NextFunction } from "express";
import { registry } from "../metrics";

export const metricsRouter = Router();

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: Exposes prom-client metrics (request count, latency histogram, cache hit/miss) for Prometheus to scrape.
 *     tags: [observability]
 *     responses:
 *       200:
 *         description: Metrics in Prometheus text exposition format.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
metricsRouter.get(
  "/metrics",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.set("Content-Type", registry.contentType);
      res.end(await registry.metrics());
    } catch (err) {
      next(err);
    }
  },
);
