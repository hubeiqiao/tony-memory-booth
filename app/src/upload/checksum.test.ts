import { describe, it, expect } from "vitest";
import { sha256Hex } from "./checksum";

const enc = new TextEncoder();

describe("sha256Hex", () => {
  it("matches known vector for empty input", async () => {
    const h = await sha256Hex(new Uint8Array(0));
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("matches known vector for 'abc'", async () => {
    const h = await sha256Hex(enc.encode("abc"));
    expect(h).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("hashes a Blob identically to its bytes", async () => {
    const bytes = enc.encode("memory booth");
    const fromBytes = await sha256Hex(bytes);
    const fromBlob = await sha256Hex(new Blob([bytes]));
    expect(fromBlob).toBe(fromBytes);
  });
});
