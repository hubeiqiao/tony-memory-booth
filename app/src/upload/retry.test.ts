import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry";
import { splitIntoParts } from "./parts";

describe("withRetry", () => {
  it("returns on first success", async () => {
    const fn = vi.fn(async () => "ok");
    const r = await withRetry(fn, { retries: 3, baseMs: 1, sleep: async () => {} });
    expect(r).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const delays: number[] = [];
    const r = await withRetry(
      async () => {
        if (++calls < 3) throw new Error("transient");
        return calls;
      },
      { retries: 5, baseMs: 100, jitter: () => 1, sleep: async (ms) => void delays.push(ms) }
    );
    expect(r).toBe(3);
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]); // backoff grows
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });
    await expect(
      withRetry(fn, { retries: 2, baseMs: 1, sleep: async () => {} })
    ).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });
});

describe("splitIntoParts", () => {
  it("splits into fixed-size 1-based parts", () => {
    const blob = new Blob([new Uint8Array(25)]);
    const parts = splitIntoParts(blob, 10);
    expect(parts.map((p) => p.size)).toEqual([10, 10, 5]);
    expect(parts.map((p) => p.n)).toEqual([1, 2, 3]);
  });

  it("single part when smaller than partSize", () => {
    const parts = splitIntoParts(new Blob([new Uint8Array(3)]), 10);
    expect(parts).toHaveLength(1);
    expect(parts[0].size).toBe(3);
  });

  it("empty blob yields no parts", () => {
    expect(splitIntoParts(new Blob([]), 10)).toHaveLength(0);
  });
});
