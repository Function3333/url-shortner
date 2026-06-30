import { describe, expect, it } from "vitest";
import {
  DEFAULT_CODE_LENGTH,
  generateCode,
  isValidCode,
} from "../src/base62";

describe("base62 code generation", () => {
  it("generates a code of the default length", () => {
    expect(generateCode()).toHaveLength(DEFAULT_CODE_LENGTH);
  });

  it("honours a requested length", () => {
    expect(generateCode(12)).toHaveLength(12);
  });

  it("only uses base62 characters", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).toMatch(/^[0-9a-zA-Z]+$/);
    }
  });

  it("is overwhelmingly likely to produce unique codes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(generateCode());
    }
    // 62^7 keyspace → 1000 draws should essentially never collide.
    expect(seen.size).toBe(1000);
  });

  it("rejects non-positive lengths", () => {
    expect(() => generateCode(0)).toThrow();
    expect(() => generateCode(-3)).toThrow();
  });

  it("validates codes", () => {
    expect(isValidCode("abcXYZ123")).toBe(true);
    expect(isValidCode("has space")).toBe(false);
    expect(isValidCode("has/slash")).toBe(false);
    expect(isValidCode("")).toBe(false);
    expect(isValidCode("dash-dash")).toBe(false);
  });
});
