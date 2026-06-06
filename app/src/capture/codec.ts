// Codec/container detection. Priority favors mp4 (Safari/iOS), falling through
// to webm (Chrome/Android/desktop). Pure: pass an `isSupported` predicate
// (wraps MediaRecorder.isTypeSupported) so it is fully testable.
export const DEFAULT_CANDIDATES = [
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export type Ext = "mp4" | "webm";

export function extForMime(mime: string): Ext {
  return /mp4|quicktime/i.test(mime) ? "mp4" : "webm";
}

export interface CodecChoice {
  /** The mimeType to pass to MediaRecorder, or undefined to use its default. */
  mimeType: string | undefined;
  ext: Ext;
  /** Whether any candidate matched (false => relying on browser default). */
  supported: boolean;
}

export function pickMimeType(
  isSupported: (mime: string) => boolean,
  candidates: readonly string[] = DEFAULT_CANDIDATES
): CodecChoice {
  for (const c of candidates) {
    if (isSupported(c)) {
      return { mimeType: c, ext: extForMime(c), supported: true };
    }
  }
  // Nothing matched: let MediaRecorder choose; assume webm container for the key.
  return { mimeType: undefined, ext: "webm", supported: false };
}
