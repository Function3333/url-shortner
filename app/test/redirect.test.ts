import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { findUrlByCode } from "../src/db";
import { cacheGet, cacheSet } from "../src/cache";
import { createApp } from "../src/app";

const app = createApp();

describe("GET /:code", () => {
  beforeEach(() => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(cacheSet).mockResolvedValue(undefined);
    vi.mocked(findUrlByCode).mockResolvedValue(null);
  });

  it("redirects 301 on a cache hit without touching the DB", async () => {
    vi.mocked(cacheGet).mockResolvedValue("https://example.com/cached");

    const res = await request(app).get("/abc123").redirects(0);

    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("https://example.com/cached");
    expect(findUrlByCode).not.toHaveBeenCalled();
  });

  it("falls back to the DB on a cache miss, then warms the cache", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(findUrlByCode).mockResolvedValue("https://example.com/from-db");

    const res = await request(app).get("/abc123").redirects(0);

    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("https://example.com/from-db");
    expect(findUrlByCode).toHaveBeenCalledWith("abc123");
    expect(cacheSet).toHaveBeenCalledWith("abc123", "https://example.com/from-db");
  });

  it("returns 404 when the code is unknown", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(findUrlByCode).mockResolvedValue(null);

    const res = await request(app).get("/missing").redirects(0);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it("returns 400 for a malformed code", async () => {
    const res = await request(app).get("/has%20space").redirects(0);
    expect(res.status).toBe(400);
    expect(findUrlByCode).not.toHaveBeenCalled();
  });

  it("degrades to the DB when the cache read errors", async () => {
    vi.mocked(cacheGet).mockRejectedValue(new Error("redis down"));
    vi.mocked(findUrlByCode).mockResolvedValue("https://example.com/resilient");

    const res = await request(app).get("/abc123").redirects(0);

    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("https://example.com/resilient");
  });
});
