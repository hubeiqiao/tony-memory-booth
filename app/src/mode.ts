import type { Mode } from "./types";

// Booth is the default (the staffed centerpiece); ?mode=phone switches to the
// warm "paper" theme for the QR/phone path.
export function detectMode(search: string = typeof location !== "undefined" ? location.search : ""): Mode {
  return new URLSearchParams(search).get("mode") === "phone" ? "phone" : "booth";
}

export function themeClass(mode: Mode): "theme-candlelight" | "theme-paper" {
  return mode === "phone" ? "theme-paper" : "theme-candlelight";
}

export function applyTheme(mode: Mode, body: HTMLElement = document.body): void {
  body.classList.remove("theme-candlelight", "theme-paper");
  body.classList.add(themeClass(mode));
}
