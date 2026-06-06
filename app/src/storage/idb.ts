import type { RecordingMeta, UploadStatus } from "../types";

// Durable local buffer (§6). Chunks are written incrementally as they arrive so
// a crash loses at most one slice; finalize() assembles the full blob. Records
// are only evicted once they are safely uploaded (and on disk, for booth).

const DB_NAME = "memory-booth";
const DB_VERSION = 1;
const STORE = "recordings";
const CHUNKS = "chunks";

export interface StoredRecording {
  id: string;
  createdAt: number;
  status: UploadStatus;
  sizeBytes: number;
  meta?: RecordingMeta;
  blob?: Blob;
  onDisk?: boolean;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        db.createObjectStore(CHUNKS, { keyPath: ["id", "seq"] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
  });
}

export async function createRecording(
  db: IDBDatabase,
  id: string,
  createdAt: number
): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ id, createdAt, status: "buffered", sizeBytes: 0 } as StoredRecording);
  await txDone(tx);
}

export async function appendChunk(
  db: IDBDatabase,
  id: string,
  seq: number,
  blob: Blob
): Promise<void> {
  const tx = db.transaction(CHUNKS, "readwrite");
  tx.objectStore(CHUNKS).put({ id, seq, blob });
  await txDone(tx); // resolves only after the write is durably committed
}

async function assembleChunks(db: IDBDatabase, id: string): Promise<Blob[]> {
  const tx = db.transaction(CHUNKS, "readonly");
  const store = tx.objectStore(CHUNKS);
  const range = IDBKeyRange.bound([id, -Infinity], [id, Infinity]);
  const rows = await promisify(store.getAll(range));
  rows.sort((a: { seq: number }, b: { seq: number }) => a.seq - b.seq);
  return rows.map((r: { blob: Blob }) => r.blob);
}

/** Assemble chunks into the final blob, store it on the record, return it. */
export async function finalizeRecording(
  db: IDBDatabase,
  id: string,
  meta: RecordingMeta,
  mimeType: string
): Promise<Blob> {
  const parts = await assembleChunks(db, id);
  const blob = new Blob(parts, { type: mimeType });
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const existing = (await promisify(store.get(id))) as StoredRecording | undefined;
  store.put({
    ...(existing ?? { id, createdAt: meta.createdAt }),
    id,
    status: "buffered",
    sizeBytes: blob.size,
    meta,
    blob,
  } as StoredRecording);
  await txDone(tx);
  return blob;
}

export async function getRecording(
  db: IDBDatabase,
  id: string
): Promise<StoredRecording | undefined> {
  const tx = db.transaction(STORE, "readonly");
  return (await promisify(tx.objectStore(STORE).get(id))) as StoredRecording | undefined;
}

export async function setStatus(
  db: IDBDatabase,
  id: string,
  status: UploadStatus,
  patch: Partial<StoredRecording> = {}
): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const rec = (await promisify(store.get(id))) as StoredRecording | undefined;
  if (rec) store.put({ ...rec, ...patch, status });
  await txDone(tx);
}

/** Records not yet confirmed uploaded — used for startup recovery (§6). */
export async function listPending(db: IDBDatabase): Promise<StoredRecording[]> {
  const tx = db.transaction(STORE, "readonly");
  const all = (await promisify(tx.objectStore(STORE).getAll())) as StoredRecording[];
  return all.filter((r) => r.status !== "complete");
}

export async function countByStatus(
  db: IDBDatabase
): Promise<Record<UploadStatus, number>> {
  const tx = db.transaction(STORE, "readonly");
  const all = (await promisify(tx.objectStore(STORE).getAll())) as StoredRecording[];
  const out = { buffered: 0, uploading: 0, complete: 0, partial: 0 } as Record<UploadStatus, number>;
  for (const r of all) out[r.status]++;
  return out;
}

/** Evict only when safe (caller enforces on-disk+uploaded for booth). */
export async function deleteRecording(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction([STORE, CHUNKS], "readwrite");
  tx.objectStore(STORE).delete(id);
  const chunks = tx.objectStore(CHUNKS);
  const range = IDBKeyRange.bound([id, -Infinity], [id, Infinity]);
  const keys = await promisify(chunks.getAllKeys(range));
  for (const k of keys) chunks.delete(k as IDBValidKey);
  await txDone(tx);
}
