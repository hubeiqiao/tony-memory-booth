import { CONFIG } from "../config";

// Capture-time sanity checks (§4 CHECK): never "save" an empty or broken clip.
// Inputs are measurements taken during/after recording so the logic stays pure
// and testable.
export interface SanityInput {
  durationMs: number;
  sizeBytes: number;
  peakAudioLevel: number; // normalized 0..1 peak observed during recording
  maxLuma: number; // 0..255 brightest sampled frame luminance
}

export interface SanityOptions {
  minDurationMs: number;
  audioFloor: number;
  blackThreshold: number;
}

export const DEFAULT_SANITY: SanityOptions = {
  minDurationMs: CONFIG.minDurationMs,
  audioFloor: CONFIG.audioFloor,
  blackThreshold: CONFIG.blackThreshold,
};

export type SanityReason =
  | "too_short"
  | "empty_file"
  | "no_audio"
  | "black_video";

export interface SanityResult {
  ok: boolean;
  reasons: SanityReason[];
}

export function checkRecording(
  input: SanityInput,
  opts: SanityOptions = DEFAULT_SANITY
): SanityResult {
  const reasons: SanityReason[] = [];
  if (input.sizeBytes <= 0) reasons.push("empty_file");
  if (input.durationMs < opts.minDurationMs) reasons.push("too_short");
  if (input.peakAudioLevel < opts.audioFloor) reasons.push("no_audio");
  if (input.maxLuma < opts.blackThreshold) reasons.push("black_video");
  return { ok: reasons.length === 0, reasons };
}
