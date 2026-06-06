import { describe, it, expect } from "vitest";
import { ulid, encodeTime, isUlid } from "./ulid";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]+$/;

describe("ulid", () => {
  it("is 26 chars of Crockford base32", () => {
    const id = ulid(Date.now(), () => 0.5);
    expect(id).toHaveLength(26);
    expect(id).toMatch(CROCKFORD);
    expect(isUlid(id)).toBe(true);
  });

  it("sorts lexicographically by time", () => {
    const earlier = ulid(1_000_000, () => 0);
    const later = ulid(2_000_000, () => 0);
    expect(earlier < later).toBe(true);
  });

  it("is deterministic given fixed time + rng", () => {
    const a = ulid(123456789, () => 0.1);
    const b = ulid(123456789, () => 0.1);
    expect(a).toBe(b);
  });

  it("varies the random tail with different rng", () => {
    const a = ulid(123456789, () => 0.1);
    const b = ulid(123456789, () => 0.9);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10)); // same time prefix
    expect(a.slice(10)).not.toBe(b.slice(10)); // different randomness
  });

  it("rejects non-ulids", () => {
    expect(isUlid("nope")).toBe(false);
    expect(isUlid("../../etc/passwd")).toBe(false);
    expect(isUlid("I".repeat(26))).toBe(false); // I is not in the alphabet
  });

  it("encodeTime monotonic", () => {
    expect(encodeTime(0)).toBe("0000000000");
    expect(encodeTime(1) < encodeTime(32)).toBe(true);
  });
});
