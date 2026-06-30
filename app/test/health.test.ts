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
vi.mock("../src/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config")>();
  return { ...actual, isReadyOverrideFailing: vi.fn(() => false) };
});

import { pingDb } from "../src/db";
import { pingCache } from "../src/cache";
import { isReadyOverrideFailing } from "../src/config";
import { createApp } from "../src/app";

const app = createApp();

describe("liveness and version", () => {
  it("GET /healthz is always 200", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /version returns the build SHA", async () => {
    const res = await request(app).get("/version");
    expect(res.status).toBe(200);
    // No BUILD_SHA in the test env → default "dev".
    expect(res.body.sha).toBe("dev");
  });
});

describe("GET /readyz", () => {
  beforeEach(() => {
    vi.mocked(isReadyOverrideFailing).mockReturnValue(false);
    vi.mocked(pingDb).mockResolvedValue(true);
    vi.mocked(pingCache).mockResolvedValue(true);
  });

  it("is 200 when DB and Redis are both healthy", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ok",
      checks: { db: true, redis: true },
    });
  });

  it("is 503 when the DB is down", async () => {
    vi.mocked(pingDb).mockResolvedValue(false);
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.checks).toMatchObject({ db: false, redis: true });
  });

  it("is 503 when Redis is down", async () => {
    vi.mocked(pingCache).mockResolvedValue(false);
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.checks).toMatchObject({ db: true, redis: false });
  });

  it("is 503 when the bad-version switch (READY_OVERRIDE=fail) is engaged", async () => {
    vi.mocked(isReadyOverrideFailing).mockReturnValue(true);
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "fail", reason: "ready_override" });
    // The override short-circuits before pinging dependencies.
    expect(pingDb).not.toHaveBeenCalled();
  });
});
