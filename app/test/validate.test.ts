import { describe, expect, it } from "vitest";
import { InvalidUrlError, normalizeUrl } from "../src/validate";

describe("normalizeUrl", () => {
  it("accepts http and https URLs", () => {
    expect(normalizeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  https://example.com/x  ")).toBe(
      "https://example.com/x",
    );
  });

  it("rejects non-string input", () => {
    expect(() => normalizeUrl(undefined)).toThrow(InvalidUrlError);
    expect(() => normalizeUrl(42)).toThrow(InvalidUrlError);
    expect(() => normalizeUrl(null)).toThrow(InvalidUrlError);
  });

  it("rejects empty strings", () => {
    expect(() => normalizeUrl("   ")).toThrow(InvalidUrlError);
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(InvalidUrlError);
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow(InvalidUrlError);
    expect(() => normalizeUrl("ftp://example.com")).toThrow(InvalidUrlError);
  });

  it("rejects garbage that is not a URL", () => {
    expect(() => normalizeUrl("not a url")).toThrow(InvalidUrlError);
  });

  it("rejects absurdly long URLs", () => {
    const long = `https://example.com/${"a".repeat(3000)}`;
    expect(() => normalizeUrl(long)).toThrow(InvalidUrlError);
  });
});
