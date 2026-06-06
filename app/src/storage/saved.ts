import type { Mode } from "../types";

// Honest "✓ saved" semantics (§6) — it must never be a lie.
//   Booth: a real local file exists, so ✓ once IndexedDB tx AND disk write done.
//   Phone: no local disk copy, so ✓ only after upload completes.

export interface DurabilityState {
  idbDone: boolean;
  diskDone: boolean;
  uploadDone: boolean;
}

export function isSaved(mode: Mode, s: DurabilityState): boolean {
  if (mode === "booth") return s.idbDone && s.diskDone;
  return s.uploadDone;
}

/** Warm, non-transactional status copy (Design-Direction §7). */
export function savedLabel(mode: Mode, s: DurabilityState): string {
  if (isSaved(mode, s)) return "Saved — thank you.";
  if (mode === "phone") {
    return s.idbDone ? "Sending your message…" : "Holding your message…";
  }
  return s.idbDone ? "Saving to the booth…" : "Holding your message…";
}

/** True if leaving now risks loss (phone with upload still pending). */
export function hasPendingRisk(mode: Mode, s: DurabilityState): boolean {
  return mode === "phone" && !s.uploadDone;
}
