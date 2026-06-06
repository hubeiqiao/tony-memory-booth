import { describe, it, expect, vi } from "vitest";
import { requestPersistentStorage, checkHeadroom } from "./persist";
import { writeRecordingToDisk, type DirHandleLike, type WritableLike } from "./fsa";
import { isSaved, savedLabel, hasPendingRisk } from "./saved";

describe("persist", () => {
  it("reports unsupported when no storage manager", async () => {
    const r = await requestPersistentStorage({});
    expect(r).toEqual({ supported: false, persisted: false });
  });

  it("returns persisted when already persisted", async () => {
    const r = await requestPersistentStorage({
      persisted: async () => true,
      persist: async () => false,
    });
    expect(r).toEqual({ supported: true, persisted: true });
  });

  it("calls persist when not already persisted", async () => {
    const persist = vi.fn(async () => true);
    const r = await requestPersistentStorage({ persisted: async () => false, persist });
    expect(persist).toHaveBeenCalled();
    expect(r.persisted).toBe(true);
  });
});

describe("checkHeadroom", () => {
  it("ok when free space comfortably exceeds need", async () => {
    const h = await checkHeadroom(100, { estimate: async () => ({ quota: 1000, usage: 100 }) });
    expect(h.ok).toBe(true);
    expect(h.freeBytes).toBe(900);
  });
  it("not ok when free space is tight", async () => {
    const h = await checkHeadroom(800, { estimate: async () => ({ quota: 1000, usage: 100 }) });
    expect(h.ok).toBe(false);
  });
  it("permissive when estimate unsupported", async () => {
    const h = await checkHeadroom(100, {});
    expect(h.ok).toBe(true);
    expect(h.known).toBe(false);
  });
});

describe("fsa disk write", () => {
  it("writes and closes, returns filename", async () => {
    const writes: Blob[] = [];
    let closed = false;
    const writable: WritableLike = {
      write: async (d) => void writes.push(d as Blob),
      close: async () => void (closed = true),
    };
    const dir: DirHandleLike = {
      getFileHandle: async (_n, _o) => ({ createWritable: async () => writable }),
    };
    const name = await writeRecordingToDisk(dir, "REC1", "webm", new Blob([new Uint8Array(4)]));
    expect(name).toBe("REC1.webm");
    expect(writes).toHaveLength(1);
    expect(closed).toBe(true);
  });

  it("closes even if write fails", async () => {
    let closed = false;
    const dir: DirHandleLike = {
      getFileHandle: async () => ({
        createWritable: async (): Promise<WritableLike> => ({
          write: async () => {
            throw new Error("disk full");
          },
          close: async () => void (closed = true),
        }),
      }),
    };
    await expect(writeRecordingToDisk(dir, "X", "mp4", new Blob([]))).rejects.toThrow("disk full");
    expect(closed).toBe(true);
  });
});

describe("saved semantics", () => {
  it("booth: saved only when idb AND disk done (not gated on upload)", () => {
    expect(isSaved("booth", { idbDone: true, diskDone: true, uploadDone: false })).toBe(true);
    expect(isSaved("booth", { idbDone: true, diskDone: false, uploadDone: true })).toBe(false);
  });
  it("phone: saved only when upload done", () => {
    expect(isSaved("phone", { idbDone: true, diskDone: false, uploadDone: true })).toBe(true);
    expect(isSaved("phone", { idbDone: true, diskDone: false, uploadDone: false })).toBe(false);
  });
  it("phone has pending risk until uploaded", () => {
    expect(hasPendingRisk("phone", { idbDone: true, diskDone: false, uploadDone: false })).toBe(true);
    expect(hasPendingRisk("phone", { idbDone: true, diskDone: false, uploadDone: true })).toBe(false);
    expect(hasPendingRisk("booth", { idbDone: true, diskDone: true, uploadDone: false })).toBe(false);
  });
  it("labels are warm, not transactional", () => {
    expect(savedLabel("booth", { idbDone: true, diskDone: true, uploadDone: false })).toMatch(/thank you/i);
    expect(savedLabel("phone", { idbDone: true, diskDone: false, uploadDone: false })).toMatch(/sending/i);
  });
});
