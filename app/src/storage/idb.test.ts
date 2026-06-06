// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openDB,
  createRecording,
  appendChunk,
  finalizeRecording,
  getRecording,
  setStatus,
  listPending,
  countByStatus,
  deleteRecording,
} from "./idb";
import type { RecordingMeta } from "../types";

function deleteDB(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // proceed; connection already closed
  });
}

const meta = (id: string): RecordingMeta => ({
  id,
  createdAt: 1000,
  mode: "booth",
  durationMs: 8000,
  mimeType: "video/webm",
  ext: "webm",
  sizeBytes: 0,
  consent: { accepted: true, text: "t", version: "v1" },
  appVersion: "0.1.0",
});

let db: IDBDatabase;
beforeEach(async () => {
  await deleteDB("memory-booth");
  db = await openDB();
});
afterEach(() => {
  db?.close(); // release the connection so the next delete isn't blocked
});

describe("idb durable buffer", () => {
  it("appends chunks and assembles them in order on finalize", async () => {
    const id = "REC1";
    await createRecording(db, id, 1000);
    await appendChunk(db, id, 0, new Blob([new Uint8Array([1, 2])]));
    await appendChunk(db, id, 2, new Blob([new Uint8Array([5])]));
    await appendChunk(db, id, 1, new Blob([new Uint8Array([3, 4])]));
    const blob = await finalizeRecording(db, id, meta(id), "video/webm");
    expect(blob.size).toBe(5);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect([...buf]).toEqual([1, 2, 3, 4, 5]); // ordered by seq
    const rec = await getRecording(db, id);
    expect(rec?.sizeBytes).toBe(5);
    expect(rec?.status).toBe("buffered");
  });

  it("lists pending and excludes completed", async () => {
    await createRecording(db, "A", 1);
    await createRecording(db, "B", 2);
    await setStatus(db, "B", "complete");
    const pending = await listPending(db);
    expect(pending.map((r) => r.id)).toEqual(["A"]);
  });

  it("counts by status", async () => {
    await createRecording(db, "A", 1);
    await createRecording(db, "B", 2);
    await setStatus(db, "A", "uploading");
    await setStatus(db, "B", "complete");
    const counts = await countByStatus(db);
    expect(counts.uploading).toBe(1);
    expect(counts.complete).toBe(1);
  });

  it("deletes a recording and its chunks", async () => {
    await createRecording(db, "A", 1);
    await appendChunk(db, "A", 0, new Blob([new Uint8Array([9])]));
    await deleteRecording(db, "A");
    expect(await getRecording(db, "A")).toBeUndefined();
    // re-finalize would now assemble nothing
    const blob = await finalizeRecording(db, "A", meta("A"), "video/webm");
    expect(blob.size).toBe(0);
  });
});
