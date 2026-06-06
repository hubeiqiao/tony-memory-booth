import { describe, it, expect } from "vitest";
import { mintKey, isValidId, safeExt, yyyymmdd } from "./keys";

const ID = "01HZZZZZZZZZZZZZZZZZZZZZZZZ".slice(0, 26); // valid charset/length

describe("server keys", () => {
  it("mints namespaced video + meta keys", () => {
    const k = mintKey(ID, "mp4", new Date(Date.UTC(2026, 5, 21, 15, 0, 0)));
    expect(k.dir).toBe(`recordings/20260621/${ID}`);
    expect(k.video).toBe(`recordings/20260621/${ID}/video.mp4`);
    expect(k.meta).toBe(`recordings/20260621/${ID}/meta.json`);
  });

  it("formats UTC date", () => {
    expect(yyyymmdd(new Date(Date.UTC(2026, 0, 5)))).toBe("20260105");
  });

  it("validates ulid ids", () => {
    expect(isValidId(ID)).toBe(true);
    expect(isValidId("../../etc")).toBe(false);
    expect(isValidId("short")).toBe(false);
  });

  it("rejects path traversal via id", () => {
    expect(() => mintKey("../evil", "mp4")).toThrow(/invalid recording id/);
  });

  it("enforces the extension allow-list", () => {
    expect(safeExt(".webm")).toBe("webm");
    expect(safeExt("MP4")).toBe("mp4");
    expect(() => safeExt("html")).toThrow(/disallowed/);
    expect(() => safeExt("../x")).toThrow(/disallowed/);
  });
});
