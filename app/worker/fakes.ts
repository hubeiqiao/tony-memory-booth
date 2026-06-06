import type { BucketLike, IndexLike, RecordRow, StoredObject } from "./types";

// In-memory implementations used by the integration tests (and usable in a
// future local non-Cloudflare run).

export class MemoryBucket implements BucketLike {
  private store = new Map<string, Uint8Array>();

  async put(key: string, value: ArrayBuffer | Uint8Array | string): Promise<void> {
    let bytes: Uint8Array;
    if (typeof value === "string") bytes = new TextEncoder().encode(value);
    else if (value instanceof Uint8Array) bytes = value.slice();
    else bytes = new Uint8Array(value);
    this.store.set(key, bytes);
  }

  async get(key: string): Promise<StoredObject | null> {
    const bytes = this.store.get(key);
    if (!bytes) return null;
    return {
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.slice().buffer,
      text: async () => new TextDecoder().decode(bytes),
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(opts?: { prefix?: string }): Promise<{ objects: { key: string }[] }> {
    const prefix = opts?.prefix ?? "";
    const objects = [...this.store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((key) => ({ key }));
    return { objects };
  }

  /** test helper */
  has(key: string): boolean {
    return this.store.has(key);
  }
  keys(): string[] {
    return [...this.store.keys()];
  }
}

export class MemoryIndex implements IndexLike {
  private rows = new Map<string, RecordRow>();

  async upsert(row: RecordRow): Promise<void> {
    this.rows.set(row.id, { ...row });
  }
  async get(id: string): Promise<RecordRow | null> {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }
  async setStatus(
    id: string,
    status: RecordRow["status"],
    patch: Partial<RecordRow> = {}
  ): Promise<void> {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, ...patch, status });
  }
  async list(): Promise<RecordRow[]> {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }
  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
