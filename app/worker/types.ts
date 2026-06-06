// Dependency-injected interfaces so the request handler is testable with
// in-memory fakes (no workerd needed). worker/index.ts adapts real Cloudflare
// R2 + D1 to these shapes.

export interface StoredObject {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  size: number;
}

/** Minimal subset of the R2 bucket binding we rely on. */
export interface BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array | string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ objects: { key: string }[] }>;
}

export interface RecordRow {
  id: string;
  key: string;
  receivedAt: number; // server clock — authoritative
  createdAt: number;
  mode: string;
  durationMs: number;
  mimeType: string;
  ext: string;
  sizeBytes: number;
  status: "uploading" | "complete" | "partial";
  hasContact: 0 | 1;
  consentVer: string;
}

/** Authoritative index for the family view / reconciliation (D1 in prod). */
export interface IndexLike {
  upsert(row: RecordRow): Promise<void>;
  get(id: string): Promise<RecordRow | null>;
  setStatus(id: string, status: RecordRow["status"], patch?: Partial<RecordRow>): Promise<void>;
  list(): Promise<RecordRow[]>;
}

export interface HandlerEnv {
  bucket: BucketLike;
  index: IndexLike;
  boothSecret: string;
  turnstileDisabled: boolean;
  /** Server-side Turnstile verification (phone). Injected so tests stay offline. */
  verifyTurnstile?: (token: string) => Promise<boolean>;
  /** Stop-gap admin gate until Cloudflare Access is configured. */
  adminSecret?: string;
  maxBytes: number;
  maxDurationMs: number;
  now?: () => number;
  /** Static asset fallback (env.ASSETS.fetch in prod). */
  assets?: { fetch(req: Request): Promise<Response> };
}
