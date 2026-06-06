import type { Mode, RecordingMeta } from "../types";
import type { CaptureResult } from "../capture/recorder";
import { transition, type State, type EventType } from "../state/machine";
import { checkRecording } from "../capture/sanity";
import { isSaved, savedLabel, type DurabilityState } from "../storage/saved";
import { CONFIG } from "../config";
import { buildStage, SCREEN_FOR, type ScreenRefs } from "./screens";

// ---- Injected services (browser wiring in services.ts; fakes in tests) ----
export interface CaptureService {
  startPreview(video: HTMLVideoElement): Promise<void>;
  beginRecording(onChunk: (seq: number, blob: Blob) => void): Promise<void>;
  stopRecording(): Promise<CaptureResult>;
  metrics(): { peakAudio: number; maxLuma: number };
  attachPlayback(video: HTMLVideoElement, blob: Blob): void;
  teardown(): void;
}
export interface BufferService {
  begin(id: string, createdAt: number): Promise<void>;
  append(id: string, seq: number, blob: Blob): Promise<void>;
  finalize(id: string, meta: RecordingMeta, mime: string): Promise<Blob>;
  saveToDisk(id: string, ext: string, blob: Blob): Promise<boolean>;
  markComplete(id: string): Promise<void>;
}
export interface UploadService {
  upload(blob: Blob, meta: RecordingMeta): Promise<void>;
}
export interface Scheduler {
  after(ms: number, cb: () => void): () => void;
  every(ms: number, cb: () => void): () => void;
}
export interface ControllerDeps {
  mode: Mode;
  capture: CaptureService;
  buffer: BufferService;
  upload: UploadService;
  scheduler: Scheduler;
  now: () => number;
  newId: () => string;
  onError?: (e: unknown) => void;
}

interface Current {
  id: string;
  createdAt: number;
  result?: CaptureResult;
  blob?: Blob;
  durability: DurabilityState;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export class Controller {
  private deps: ControllerDeps;
  private refs: ScreenRefs;
  private state: State = "idle";
  private cur: Current;
  private cancelTick: (() => void) | null = null;
  private cancelCap: (() => void) | null = null;

  constructor(root: HTMLElement, deps: ControllerDeps) {
    this.deps = deps;
    this.refs = buildStage(root, deps.mode);
    this.cur = this.freshCurrent();
    root.addEventListener("click", (e) => {
      const action = (e.target as HTMLElement)?.closest("[data-action]")?.getAttribute("data-action");
      if (action) void this.act(action);
    });
    this.render();
  }

  getState(): State {
    return this.state;
  }

  private freshCurrent(): Current {
    return {
      id: this.deps.newId(),
      createdAt: this.deps.now(),
      durability: { idbDone: false, diskDone: false, uploadDone: false },
    };
  }

  private dispatch(ev: EventType): void {
    const next = transition(this.state, ev);
    if (next !== this.state) {
      this.state = next;
      this.render();
    }
  }

  private render(): void {
    const key = SCREEN_FOR[this.state];
    for (const [k, el] of Object.entries(this.refs.screens)) {
      el?.classList.toggle("is-active", k === key);
    }
    if (this.deps.mode === "booth" && this.refs.attendant) {
      this.refs.attendant.textContent =
        this.state === "thankyou" ? "Attendant: tap Done when the guest is ready." : "";
    }
  }

  // ---- action handlers ----
  async act(action: string): Promise<void> {
    try {
      switch (action) {
        case "begin":
          this.dispatch("BEGIN");
          if (this.deps.mode === "booth") await this.requestPermission();
          break;
        case "allow":
          await this.requestPermission();
          break;
        case "start":
          await this.startCountdown();
          break;
        case "stop":
          await this.finishRecording();
          break;
        case "keep":
          this.dispatch("KEEP");
          break;
        case "rerecord":
          this.dispatch("RERECORD");
          await this.startPreview();
          break;
        case "skip":
          await this.save(undefined);
          break;
        case "submit":
          await this.save(this.collectContact());
          break;
        case "reset":
          this.reset();
          break;
        default:
          break;
      }
    } catch (e) {
      this.deps.onError?.(e);
      this.fail();
    }
  }

  private async requestPermission(): Promise<void> {
    try {
      await this.deps.capture.startPreview(this.refs.previewVideo);
      this.dispatch("PERMISSION_GRANTED");
    } catch {
      this.dispatch("PERMISSION_DENIED");
    }
  }

  private async startPreview(): Promise<void> {
    await this.deps.capture.startPreview(this.refs.previewVideo);
  }

  private async startCountdown(): Promise<void> {
    this.dispatch("START");
    let n = CONFIG.countdownFrom;
    this.refs.countdownNum.textContent = String(n);
    const tick = () => {
      n -= 1;
      if (n > 0) {
        this.refs.countdownNum.textContent = String(n);
        this.deps.scheduler.after(1000, tick);
      } else {
        void this.beginRecording();
      }
    };
    this.deps.scheduler.after(1000, tick);
  }

  private async beginRecording(): Promise<void> {
    this.cur = this.freshCurrent();
    await this.deps.buffer.begin(this.cur.id, this.cur.createdAt);
    await this.deps.capture.beginRecording((seq, blob) => {
      void this.deps.buffer.append(this.cur.id, seq, blob);
    });
    this.dispatch("COUNTDOWN_DONE");
    const startedAt = this.deps.now();
    this.cancelTick = this.deps.scheduler.every(250, () => {
      const elapsed = this.deps.now() - startedAt;
      this.refs.timer.textContent = fmt(elapsed);
      if (elapsed >= CONFIG.maxDurationMs - CONFIG.graceMs) {
        this.refs.timer.dataset.grace = "1";
      }
    });
    // hard cap: auto-stop at the maximum
    this.cancelCap = this.deps.scheduler.after(CONFIG.maxDurationMs, () => {
      if (this.state === "recording") void this.finishRecording();
    });
  }

  private async finishRecording(): Promise<void> {
    this.cancelTick?.();
    this.cancelCap?.();
    this.cancelTick = this.cancelCap = null;
    this.dispatch("STOP");
    const result = await this.deps.capture.stopRecording();
    this.cur.result = result;
    this.cur.blob = result.blob;
    const m = this.deps.capture.metrics();
    const sanity = checkRecording({
      durationMs: result.durationMs,
      sizeBytes: result.blob.size,
      peakAudioLevel: m.peakAudio,
      maxLuma: m.maxLuma,
    });
    if (sanity.ok) {
      this.deps.capture.attachPlayback(this.refs.reviewVideo, result.blob);
      this.dispatch("CHECK_PASS");
    } else {
      this.refs.checkNote.textContent = "Let's try that once more.";
      this.dispatch("CHECK_FAIL");
      await this.startPreview();
    }
  }

  private collectContact(): RecordingMeta["contact"] {
    const c = {
      name: this.refs.contact.name?.value.trim() || undefined,
      email: this.refs.contact.email?.value.trim() || undefined,
      phone: this.refs.contact.phone?.value.trim() || undefined,
    };
    return c.name || c.email || c.phone ? c : undefined;
  }

  private buildMeta(contact: RecordingMeta["contact"]): RecordingMeta {
    const r = this.cur.result!;
    return {
      id: this.cur.id,
      createdAt: this.cur.createdAt,
      mode: this.deps.mode,
      durationMs: r.durationMs,
      mimeType: r.mimeType,
      ext: r.ext,
      sizeBytes: r.blob.size,
      consent: { accepted: true, text: CONFIG.consent.text, version: CONFIG.consent.version },
      ...(contact ? { contact } : {}),
      appVersion: CONFIG.appVersion,
    };
  }

  private updateSaving(): void {
    this.refs.savingStatus.textContent = savedLabel(this.deps.mode, this.cur.durability);
  }

  private async save(contact: RecordingMeta["contact"]): Promise<void> {
    this.dispatch("CONTACT_DONE");
    const meta = this.buildMeta(contact);
    this.updateSaving();

    // 1) durable local write (IndexedDB)
    const blob = await this.deps.buffer.finalize(this.cur.id, meta, meta.mimeType);
    this.cur.blob = blob;
    this.cur.durability.idbDone = true;
    this.updateSaving();

    // 2) booth: primary copy to disk
    if (this.deps.mode === "booth") {
      this.cur.durability.diskDone = await this.deps.buffer.saveToDisk(this.cur.id, meta.ext, blob);
      this.updateSaving();
    }

    // 3) background upload; confirms durability for phone
    const uploadPromise = this.deps.upload
      .upload(blob, meta)
      .then(async () => {
        this.cur.durability.uploadDone = true;
        await this.deps.buffer.markComplete(this.cur.id);
        this.updateSaving();
        if (this.deps.mode === "phone" && this.state === "saving") this.dispatch("SAVED");
      })
      .catch((e) => this.deps.onError?.(e)); // queued; never blocks the guest

    // Booth is durably safe once idb + disk are done — don't wait on the network.
    if (isSaved(this.deps.mode, this.cur.durability)) {
      this.dispatch("SAVED");
    } else if (this.deps.mode === "booth") {
      // disk unavailable: fall back to waiting for upload so ✓ stays honest
      await uploadPromise;
      if (this.state === "saving") this.dispatch(isSaved("booth", this.cur.durability) ? "SAVED" : "SAVE_FAILED");
    }
  }

  private reset(): void {
    this.deps.capture.teardown();
    // clear any contact PII so nothing lingers for the next guest (§4)
    if (this.refs.contact.name) this.refs.contact.name.value = "";
    if (this.refs.contact.email) this.refs.contact.email.value = "";
    if (this.refs.contact.phone) this.refs.contact.phone.value = "";
    this.refs.timer.textContent = "0:00";
    delete this.refs.timer.dataset.grace;
    this.cur = this.freshCurrent();
    this.dispatch("RESET");
  }

  private fail(): void {
    this.cancelTick?.();
    this.cancelCap?.();
    this.dispatch("FATAL");
  }
}
