// File System Access — the booth's PRIMARY durable copy on local disk (§6),
// independent of browser cache and network. Structural interfaces keep the
// write path testable with fakes; real handles come from showDirectoryPicker().

export interface WritableLike {
  write(data: Blob | BufferSource): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}
export interface DirHandleLike {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
}

export function isFsaSupported(): boolean {
  return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

/** Prompt the attendant to choose the save folder (booth setup). */
export async function pickSaveDirectory(): Promise<DirHandleLike> {
  const picker = (globalThis as {
    showDirectoryPicker?: (opts?: unknown) => Promise<DirHandleLike>;
  }).showDirectoryPicker;
  if (!picker) throw new Error("File System Access not supported");
  return picker({ id: "memory-booth", mode: "readwrite" });
}

/** Write one recording to disk under `<id>.<ext>`. Returns the filename. */
export async function writeRecordingToDisk(
  dir: DirHandleLike,
  id: string,
  ext: string,
  blob: Blob
): Promise<string> {
  const name = `${id}.${ext}`;
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close(); // close even if write throws, to flush/cleanup
  }
  return name;
}
