import { pickMimeType, extForMime, type Ext } from "./capture/codec";
import { PeakTracker, LumaTracker } from "./capture/level";
import { CONFIG } from "./config";
import type { CaptureResult } from "./capture/recorder";
import type { CaptureService } from "./ui/controller";

// Browser wiring for capture: live preview, MediaRecorder with codec detection
// + timeslice chunking, audio level metering, and frame-luma sampling for the
// black-frame sanity check. Thin glue over tested modules (controller logic is
// covered via fakes).
class BrowserCapture implements CaptureService {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private chosenMime = "video/webm";
  private ext: Ext = "webm";
  private startedAt = 0;
  private stoppedAt = 0;
  private peak = new PeakTracker();
  private luma = new LumaTracker();
  private audioCtx: AudioContext | null = null;
  private raf = 0;
  private sampleTimer = 0;
  private canvas = document.createElement("canvas");

  async startPreview(video: HTMLVideoElement): Promise<void> {
    this.teardown();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 960 },
        aspectRatio: { ideal: 4 / 3 },
        facingMode: "user",
      },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    video.srcObject = this.stream;
    video.muted = true;
    await video.play().catch(() => {});
    this.meterAudio();
    this.sampleLuma(video);
  }

  private meterAudio(): void {
    if (!this.stream) return;
    try {
      this.audioCtx = new AudioContext();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        this.peak.updateFromSamples(buf);
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* metering is best-effort */
    }
  }

  private sampleLuma(video: HTMLVideoElement): void {
    const ctx = this.canvas.getContext("2d");
    this.sampleTimer = window.setInterval(() => {
      if (!ctx || !video.videoWidth) return;
      this.canvas.width = 32;
      this.canvas.height = 24;
      ctx.drawImage(video, 0, 0, 32, 24);
      this.luma.update(ctx.getImageData(0, 0, 32, 24).data);
    }, 400);
  }

  /** Attach the current live stream to another video element (recording screen). */
  showLive(video: HTMLVideoElement): void {
    if (!this.stream) return;
    video.srcObject = this.stream;
    video.muted = true;
    void video.play().catch(() => {});
  }

  async beginRecording(onChunk: (seq: number, blob: Blob) => void): Promise<void> {
    if (!this.stream) throw new Error("no preview stream");
    const choice = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
    this.recorder = new MediaRecorder(
      this.stream,
      choice.mimeType ? { mimeType: choice.mimeType } : undefined
    );
    this.chosenMime = choice.mimeType ?? this.recorder.mimeType ?? "video/webm";
    this.ext = extForMime(this.chosenMime);
    this.chunks = [];
    this.peak.reset();
    let seq = 0;
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
        onChunk(seq++, e.data);
      }
    };
    this.startedAt = performance.now();
    this.recorder.start(CONFIG.timesliceMs);
  }

  stopRecording(): Promise<CaptureResult> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) return reject(new Error("not recording"));
      rec.onstop = () => {
        this.stoppedAt = performance.now();
        resolve({
          blob: new Blob(this.chunks, { type: this.chosenMime }),
          mimeType: this.chosenMime,
          ext: this.ext,
          durationMs: Math.max(0, this.stoppedAt - this.startedAt),
          chunks: this.chunks.length,
        });
      };
      if (rec.state !== "inactive") rec.stop();
      else rec.onstop?.(new Event("stop"));
    });
  }

  metrics(): { peakAudio: number; maxLuma: number } {
    return { peakAudio: this.peak.value, maxLuma: this.luma.value };
  }

  attachPlayback(video: HTMLVideoElement, blob: Blob): void {
    video.srcObject = null;
    video.src = URL.createObjectURL(blob);
  }

  /** Stop camera + mic and metering immediately (keeps captured blob/metrics). */
  releaseCamera(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* ignore */
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    this.raf = this.sampleTimer = 0;
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  teardown(): void {
    this.releaseCamera();
    this.chunks = [];
    this.peak.reset();
    this.luma.reset();
  }
}

export function createCaptureService(): CaptureService {
  return new BrowserCapture();
}
