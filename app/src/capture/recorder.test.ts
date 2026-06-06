import { describe, it, expect, vi } from "vitest";
import { Recorder, type MediaDeps, type RecorderLike, type StreamLike } from "./recorder";
import { PeakTracker, LumaTracker, frameLuma } from "./level";

// ---- Fakes -----------------------------------------------------------------
function makeFakes(opts: { supports: (m: string) => boolean }) {
  const stopped: string[] = [];
  const tracks = [
    { kind: "video", stop: () => stopped.push("video") },
    { kind: "audio", stop: () => stopped.push("audio") },
  ];
  const stream: StreamLike = { getTracks: () => tracks };
  let rec!: FakeRecorder;
  class FakeRecorder implements RecorderLike {
    state = "inactive";
    ondataavailable: ((ev: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    mimeType?: string;
    started: number[] = [];
    start(timeslice?: number) {
      this.state = "recording";
      this.started.push(timeslice ?? -1);
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
    emit(data: Blob) {
      this.ondataavailable?.({ data });
    }
  }
  let t = 0;
  const deps: MediaDeps = {
    getUserMedia: vi.fn(async () => stream),
    createRecorder: vi.fn((_s, options) => {
      rec = new FakeRecorder();
      rec.mimeType = options?.mimeType;
      return rec;
    }),
    isTypeSupported: opts.supports,
    now: () => (t += 1000),
  };
  return { deps, stopped, getRec: () => rec };
}

describe("Recorder", () => {
  it("selects mp4 when supported and chunks via timeslice", async () => {
    const { deps, getRec } = makeFakes({ supports: (m) => m.startsWith("video/mp4") });
    const r = new Recorder(deps);
    const seen: number[] = [];
    await r.start(undefined, (_b, total) => seen.push(total));
    const rec = getRec();
    expect(rec.started[0]).toBeGreaterThan(0); // a timeslice was passed
    rec.emit(new Blob([new Uint8Array(10)]));
    rec.emit(new Blob([new Uint8Array(20)]));
    const result = await r.stop();
    expect(result.mimeType).toContain("mp4");
    expect(result.ext).toBe("mp4");
    expect(result.chunks).toBe(2);
    expect(result.blob.size).toBe(30);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(seen).toEqual([10, 30]);
  });

  it("falls back to webm when mp4 unsupported", async () => {
    const { deps, getRec } = makeFakes({ supports: (m) => m === "video/webm;codecs=vp9,opus" });
    const r = new Recorder(deps);
    await r.start();
    getRec().emit(new Blob([new Uint8Array(5)]));
    const result = await r.stop();
    expect(result.ext).toBe("webm");
  });

  it("ignores empty chunks", async () => {
    const { deps, getRec } = makeFakes({ supports: () => true });
    const r = new Recorder(deps);
    await r.start();
    getRec().emit(new Blob([])); // empty
    getRec().emit(new Blob([new Uint8Array(8)]));
    const result = await r.stop();
    expect(result.chunks).toBe(1);
  });

  it("teardown stops every track and is idempotent", async () => {
    const { deps, stopped } = makeFakes({ supports: () => true });
    const r = new Recorder(deps);
    await r.start();
    r.teardown();
    r.teardown(); // safe twice
    expect(stopped.sort()).toEqual(["audio", "video"]);
  });
});

describe("PeakTracker / LumaTracker", () => {
  it("tracks audio peak", () => {
    const p = new PeakTracker();
    p.update(0.1);
    p.update(0.4);
    p.update(0.2);
    expect(p.value).toBeCloseTo(0.4);
  });

  it("computes rms from samples", () => {
    const p = new PeakTracker();
    const lvl = p.updateFromSamples([1, -1, 1, -1]);
    expect(lvl).toBeCloseTo(1);
  });

  it("frameLuma: black is ~0, white is ~255", () => {
    expect(frameLuma([0, 0, 0, 255])).toBeCloseTo(0);
    expect(frameLuma([255, 255, 255, 255])).toBeCloseTo(255);
  });

  it("LumaTracker keeps the brightest frame", () => {
    const l = new LumaTracker();
    l.update([0, 0, 0, 255]);
    l.update([200, 200, 200, 255]);
    l.update([10, 10, 10, 255]);
    expect(l.value).toBeGreaterThan(150);
  });
});
