import { Router, type Request, type Response } from "express";
import { pingCache } from "../cache";
import { isReadyOverrideFailing } from "../config";
import { pingDb } from "../db";
import { getVersion } from "../version";

export const healthRouter = Router();

/**
 * @openapi
 * /healthz:
 *   get:
 *     summary: Liveness probe
 *     description: Always 200 while the process is running. Used as the k8s livenessProbe.
 *     tags: [observability]
 *     responses:
 *       200:
 *         description: The process is alive.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Health'
 */
healthRouter.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

/**
 * @openapi
 * /readyz:
 *   get:
 *     summary: Readiness probe
 *     description: >
 *       200 only when both Postgres and Redis are reachable. When the
 *       READY_OVERRIDE=fail switch is set (the intentionally-bad version), this
 *       returns 503 even though the process is alive — which is exactly what
 *       the k8s readinessProbe trips on to trigger the automatic rollback.
 *     tags: [observability]
 *     responses:
 *       200:
 *         description: Dependencies are healthy; ready to serve traffic.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Readiness'
 *       503:
 *         description: A dependency is down or the bad-version switch is engaged.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Readiness'
 */
healthRouter.get("/readyz", async (_req: Request, res: Response) => {
  if (isReadyOverrideFailing()) {
    res.status(503).json({
      status: "fail",
      reason: "ready_override",
      checks: { db: false, redis: false },
    });
    return;
  }

  const [db, redis] = await Promise.all([pingDb(), pingCache()]);
  const ready = db && redis;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "fail",
    checks: { db, redis },
  });
});

/**
 * @openapi
 * /version:
 *   get:
 *     summary: Build identity
 *     description: Returns the BUILD_SHA baked into the image; the signal the rollback demo watches.
 *     tags: [observability]
 *     responses:
 *       200:
 *         description: The build SHA of the running image.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Version'
 */
healthRouter.get("/version", (_req: Request, res: Response) => {
  res.status(200).json(getVersion());
});
