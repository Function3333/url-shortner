import { describe, expect, it } from "vitest";
import { withTimeout } from "../src/async";

describe("withTimeout", () => {
  it("resolves with the promise value when it settles in time", async () => {
    await expect(withTimeout(Promise.resolve("v"), 50, "fallback")).resolves.toBe(
      "v",
    );
  });

  it("resolves with the fallback when the promise is too slow", async () => {
    const never = new Promise<string>(() => {}); // never settles
    await expect(withTimeout(never, 20, "fallback")).resolves.toBe("fallback");
  });

  it("propagates a rejection that occurs before the timeout", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 50, "fallback"),
    ).rejects.toThrow("boom");
  });
});
