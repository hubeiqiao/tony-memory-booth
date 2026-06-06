import type { Mode } from "../types";
import { splitIntoParts } from "./parts";
import { sha256Hex } from "./checksum";
import { withRetry, type RetryOptions } from "./retry";

// Resilient uploader (§6). The server mints the key; the client supplies an
// idempotency token (the recording's ULID). Parts are fixed-size, each
// checksummed; the whole object is checksummed on completion. Already-received
// parts are skipped, so an interrupted upload resumes instead of restarting.

export interface UploadRequest {
  id: string; // client ULID — idempotency token
  ext: string;
  mode: Mode;
  mimeType: string;
  sizeBytes: number;
  token: string; // upload token from /api/upload-token
}

export interface CreatedSession {
  id: string;
  key: string; // server-minted, non-overwriting
  partSize: number; // server decides the part size
  receivedParts: number[]; // for resume/idempotency
}

export interface PartManifestEntry {
  n: number;
  size: number;
  sha256: string;
}

export interface CompleteManifest {
  totalSize: number;
  sha256: string;
  parts: PartManifestEntry[];
}

export interface UploadTransport {
  createSession(req: UploadRequest): Promise<CreatedSession>;
  putPart(id: string, n: number, body: Blob, sha256: string): Promise<void>;
  complete(id: string, manifest: CompleteManifest): Promise<void>;
}

export interface Progress {
  uploadedBytes: number;
  totalBytes: number;
  part: number;
  parts: number;
}

export interface UploaderDeps {
  transport: UploadTransport;
  hash?: (b: Blob) => Promise<string>;
  retry?: Partial<RetryOptions>;
  onProgress?: (p: Progress) => void;
}

export interface UploadResult {
  key: string;
  parts: number;
  bytes: number;
}

export class Uploader {
  private deps: UploaderDeps;
  constructor(deps: UploaderDeps) {
    this.deps = deps;
  }

  async upload(blob: Blob, req: UploadRequest): Promise<UploadResult> {
    const hash = this.deps.hash ?? sha256Hex;
    const retry: RetryOptions = {
      retries: 4,
      baseMs: 400,
      maxMs: 15_000,
      ...this.deps.retry,
    };

    const session = await this.deps.transport.createSession(req);
    const parts = splitIntoParts(blob, session.partSize);
    const received = new Set(session.receivedParts);
    const manifest: PartManifestEntry[] = [];
    let uploaded = 0;

    for (const part of parts) {
      const sha = await hash(part.blob);
      manifest.push({ n: part.n, size: part.size, sha256: sha });
      if (received.has(part.n)) {
        // already durably received — skip (resume / idempotent retry)
        uploaded += part.size;
      } else {
        await withRetry(
          () => this.deps.transport.putPart(req.id, part.n, part.blob, sha),
          retry
        );
        uploaded += part.size;
      }
      this.deps.onProgress?.({
        uploadedBytes: uploaded,
        totalBytes: blob.size,
        part: part.n,
        parts: parts.length,
      });
    }

    const whole = await hash(blob);
    await withRetry(
      () =>
        this.deps.transport.complete(req.id, {
          totalSize: blob.size,
          sha256: whole,
          parts: manifest,
        }),
      retry
    );

    return { key: session.key, parts: parts.length, bytes: blob.size };
  }
}
