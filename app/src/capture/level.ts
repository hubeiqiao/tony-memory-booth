// Pure helpers feeding the level meter and the capture-time sanity checks.
// Kept free of Web Audio / canvas so they're unit-testable; the browser layer
// supplies the samples.

/** Tracks the running peak of a normalized (0..1) audio level. */
export class PeakTracker {
  private peak = 0;
  /** Feed a normalized level (0..1) or a frame of samples. */
  update(level: number): void {
    const v = Math.abs(level);
    if (v > this.peak) this.peak = Math.min(1, v);
  }
  /** RMS-style update from a buffer of -1..1 samples; returns this frame's level. */
  updateFromSamples(samples: ArrayLike<number>): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
    this.update(rms);
    return rms;
  }
  get value(): number {
    return this.peak;
  }
  reset(): void {
    this.peak = 0;
  }
}

/** Average luminance (0..255) of RGBA pixel data — for black-frame detection. */
export function frameLuma(rgba: ArrayLike<number>): number {
  if (!rgba.length) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    // Rec. 601 luma
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    n++;
  }
  return n ? sum / n : 0;
}

/** Tracks the brightest frame seen (so a single lit frame clears "black"). */
export class LumaTracker {
  private max = 0;
  update(rgba: ArrayLike<number>): number {
    const l = frameLuma(rgba);
    if (l > this.max) this.max = l;
    return l;
  }
  get value(): number {
    return this.max;
  }
  reset(): void {
    this.max = 0;
  }
}
