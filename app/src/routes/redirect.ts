import { Router, type Request, type Response, type NextFunction } from "express";
import { cacheGet, cacheSet } from "../cache";
import { findUrlByCode } from "../db";
import { describeError, logger } from "../logger";
import { recordCacheHit, recordCacheMiss } from "../metrics";
import { isValidCode } from "../base62";

export const redirectRouter = Router();

/**
 * @openapi
 * /{code}:
 *   get:
 *     summary: Resolve a short code and redirect
 *     description: >
 *       Look up the original URL (Redis first, Postgres on miss, then warm the
 *       cache) and issue a 301 redirect. This is the high-RPS hot path the k6
 *       load test drives.
 *     tags: [redirect]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: The base62 short code returned by POST /links.
 *     responses:
 *       301:
 *         description: Redirect to the original URL.
 *         headers:
 *           Location:
 *             description: The original URL.
 *             schema:
 *               type: string
 *       400:
 *         description: The code is malformed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No link exists for this code.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
redirectRouter.get(
  "/:code",
  async (req: Request, res: Response, next: NextFunction) => {
    const code = req.params.code ?? "";
    try {
      if (!isValidCode(code)) {
        res.status(400).json({ error: "invalid code" });
        return;
      }

      // 1. Cache first.
      const cached = await cacheGet(code).catch((err) => {
        // A cache read error degrades to a DB lookup rather than a 5xx.
        logger.warn("cache read failed, falling back to db", {
          code,
          error: describeError(err),
        });
        return null;
      });
      if (cached) {
        recordCacheHit();
        res.redirect(301, cached);
        return;
      }
      recordCacheMiss();

      // 2. Postgres on miss.
      const url = await findUrlByCode(code);
      if (!url) {
        res.status(404).json({ error: "not found" });
        return;
      }

      // 3. Populate the cache for next time (best-effort).
      cacheSet(code, url).catch((err) => {
        logger.warn("failed to populate cache", {
          code,
          error: describeError(err),
        });
      });

      res.redirect(301, url);
    } catch (err) {
      next(err);
    }
  },
);
