import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db", () => ({
  findCodeByUrl: vi.fn(),
  insertLink: vi.fn(),
  findUrlByCode: vi.fn(),
  pingDb: vi.fn(async () => true),
  CodeCollisionError: class CodeCollisionError extends Error {},
}));
vi.mock("../src/cache", () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
  pingCache: vi.fn(async () => true),
}));

import { createApp } from "../src/app";

const app = createApp();

describe("service metadata, metrics and docs", () => {
  it("GET / points at the docs", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.docs).toBe("/docs");
  });

  it("GET /metrics exposes Prometheus metrics with a bounded route label", async () => {
    // Generate at least one request so a labelled series exists.
    await request(app).get("/healthz");
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("http_request_duration_seconds");
    // The matched route *pattern* is used as the label, not the raw URL.
    expect(res.text).toMatch(/http_requests_total\{[^}]*route="\/healthz"/);
  });

  it("collapses unmatched paths to a single bounded route label", async () => {
    // Distinct unmatched multi-segment paths must NOT each mint a new series.
    await request(app).get("/a/1/x");
    await request(app).get("/a/2/y");
    const res = await request(app).get("/metrics");
    expect(res.text).toContain('route="unmatched"');
    expect(res.text).not.toContain('route="/a/1/x"');
    expect(res.text).not.toContain('route="/a/2/y"');
  });

  it("serves the OpenAPI document with every endpoint", async () => {
    const res = await request(app).get("/openapi.json");
    expect(res.status).toBe(200);
    const paths = Object.keys(res.body.paths ?? {});
    for (const p of ["/links", "/{code}", "/healthz", "/readyz", "/version", "/metrics"]) {
      expect(paths).toContain(p);
    }
  });

  it("serves the Swagger UI at /docs", async () => {
    const res = await request(app).get("/docs/");
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain("swagger");
  });

  it("returns 404 JSON for unknown paths", async () => {
    const res = await request(app).get("/nope/nope/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not found");
  });

  it("maps a malformed JSON body to 400, not 500", async () => {
    const res = await request(app)
      .post("/links")
      .set("content-type", "application/json")
      .send('{"url":'); // truncated / invalid JSON
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});
