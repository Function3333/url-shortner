import { Router, type Request, type Response, type NextFunction } from "express";
import { generateCode } from "../base62";
import { cacheSet } from "../cache";
import { CodeCollisionError, findCodeByUrl, insertLink } from "../db";
import { describeError, logger } from "../logger";
import { InvalidUrlError, normalizeUrl } from "../validate";

const MAX_CODE_ATTEMPTS = 5;

export const linksRouter = Router();

/**
 * @openapi
 * /links:
 *   post:
 *     summary: Create a short link
 *     description: >
 *       Shorten an http/https URL. The operation is idempotent: shortening the
 *       same URL twice returns the same code (200) rather than creating a
 *       duplicate.
 *     tags: [links]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateLinkRequest'
 *     responses:
 *       201:
 *         description: A new short link was created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateLinkResponse'
 *       200:
 *         description: The URL was already shortened; the existing code is returned.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateLinkResponse'
 *       400:
 *         description: The request body or URL was invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
linksRouter.post(
  "/links",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = normalizeUrl((req.body as { url?: unknown } | undefined)?.url);

      // Idempotent shorten: return the existing code if we've seen this URL.
      const existing = await findCodeByUrl(url);
      if (existing) {
        res.status(200).json({ code: existing });
        return;
      }

      const code = await createWithRetry(url);

      // Warm the cache so the first redirect is a hit. Best-effort: a cache
      // failure must not fail link creation (Postgres is the source of truth).
      try {
        await cacheSet(code, url);
      } catch (err) {
        logger.warn("failed to warm cache after create", {
          code,
          error: describeError(err),
        });
      }

      res.status(201).json({ code });
    } catch (err) {
      if (err instanceof InvalidUrlError) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

/**
 * Insert a link, regenerating the code on the rare base62 collision.
 * If a concurrent request shortened the same URL meanwhile, insertLink's
 * ON CONFLICT (url) returns that winning code instead.
 */
async function createWithRetry(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateCode();
    try {
      return await insertLink(candidate, url);
    } catch (err) {
      if (err instanceof CodeCollisionError) {
        lastError = err;
        logger.warn("code collision, retrying", { attempt });
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `could not allocate a unique code after ${MAX_CODE_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}
