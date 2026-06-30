import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import { config } from "./config";

/**
 * Build the OpenAPI 3.0 document from the JSDoc `@openapi` annotations on the
 * route handlers.
 *
 * The `apis` glob is resolved relative to this file's directory, so it matches
 * `routes/*.ts` when running from source (tsx/dev) and `routes/*.js` when
 * running the compiled image (dist) — the same spec in both environments,
 * with no separate generation step required at runtime. (`scripts/generate-
 * openapi.ts` writes the identical document to a committed openapi.json.)
 */
export function buildOpenApiSpec(): object {
  return swaggerJsdoc({
    definition: {
      openapi: "3.0.3",
      info: {
        title: "URL Shortener API",
        version: "1.0.0",
        description:
          "A small URL-shortener API. It is the payload that exercises the " +
          "CI/CD pipeline (zero-downtime deploy + automatic rollback), not the " +
          "star of the show. POST a URL to get a short code; GET the code to be " +
          "301-redirected. Health, readiness, version and Prometheus metrics " +
          "endpoints back the monitoring and rollback demo.",
        license: { name: "MIT" },
      },
      servers: [{ url: `http://localhost:${config.port}`, description: "local" }],
      tags: [
        { name: "links", description: "Create short links" },
        { name: "redirect", description: "Resolve a code and redirect" },
        {
          name: "observability",
          description: "Health, readiness, version and metrics",
        },
      ],
      components: {
        schemas: {
          CreateLinkRequest: {
            type: "object",
            required: ["url"],
            properties: {
              url: {
                type: "string",
                format: "uri",
                example: "https://example.com/some/very/long/path",
              },
            },
          },
          CreateLinkResponse: {
            type: "object",
            required: ["code"],
            properties: {
              code: { type: "string", example: "a1B2c3D" },
            },
          },
          Error: {
            type: "object",
            required: ["error"],
            properties: {
              error: { type: "string", example: "url must use http or https" },
            },
          },
          Health: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", example: "ok" },
            },
          },
          Readiness: {
            type: "object",
            required: ["status", "checks"],
            properties: {
              status: { type: "string", example: "ok" },
              reason: { type: "string", example: "ready_override" },
              checks: {
                type: "object",
                properties: {
                  db: { type: "boolean", example: true },
                  redis: { type: "boolean", example: true },
                },
              },
            },
          },
          Version: {
            type: "object",
            required: ["sha"],
            properties: {
              sha: { type: "string", example: "a1b2c3d" },
            },
          },
        },
      },
    },
    apis: [path.join(__dirname, "routes", "*.{ts,js}")],
  });
}
