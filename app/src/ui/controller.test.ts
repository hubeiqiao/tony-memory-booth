// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Controller, type ControllerDeps } from "./controller";
import type { CaptureResult } from "../capture/recorder";
import type { Mode } from "../types";

function makeScheduler() {
  const afters: { cb: () => void; cancelled: boolean }[] = [];
  const everies: { cb: () => void }[] = [];
  return {
    sched: {
      after: (_ms: number, cb: () => void) => {
        const e = { cb, cancelled: false };
        afters.push(e);
        return () => {
          e.cancelled = true;
        };
      },
      every: (_ms: number, cb: () => void) => {
        everies.push({ cb });
        return () => {};
      },
    },
    runAfters() {
      const snap = afters.splice(0);
      for (const e of snap) if (!e.cancelled) e.cb();
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakes(mode: Mode) {
  const result: CaptureResult = {
    blob: new Blob([new Uint8Array(20)]),
    mimeType: "video/webm",
    ext: "webm",
    durationMs: 8000,
    chunks: 2,
  };
  const buffer = {
    begin: vi.fn(async () => {}),
    append: vi.fn(async () => {}),
    finalize: vi.fn(async () => result.blob),
    saveToDisk: vi.fn(async () => true),
    markComplete: vi.fn(async () => {}),
  };
  let resolveUpload!: () => void;
  const uploadDone = new Promise<void>((r) => (resolveUpload = r));
  const upload = { upload: vi.fn(() => uploadDone) };
  const capture = {
    startPreview: vi.fn(async () => {}),
    showLive: vi.fn(),
    beginRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(async () => result),
    releaseCamera: vi.fn(),
    metrics: () => ({ peakAudio: 0.5, maxLuma: 120 }),
    attachPlayback: vi.fn(),
    teardown: vi.fn(),
  };
  const sch = makeScheduler();
  const deps: ControllerDeps = {
    mode,
    capture,
    buffer,
    upload,
    scheduler: sch.sched,
    now: () => 1000,
    newId: () => "01HZ0000000000000000000009",
  };
  return { deps, buffer, upload, capture, sch, resolveUpload };
}

function mount(): HTMLElement {
  document.body.innerHTML = `<div id="app"></div>`;
  return document.getElementById("app") as HTMLElement;
}

function activeScreen(root: HTMLElement): string | undefined {
  return root.querySelector(".screen.is-active")?.getAttribute("data-screen") ?? undefined;
}

async function toRecording(c: Controller, sch: ReturnType<typeof makeScheduler>) {
  await c.act("start"); // -> countdown, schedules first tick
  sch.runAfters(); // 3 -> 2
  sch.runAfters(); // 2 -> 1
  sch.runAfters(); // 1 -> 0 -> beginRecording()
  await flush();
}

describe("Controller (jsdom)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the welcome screen first", () => {
    const root = mount();
    const { deps } = fakes("booth");
    const c = new Controller(root, deps);
    expect(c.getState()).toBe("idle");
    expect(activeScreen(root)).toBe("welcome");
  });

  it("booth: walks begin → ready → record → review → keep → thankyou", async () => {
    const root = mount();
    const { deps, buffer, capture, sch } = fakes("booth");
    const c = new Controller(root, deps);

    await c.act("begin"); // → permission screen
    expect(c.getState()).toBe("permission");
    await c.act("allow"); // Allow triggers the camera
    await flush();
    expect(c.getState()).toBe("ready");
    expect(capture.startPreview).toHaveBeenCalled();

    await toRecording(c, sch);
    expect(c.getState()).toBe("recording");
    expect(buffer.begin).toHaveBeenCalled();
    expect(capture.beginRecording).toHaveBeenCalled();

    await c.act("stop");
    await flush();
    expect(c.getState()).toBe("review");
    expect(capture.attachPlayback).toHaveBeenCalled();

    await c.act("keep");
    expect(activeScreen(root)).toBe("contact");

    await c.act("skip"); // save without contact
    await flush();
    // booth is durably saved on idb+disk without waiting for upload
    expect(buffer.finalize).toHaveBeenCalled();
    expect(buffer.saveToDisk).toHaveBeenCalled();
    expect(c.getState()).toBe("thankyou");
    expect(activeScreen(root)).toBe("thankyou");
  });

  it("phone: ✓ waits for upload completion", async () => {
    const root = mount();
    const f = fakes("phone");
    const c = new Controller(root, f.deps);

    await c.act("begin");
    await c.act("allow");
    await flush();
    await toRecording(c, f.sch);
    await c.act("stop");
    await flush();
    await c.act("keep");
    await c.act("submit"); // save with (empty) contact
    await flush();

    // upload not resolved yet → still saving (phone gates ✓ on upload)
    expect(f.deps.mode).toBe("phone");
    expect(c.getState()).toBe("saving");
    expect(f.buffer.saveToDisk).not.toHaveBeenCalled();

    f.resolveUpload();
    await flush();
    expect(f.buffer.markComplete).toHaveBeenCalled();
    expect(c.getState()).toBe("thankyou");
  });

  it("poor-quality recording is NOT blocked — shows review with a gentle note", async () => {
    const root = mount();
    const f = fakes("booth");
    f.capture.metrics = () => ({ peakAudio: 0, maxLuma: 0 }); // silent + black
    const c = new Controller(root, f.deps);
    await c.act("begin");
    await c.act("allow");
    await flush();
    await toRecording(c, f.sch);
    await c.act("stop");
    await flush();
    expect(c.getState()).toBe("review"); // not forced back to ready
    const note = root.querySelector('[data-ref="reviewnote"]');
    expect(note.hidden).toBe(false);
    expect(note.textContent.length).toBeGreaterThan(0);
  });

  it("clears contact PII on reset", async () => {
    const root = mount();
    const f = fakes("booth");
    const c = new Controller(root, f.deps);
    const nameInput = root.querySelector("#c-name") as HTMLInputElement;
    nameInput.value = "Jane Doe";

    await c.act("begin");
    await c.act("allow");
    await flush();
    await toRecording(c, f.sch);
    await c.act("stop");
    await flush();
    await c.act("keep");
    await c.act("skip");
    await flush();
    expect(c.getState()).toBe("thankyou");

    await c.act("reset");
    expect(c.getState()).toBe("idle");
    expect(nameInput.value).toBe("");
    expect(f.capture.teardown).toHaveBeenCalled();
  });
});
