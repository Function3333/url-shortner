import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the data layers so route logic is tested in isolation (no DB/Redis).
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

import { findCodeByUrl, insertLink } from "../src/db";
import { cacheSet } from "../src/cache";
import { createApp } from "../src/app";

const app = createApp();

describe("POST /links", () => {
  beforeEach(() => {
    vi.mocked(findCodeByUrl).mockResolvedValue(null);
    vi.mocked(insertLink).mockImplementation(async (code: string) => code);
    vi.mocked(cacheSet).mockResolvedValue(undefined);
  });

  it("creates a new short link (201) and warms the cache", async () => {
    const res = await request(app)
      .post("/links")
      .send({ url: "https://example.com/a/b/c" });

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[0-9a-zA-Z]+$/);
    expect(insertLink).toHaveBeenCalledOnce();
    expect(cacheSet).toHaveBeenCalledWith(res.body.code, "https://example.com/a/b/c");
  });

  it("is idempotent: a duplicate URL returns the existing code (200)", async () => {
    vi.mocked(findCodeByUrl).mockResolvedValue("existing");

    const res = await request(app)
      .post("/links")
      .send({ url: "https://example.com/dup" });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe("existing");
    expect(insertLink).not.toHaveBeenCalled();
  });

  it("rejects a missing url with 400", async () => {
    const res = await request(app).post("/links").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(insertLink).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) url with 400", async () => {
    const res = await request(app)
      .post("/links")
      .send({ url: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(insertLink).not.toHaveBeenCalled();
  });

  it("still returns 201 when cache warming fails (cache is best-effort)", async () => {
    vi.mocked(cacheSet).mockRejectedValue(new Error("redis down"));

    const res = await request(app)
      .post("/links")
      .send({ url: "https://example.com/no-cache" });

    expect(res.status).toBe(201);
    expect(res.body.code).toBeTruthy();
  });
});
