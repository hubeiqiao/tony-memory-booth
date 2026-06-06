import { describe, it, expect, beforeEach } from "vitest";
import { handleRequest } from "../worker/handler";
import { MemoryBucket, MemoryIndex } from "../worker/fakes";
import type { HandlerEnv } from "../worker/types";
import { signToken } from "../worker/token";
import { sha256Hex } from "../src/upload/checksum";
import { splitIntoParts } from "../src/upload/parts";
import { CONFIG } from "../src/config";

const SECRET = "test-secret";
const ID = "01HZ0000000000000000000001";

let bucket: MemoryBucket;
let index: MemoryIndex;
let env: HandlerEnv;

beforeEach(() => {
  bucket = new MemoryBucket();
  index = new MemoryIndex();
  env = {
    bucket,
    index,
    boothSecret: SECRET,
    turnstileDisabled: true,
    maxBytes: CONFIG.maxBytes,
    maxDurationMs: CONFIG.maxDurationMs,
    now: () => 1_700_000_000_000,
  };
});

function req(path: string, init?: RequestInit): Request {
  return new Request(`https://booth.local${path}`, init);
}
async function token(mode: "booth" | "phone" = "booth"): Promise<string> {
  return signToken({ mode, exp: env.now!() + 60000, nonce: "n" }, SECRET);
}

// Drive a whole recording through the API the way the client Uploader does.
async function uploadRecording(bytes: Uint8Array, t: string) {
  const blob = new Blob([bytes as unknown as BlobPart]);
  const create = await handleRequest(
    req("/api/recordings", {
      method: "POST",
      body: JSON.stringify({ id: ID, ext: "webm", mode: "phone", mimeType: "video/webm", sizeBytes: bytes.byteLength, token: t }),
    }),
    env
  );
  expect(create.status).toBe(200);
  const session = (await create.json()) as { key: string; partSize: number; receivedParts: number[] };
  const parts = splitIntoParts(blob, session.partSize);
  const manifest = [];
  for (const p of parts) {
    if (!session.receivedParts.includes(p.n)) {
      const buf = new Uint8Array(await p.blob.arrayBuffer());
      const sha = await sha256Hex(buf);
      const r = await handleRequest(
        req(`/api/recordings/${ID}/parts/${p.n}`, {
          method: "PUT",
          headers: { "x-upload-token": t, "x-sha256": sha },
          body: buf,
        }),
        env
      );
      expect(r.status).toBe(200);
    }
    manifest.push({ n: p.n, size: p.size, sha256: await sha256Hex(new Uint8Array(await p.blob.arrayBuffer())) });
  }
  const complete = await handleRequest(
    req(`/api/recordings/${ID}/complete`, {
      method: "POST",
      body: JSON.stringify({ totalSize: bytes.byteLength, sha256: await sha256Hex(bytes), parts: manifest, token: t }),
    }),
    env
  );
  return { complete, session };
}

describe("worker handler", () => {
  it("healthz responds", async () => {
    const r = await handleRequest(req("/healthz"), env);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("booth token requires the secret", async () => {
    const bad = await handleRequest(
      req("/api/upload-token", { method: "POST", body: JSON.stringify({ mode: "booth", boothSecret: "wrong" }) }),
      env
    );
    expect(bad.status).toBe(401);
    const ok = await handleRequest(
      req("/api/upload-token", { method: "POST", body: JSON.stringify({ mode: "booth", boothSecret: SECRET }) }),
      env
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { token: string }).token).toBeTruthy();
  });

  it("rejects create without a valid token", async () => {
    const r = await handleRequest(
      req("/api/recordings", { method: "POST", body: JSON.stringify({ id: ID, ext: "webm", sizeBytes: 10 }) }),
      env
    );
    expect(r.status).toBe(401);
  });

  it("completes a full upload and stores the assembled object", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(25));
    const t = await token("phone");
    const { complete, session } = await uploadRecording(bytes, t);
    expect(complete.status).toBe(200);
    const body = (await complete.json()) as { ok: boolean; sizeBytes: number };
    expect(body.ok).toBe(true);
    expect(body.sizeBytes).toBe(25);
    // assembled object exists; staged parts cleaned up
    expect(bucket.has(session.key)).toBe(true);
    expect(bucket.keys().some((k) => k.includes("/parts/"))).toBe(false);
    // index marked complete
    const row = await index.get(ID);
    expect(row?.status).toBe("complete");
    expect(row?.receivedAt).toBe(env.now!());
  });

  it("server mints the key (client cannot choose it) and rejects overwrites", async () => {
    const t = await token();
    await uploadRecording(crypto.getRandomValues(new Uint8Array(12)), t);
    const row = await index.get(ID);
    expect(row?.key).toMatch(/^recordings\/\d{8}\/01HZ.*\/video\.webm$/);
    // second create for a completed id is refused
    const again = await handleRequest(
      req("/api/recordings", {
        method: "POST",
        body: JSON.stringify({ id: ID, ext: "webm", sizeBytes: 12, token: t }),
      }),
      env
    );
    expect(again.status).toBe(409);
  });

  it("rejects a part whose checksum does not match", async () => {
    const t = await token();
    await handleRequest(
      req("/api/recordings", { method: "POST", body: JSON.stringify({ id: ID, ext: "webm", sizeBytes: 10, token: t }) }),
      env
    );
    const r = await handleRequest(
      req(`/api/recordings/${ID}/parts/1`, {
        method: "PUT",
        headers: { "x-upload-token": t, "x-sha256": "deadbeef" },
        body: new Uint8Array([1, 2, 3]),
      }),
      env
    );
    expect(r.status).toBe(422);
  });

  it("fails completion when the whole-object checksum is wrong", async () => {
    const t = await token();
    await handleRequest(
      req("/api/recordings", { method: "POST", body: JSON.stringify({ id: ID, ext: "webm", sizeBytes: 5, token: t }) }),
      env
    );
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    const sha = await sha256Hex(buf);
    await handleRequest(
      req(`/api/recordings/${ID}/parts/1`, { method: "PUT", headers: { "x-upload-token": t, "x-sha256": sha }, body: buf }),
      env
    );
    const complete = await handleRequest(
      req(`/api/recordings/${ID}/complete`, {
        method: "POST",
        body: JSON.stringify({ totalSize: 5, sha256: "0".repeat(64), parts: [{ n: 1, size: 5, sha256: sha }], token: t }),
      }),
      env
    );
    expect(complete.status).toBe(422);
    expect((await index.get(ID))?.status).toBe("partial");
  });

  it("resumes: a re-create reports already-received parts", async () => {
    const t = await token();
    await handleRequest(
      req("/api/recordings", { method: "POST", body: JSON.stringify({ id: ID, ext: "webm", sizeBytes: 25, token: t }) }),
      env
    );
    const buf = new Uint8Array(10);
    const sha = await sha256Hex(buf);
    await handleRequest(
      req(`/api/recordings/${ID}/parts/1`, { method: "PUT", headers: { "x-upload-token": t, "x-sha256": sha }, body: buf }),
      env
    );
    const recreate = await handleRequest(
      req("/api/recordings", { method: "POST", body: JSON.stringify({ id: ID, ext: "webm", sizeBytes: 25, token: t }) }),
      env
    );
    expect(((await recreate.json()) as { receivedParts: number[] }).receivedParts).toEqual([1]);
  });

  it("admin download is XSS-safe (attachment + nosniff + octet-stream)", async () => {
    const t = await token();
    await uploadRecording(crypto.getRandomValues(new Uint8Array(8)), t);
    const r = await handleRequest(req(`/api/admin/recordings/${ID}/download`), env);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(r.headers.get("content-disposition")).toContain("attachment");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("admin list returns recordings", async () => {
    const t = await token();
    await uploadRecording(crypto.getRandomValues(new Uint8Array(8)), t);
    const r = await handleRequest(req("/api/admin/recordings"), env);
    const body = (await r.json()) as { recordings: { id: string }[] };
    expect(body.recordings.map((x) => x.id)).toContain(ID);
  });

  it("enforces the size cap on create", async () => {
    const t = await token();
    const r = await handleRequest(
      req("/api/recordings", {
        method: "POST",
        body: JSON.stringify({ id: ID, ext: "webm", sizeBytes: env.maxBytes + 1, token: t }),
      }),
      env
    );
    expect(r.status).toBe(413);
  });

  it("rejects disallowed extensions", async () => {
    const t = await token();
    const r = await handleRequest(
      req("/api/recordings", {
        method: "POST",
        body: JSON.stringify({ id: ID, ext: "html", sizeBytes: 10, token: t }),
      }),
      env
    );
    expect(r.status).toBe(415);
  });
});
