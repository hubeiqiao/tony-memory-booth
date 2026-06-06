import { describe, it, expect } from "vitest";
import { detectMode, themeClass } from "./mode";

describe("mode", () => {
  it("defaults to phone (public, works without secrets)", () => {
    expect(detectMode("")).toBe("phone");
    expect(detectMode("?foo=1")).toBe("phone");
  });
  it("booth when explicitly requested", () => {
    expect(detectMode("?mode=booth")).toBe("booth");
  });
  it("booth when a key is present (attendant setup)", () => {
    expect(detectMode("?key=abc")).toBe("booth");
    expect(detectMode("", true)).toBe("booth");
  });
  it("phone wins when explicitly set", () => {
    expect(detectMode("?mode=phone")).toBe("phone");
  });
  it("maps theme classes", () => {
    expect(themeClass("booth")).toBe("theme-candlelight");
    expect(themeClass("phone")).toBe("theme-paper");
  });
});
