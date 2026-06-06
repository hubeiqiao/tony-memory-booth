import { describe, it, expect } from "vitest";
import { detectMode, themeClass } from "./mode";

describe("mode", () => {
  it("defaults to booth", () => {
    expect(detectMode("")).toBe("booth");
    expect(detectMode("?foo=1")).toBe("booth");
  });
  it("phone when ?mode=phone", () => {
    expect(detectMode("?mode=phone")).toBe("phone");
  });
  it("maps theme classes", () => {
    expect(themeClass("booth")).toBe("theme-candlelight");
    expect(themeClass("phone")).toBe("theme-paper");
  });
});
