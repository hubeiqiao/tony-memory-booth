import { describe, it, expect } from "vitest";
import { checkRecording, SanityInput } from "./sanity";

const good: SanityInput = {
  durationMs: 8000,
  sizeBytes: 2_000_000,
  peakAudioLevel: 0.3,
  maxLuma: 120,
};

describe("checkRecording", () => {
  it("passes a healthy recording", () => {
    expect(checkRecording(good)).toEqual({ ok: true, reasons: [] });
  });

  it("flags too short", () => {
    const r = checkRecording({ ...good, durationMs: 500 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("too_short");
  });

  it("flags empty file", () => {
    const r = checkRecording({ ...good, sizeBytes: 0 });
    expect(r.reasons).toContain("empty_file");
  });

  it("flags silent audio", () => {
    const r = checkRecording({ ...good, peakAudioLevel: 0.001 });
    expect(r.reasons).toContain("no_audio");
  });

  it("flags black video", () => {
    const r = checkRecording({ ...good, maxLuma: 3 });
    expect(r.reasons).toContain("black_video");
  });

  it("accumulates multiple reasons", () => {
    const r = checkRecording({
      durationMs: 100,
      sizeBytes: 0,
      peakAudioLevel: 0,
      maxLuma: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.sort()).toEqual(
      ["black_video", "empty_file", "no_audio", "too_short"].sort()
    );
  });
});
