import { describe, it, expect } from "vitest";
import { pickMimeType, extForMime } from "./codec";

describe("codec detection", () => {
  it("prefers mp4 when supported (Safari/iOS path)", () => {
    const c = pickMimeType((m) => m.startsWith("video/mp4"));
    expect(c.mimeType).toBe("video/mp4;codecs=h264,aac");
    expect(c.ext).toBe("mp4");
    expect(c.supported).toBe(true);
  });

  it("falls back to webm vp9 when mp4 unsupported (Chrome path)", () => {
    const c = pickMimeType((m) => m === "video/webm;codecs=vp9,opus");
    expect(c.mimeType).toBe("video/webm;codecs=vp9,opus");
    expect(c.ext).toBe("webm");
  });

  it("falls back to vp8 then generic webm", () => {
    const c = pickMimeType((m) => m === "video/webm");
    expect(c.mimeType).toBe("video/webm");
    expect(c.ext).toBe("webm");
  });

  it("returns undefined mime + webm ext when nothing matches", () => {
    const c = pickMimeType(() => false);
    expect(c.mimeType).toBeUndefined();
    expect(c.ext).toBe("webm");
    expect(c.supported).toBe(false);
  });

  it("maps mime to extension", () => {
    expect(extForMime("video/mp4")).toBe("mp4");
    expect(extForMime("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extForMime("video/quicktime")).toBe("mp4");
  });
});
