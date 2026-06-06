import { pickMimeType, extForMime, type Ext } from "./codec";
import { CONFIG } from "../config";

// Minimal structural interfaces so the recorder is testable without a real
// browser. Production wiring (defaultMediaDeps) uses the actual Web APIs.
export interface TrackLike {
  kind: string;
  stop(): void;
  readyState?: string;
}
export interface StreamLike {
  getTracks(): TrackLike[];
}
export interface RecorderLike {
  state: string;
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((ev: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((ev: unknown) => void) | null;
  mimeType?: string;
}
export interface MediaDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<StreamLike>;
  createRecorder(stream: StreamLike, options?: { mimeType?: string }): RecorderLike;
  isTypeSupported(mime: string): boolean;
  now(): number;
}

export interface CaptureResult {
  blob: Blob;
  mimeType: string;
  ext: Ext;
  durationMs: number;
  chunks: number;
}

export const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
  audio: { echoCancellation: true, noiseSuppression: true },
};

/**
 * Wraps MediaRecorder with: codec detection, timeslice chunking (a crash loses
 * at most one slice), and strict teardown (§5). Each instance records once;
 * call teardown() to release the camera/mic before starting another.
 */
export class Recorder {
  private deps: MediaDeps;
  private stream: StreamLike | null = null;
  private recorder: RecorderLike | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private stoppedAt = 0;
  private chosenMime = "";
  private ext: Ext = "webm";
  private onChunk?: (blob: Blob, total: number) => void;

  constructor(deps: MediaDeps) {
    this.deps = deps;
  }

  /** Acquire camera/mic and begin recording with timeslice chunking. */
  async start(
    constraints: MediaStreamConstraints = DEFAULT_CONSTRAINTS,
    onChunk?: (blob: Blob, total: number) => void
  ): Promise<void> {
    this.onChunk = onChunk;
    this.stream = await this.deps.getUserMedia(constraints);
    const choice = pickMimeType((m) => this.deps.isTypeSupported(m));
    this.recorder = this.deps.createRecorder(
      this.stream,
      choice.mimeType ? { mimeType: choice.mimeType } : undefined
    );
    this.chosenMime = choice.mimeType ?? this.recorder.mimeType ?? "video/webm";
    this.ext = extForMime(this.chosenMime);
    this.chunks = [];

    this.recorder.ondataavailable = (ev) => {
      if (ev.data && (ev.data as Blob).size > 0) {
        this.chunks.push(ev.data);
        this.onChunk?.(ev.data, this.totalBytes());
      }
    };
    this.startedAt = this.deps.now();
    this.recorder.start(CONFIG.timesliceMs);
  }

  /** Stop recording and resolve with the assembled blob + metadata. */
  stop(): Promise<CaptureResult> {
    return new Promise<CaptureResult>((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) {
        reject(new Error("not recording"));
        return;
      }
      rec.onstop = () => {
        this.stoppedAt = this.deps.now();
        const blob = new Blob(this.chunks, { type: this.chosenMime });
        resolve({
          blob,
          mimeType: this.chosenMime,
          ext: this.ext,
          durationMs: Math.max(0, this.stoppedAt - this.startedAt),
          chunks: this.chunks.length,
        });
      };
      rec.onerror = (e) => reject(e instanceof Error ? e : new Error("recorder error"));
      if (rec.state !== "inactive") rec.stop();
      else rec.onstop();
    });
  }

  totalBytes(): number {
    return this.chunks.reduce((n, c) => n + c.size, 0);
  }

  /**
   * Release every resource. Idempotent and safe to call multiple times — the
   * booth resets dozens of times, so leaks are not allowed (§5 soak gate).
   */
  teardown(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* ignore */
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.onChunk = undefined;
  }
}

/** Browser wiring — only touch Web APIs at call time so node imports are safe. */
export function defaultMediaDeps(): MediaDeps {
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c) as unknown as Promise<StreamLike>,
    createRecorder: (stream, options) =>
      new MediaRecorder(stream as unknown as MediaStream, options) as unknown as RecorderLike,
    isTypeSupported: (m) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    now: () => performance.now(),
  };
}
