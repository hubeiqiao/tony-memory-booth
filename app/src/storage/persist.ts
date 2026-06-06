// Durable storage setup (§6): request persistence (so the buffer isn't
// evictable) and pre-flight quota headroom before each recording.

export interface StorageLike {
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

function getStorage(s?: StorageLike): StorageLike | undefined {
  if (s) return s;
  if (typeof navigator !== "undefined" && navigator.storage) {
    return navigator.storage as unknown as StorageLike;
  }
  return undefined;
}

export interface PersistResult {
  supported: boolean;
  persisted: boolean;
}

/** Ask the browser to make storage persistent; report so the attendant knows. */
export async function requestPersistentStorage(s?: StorageLike): Promise<PersistResult> {
  const storage = getStorage(s);
  if (!storage?.persist) return { supported: false, persisted: false };
  try {
    const already = storage.persisted ? await storage.persisted() : false;
    const persisted = already || (await storage.persist());
    return { supported: true, persisted };
  } catch {
    return { supported: true, persisted: false };
  }
}

export interface Headroom {
  known: boolean;
  freeBytes: number;
  ok: boolean;
}

/** True if there is comfortably more free space than `needBytes`. */
export async function checkHeadroom(needBytes: number, s?: StorageLike): Promise<Headroom> {
  const storage = getStorage(s);
  if (!storage?.estimate) return { known: false, freeBytes: Infinity, ok: true };
  try {
    const { quota = 0, usage = 0 } = await storage.estimate();
    const free = Math.max(0, quota - usage);
    // require 1.5x headroom so we never start a recording we can't finish
    return { known: true, freeBytes: free, ok: free > needBytes * 1.5 };
  } catch {
    return { known: false, freeBytes: Infinity, ok: true };
  }
}

export function isQuotaError(err: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.code === 22)
  );
}
