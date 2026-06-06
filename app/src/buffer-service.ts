import type { Mode, RecordingMeta } from "./types";
import {
  openDB,
  createRecording,
  appendChunk,
  finalizeRecording,
  setStatus,
} from "./storage/idb";
import { isFsaSupported, pickSaveDirectory, writeRecordingToDisk, type DirHandleLike } from "./storage/fsa";
import type { BufferService } from "./ui/controller";

// Browser wiring for durable local storage. Booth keeps a real file on disk via
// File System Access (the primary copy); the directory is chosen on first save
// (a user gesture), then reused.
class IdbBuffer implements BufferService {
  private db: IDBDatabase | null = null;
  private dir: DirHandleLike | null = null;
  constructor(private mode: Mode) {}

  private async ready(): Promise<IDBDatabase> {
    if (!this.db) this.db = await openDB();
    return this.db;
  }

  async begin(id: string, createdAt: number): Promise<void> {
    await createRecording(await this.ready(), id, createdAt);
  }

  async append(id: string, seq: number, blob: Blob): Promise<void> {
    await appendChunk(await this.ready(), id, seq, blob);
  }

  async finalize(id: string, meta: RecordingMeta, mime: string): Promise<Blob> {
    return finalizeRecording(await this.ready(), id, meta, mime);
  }

  async saveToDisk(id: string, ext: string, blob: Blob): Promise<boolean> {
    if (this.mode !== "booth" || !isFsaSupported()) return false;
    try {
      if (!this.dir) this.dir = await pickSaveDirectory();
      await writeRecordingToDisk(this.dir, id, ext, blob);
      return true;
    } catch {
      return false; // attendant cancelled / unsupported → controller keeps ✓ honest
    }
  }

  async markComplete(id: string): Promise<void> {
    await setStatus(await this.ready(), id, "complete");
  }
}

export function createBufferService(mode: Mode): BufferService {
  return new IdbBuffer(mode);
}
