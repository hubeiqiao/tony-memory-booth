import type { Mode } from "./types";

// The public default is PHONE — it works for any visitor (upload token via
// Turnstile, no disk copy). BOOTH is the staffed laptop: opt in with
// `?mode=booth` or by opening with a booth key (`?key=...`, which the attendant
// uses at setup). This keeps the bare public URL fully working.
export function detectMode(
  search: string = typeof location !== "undefined" ? location.search : "",
  hasBoothKey = false
): Mode {
  const p = new URLSearchParams(search);
  const m = p.get("mode");
  if (m === "phone") return "phone";
  if (m === "booth") return "booth";
  if (hasBoothKey || p.get("key")) return "booth";
  return "phone";
}

export function themeClass(mode: Mode): "theme-candlelight" | "theme-paper" {
  return mode === "phone" ? "theme-paper" : "theme-candlelight";
}

export function applyTheme(mode: Mode, body: HTMLElement = document.body): void {
  body.classList.remove("theme-candlelight", "theme-paper");
  body.classList.add(themeClass(mode));
}
