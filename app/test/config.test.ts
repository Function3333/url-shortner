import { describe, expect, it } from "vitest";
import { isReadyOverrideFailing, loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("applies defaults when env vars are absent", () => {
    const cfg = loadConfig({});
    expect(cfg.port).toBe(3000);
    expect(cfg.buildSha).toBe("dev");
    expect(cfg.readyOverride).toBe("");
    expect(cfg.databaseUrl).toContain("postgres://");
    expect(cfg.redisUrl).toContain("redis://");
  });

  it("reads values from the environment", () => {
    const cfg = loadConfig({ PORT: "8080", BUILD_SHA: "abc1234" });
    expect(cfg.port).toBe(8080);
    expect(cfg.buildSha).toBe("abc1234");
  });
});

describe("isReadyOverrideFailing (the auto-rollback trigger)", () => {
  // Exercises the REAL env-to-503 mapping, case-insensitively.
  it.each([
    ["fail", true],
    ["FAIL", true],
    ["Fail", true],
    ["", false],
    ["ok", false],
    ["false", false],
  ])("READY_OVERRIDE=%j -> failing=%s", (value, expected) => {
    const cfg = loadConfig({ READY_OVERRIDE: value });
    expect(isReadyOverrideFailing(cfg)).toBe(expected);
  });
});
