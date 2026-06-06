import { describe, it, expect, vi } from "vitest";
import {
  Uploader,
  type UploadTransport,
  type CreatedSession,
  type CompleteManifest,
  type UploadRequest,
} from "./uploader";
import { sha256Hex } from "./checksum";

const req: UploadRequest = {
  id: "01HZ0000000000000000000000",
  ext: "webm",
  mode: "phone",
  mimeType: "video/webm",
  sizeBytes: 25,
  token: "tkn",
};

function fakeTransport(session: Partial<CreatedSession> = {}) {
  const putCalls: number[] = [];
  let completed: CompleteManifest | null = null;
  const transport: UploadTransport = {
    createSession: vi.fn(async (): Promise<CreatedSession> => ({
      id: req.id,
      key: `recordings/20260621/${req.id}/video.webm`,
      partSize: 10,
      receivedParts: [],
      ...session,
    })),
    putPart: vi.fn(async (_id, n) => void putCalls.push(n)),
    complete: vi.fn(async (_id, m) => void (completed = m)),
  };
  return { transport, putCalls, getCompleted: () => completed };
}

describe("Uploader", () => {
  it("uploads all parts and sends an integrity manifest", async () => {
    const { transport, putCalls, getCompleted } = fakeTransport();
    const onProgress = vi.fn();
    const blob = new Blob([new Uint8Array(25)]);
    const u = new Uploader({ transport, onProgress });
    const res = await u.upload(blob, req);

    expect(res.key).toContain(req.id);
    expect(res.parts).toBe(3);
    expect(putCalls).toEqual([1, 2, 3]);

    const m = getCompleted()!;
    expect(m.totalSize).toBe(25);
    expect(m.parts.map((p) => p.size)).toEqual([10, 10, 5]);
    expect(m.sha256).toBe(await sha256Hex(blob));
    // per-part checksums present and correct length
    expect(m.parts.every((p) => /^[0-9a-f]{64}$/.test(p.sha256))).toBe(true);

    // progress reported per part, ending at full size
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ uploadedBytes: 25, totalBytes: 25, parts: 3 })
    );
  });

  it("resumes: skips parts the server already received", async () => {
    const { transport, putCalls } = fakeTransport({ receivedParts: [1, 2] });
    const u = new Uploader({ transport });
    await u.upload(new Blob([new Uint8Array(25)]), req);
    expect(putCalls).toEqual([3]); // only the missing part is uploaded
  });

  it("retries a transient part failure (idempotent)", async () => {
    const { transport } = fakeTransport();
    let n2 = 0;
    (transport.putPart as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id: string, n: number) => {
        if (n === 2 && ++n2 < 2) throw new Error("network blip");
      }
    );
    const u = new Uploader({ transport, retry: { baseMs: 1, sleep: async () => {} } });
    const res = await u.upload(new Blob([new Uint8Array(25)]), req);
    expect(res.parts).toBe(3);
    expect(n2).toBe(2); // part 2 was retried once
  });

  it("propagates failure if a part never succeeds", async () => {
    const { transport } = fakeTransport();
    (transport.putPart as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("down")
    );
    const u = new Uploader({ transport, retry: { retries: 2, baseMs: 1, sleep: async () => {} } });
    await expect(u.upload(new Blob([new Uint8Array(25)]), req)).rejects.toThrow("down");
  });
});
