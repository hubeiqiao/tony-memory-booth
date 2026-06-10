import { pickMimeType, extForMime, type Ext } from "./capture/codec";
import { PeakTracker, LumaTracker } from "./capture/level";
import { CONFIG } from "./config";
import type { CaptureResult } from "./capture/recorder";
import type { CaptureService } from "./ui/controller";

// Browser wiring for capture: live preview, MediaRecorder with codec detection
// + timeslice chunking, audio level metering, and frame-luma sampling for the
// black-frame sanity check. Thin glue over tested modules (controller logic is
// covered via fakes).
//
// Aspect normalization: cameras hand us wildly different shapes (laptop 4:3,
// phone portrait, phone landscape). We draw the live camera onto a fixed 4:3
// canvas (cover-cropped, biased to keep faces) and RECORD THE CANVAS, so every
// saved file — and therefore the preview, the review, the family view, and the
// download — is a uniform 4:3. If a browser can't support that path, we fall
// back to recording the raw camera exactly as before so a message is never lost.

const TARGET = { w: 960, h: 720 } as const; // 4:3
const VERT_ANCHOR = 0.15; // crop bias: keep the top (faces) when a source is taller than 4:3

class BrowserCapture implements CaptureService {
  private stream: MediaStream | null = null; // raw camera + mic
  private outStream: MediaStream | null = null; // normalized 4:3 (+ mic) we record/show
  private srcVideo: HTMLVideoElement | null = null; // hidden element we draw from
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
  private drawRaf = 0;
  private sampleTimer = 0;
  private lumaCanvas = document.createElement("canvas");
  private outCanvas = document.createElement("canvas");
  private useCanvas = false;

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

    await this.setupCanvasPipeline();

    // Show whichever stream we'll record, so what the guest sees IS what's saved.
    const display = this.outStream ?? this.stream;
    video.srcObject = display;
    video.muted = true;
    await video.play().catch(() => {});

    this.meterAudio();
    this.sampleLuma(video);
  }

  /** Build the 4:3 canvas + draw loop and a normalized output stream. Best-effort. */
  private async setupCanvasPipeline(): Promise<void> {
    this.useCanvas = false;
    this.outStream = null;
    try {
      const canCapture = typeof this.outCanvas.captureStream === "function";
      if (!canCapture || !this.stream) return;

      const src = document.createElement("video");
      src.muted = true;
      src.playsInline = true;
      src.srcObject = this.stream;
      await src.play().catch(() => {});
      this.srcVideo = src;

      this.outCanvas.width = TARGET.w;
      this.outCanvas.height = TARGET.h;
      const ctx = this.outCanvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, TARGET.w, TARGET.h);

      const draw = () => {
        const v = this.srcVideo;
        if (v && v.videoWidth && v.videoHeight) {
          const scale = Math.max(TARGET.w / v.videoWidth, TARGET.h / v.videoHeight);
          const dw = v.videoWidth * scale;
          const dh = v.videoHeight * scale;
          const dx = (TARGET.w - dw) / 2; // centered horizontally
          const dy = (TARGET.h - dh) * VERT_ANCHOR; // bias toward the top to keep faces
          ctx.drawImage(v, dx, dy, dw, dh);
        }
        this.drawRaf = requestAnimationFrame(draw);
      };
      draw();

      const out = this.outCanvas.captureStream(30);
      const audio = this.stream.getAudioTracks()[0];
      if (audio) out.addTrack(audio);
      if (out.getVideoTracks().length === 0) return; // capture produced nothing usable
      this.outStream = out;
      this.useCanvas = true;
    } catch {
      // any failure → leave outStream null so we record the raw camera (no loss)
      this.useCanvas = false;
      this.outStream = null;
      if (this.drawRaf) cancelAnimationFrame(this.drawRaf);
      this.drawRaf = 0;
    }
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
    const ctx = this.lumaCanvas.getContext("2d");
    // Sample the normalized canvas when present (what's actually recorded),
    // otherwise the live preview element.
    this.sampleTimer = window.setInterval(() => {
      if (!ctx) return;
      const w = 32;
      const h = 24;
      this.lumaCanvas.width = w;
      this.lumaCanvas.height = h;
      if (this.useCanvas && this.outCanvas.width) {
        ctx.drawImage(this.outCanvas, 0, 0, w, h);
      } else if (video.videoWidth) {
        ctx.drawImage(video, 0, 0, w, h);
      } else {
        return;
      }
      this.luma.update(ctx.getImageData(0, 0, w, h).data);
    }, 400);
  }

  /** Attach the recorded (normalized) stream to another video element (recording screen). */
  showLive(video: HTMLVideoElement): void {
    const display = this.outStream ?? this.stream;
    if (!display) return;
    video.srcObject = display;
    video.muted = true;
    void video.play().catch(() => {});
  }

  async beginRecording(onChunk: (seq: number, blob: Blob) => void): Promise<void> {
    const recordStream = this.outStream ?? this.stream;
    if (!recordStream) throw new Error("no preview stream");
    const choice = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
    this.recorder = new MediaRecorder(
      recordStream,
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
    if (video.src) {
      try {
        URL.revokeObjectURL(video.src);
      } catch {
        /* ignore */
      }
    }
    video.srcObject = null;
    video.src = URL.createObjectURL(blob);
    // MediaRecorder WebM (desktop Chrome/Firefox) ships without duration metadata,
    // so video.duration reads as Infinity and the scrubber/total time never fills
    // in. Force the browser to compute the real duration by seeking past the end
    // once, then snap back to the start. (iOS records mp4, which already has it.)
    const onMeta = () => {
      if (!Number.isFinite(video.duration)) {
        const onSeek = () => {
          video.removeEventListener("timeupdate", onSeek);
          try {
            video.currentTime = 0;
          } catch {
            /* ignore */
          }
        };
        video.addEventListener("timeupdate", onSeek);
        try {
          video.currentTime = 1e7; // clamps to the true end, emitting the real duration
        } catch {
          /* ignore */
        }
      }
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
  }

  /** Stop camera + mic, the draw loop, and metering immediately (keeps captured blob/metrics). */
  releaseCamera(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* ignore */
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.drawRaf) cancelAnimationFrame(this.drawRaf);
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    this.raf = this.drawRaf = this.sampleTimer = 0;
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.outStream?.getTracks().forEach((t) => t.stop());
    this.outStream = null;
    if (this.srcVideo) {
      try {
        this.srcVideo.srcObject = null;
      } catch {
        /* ignore */
      }
      this.srcVideo = null;
    }
    this.useCanvas = false;
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
