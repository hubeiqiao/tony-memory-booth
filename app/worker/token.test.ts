import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "./token";

const SECRET = "test-secret";

describe("upload token", () => {
  it("round-trips a valid token", async () => {
    const t = await signToken({ mode: "phone", exp: Date.now() + 10000, nonce: "n1" }, SECRET);
    const p = await verifyToken(t, SECRET);
    expect(p?.mode).toBe("phone");
  });

  it("rejects a tampered token", async () => {
    const t = await signToken({ mode: "booth", exp: Date.now() + 10000, nonce: "n" }, SECRET);
    expect(await verifyToken(t + "x", SECRET)).toBeNull();
  });

  it("rejects a wrong secret", async () => {
    const t = await signToken({ mode: "booth", exp: Date.now() + 10000, nonce: "n" }, SECRET);
    expect(await verifyToken(t, "other-secret")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const t = await signToken({ mode: "phone", exp: 1000, nonce: "n" }, SECRET);
    expect(await verifyToken(t, SECRET, 2000)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyToken("not-a-token", SECRET)).toBeNull();
    expect(await verifyToken("", SECRET)).toBeNull();
  });
});
