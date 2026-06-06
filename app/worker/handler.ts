import { mintKey, isValidId, safeExt } from "./keys";
import { signToken, verifyToken, type TokenPayload } from "./token";
import type { HandlerEnv, RecordRow } from "./types";
import { sha256Hex } from "../src/upload/checksum";
import { CONFIG } from "../src/config";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "x-content-type-options": "nosniff" },
  });
}

function dirOf(key: string): string {
  return key.replace(/\/video\.[^/]+$/, "");
}

async function bytesOf(req: Request): Promise<Uint8Array> {
  return new Uint8Array(await req.arrayBuffer());
}

async function tokenFrom(
  request: Request,
  body: { token?: string } | null,
  env: HandlerEnv,
  now: number
): Promise<TokenPayload | null> {
  const t = request.headers.get("x-upload-token") ?? body?.token ?? "";
  if (!t) return null;
  return verifyToken(t, env.boothSecret, now);
}

async function listReceivedParts(env: HandlerEnv, dir: string): Promise<number[]> {
  const { objects } = await env.bucket.list({ prefix: `${dir}/parts/` });
  return objects
    .map((o) => Number(o.key.slice(`${dir}/parts/`.length)))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

/**
 * Admin/family endpoints are protected two ways (defence in depth):
 *  - Cloudflare Access in front injects `cf-access-authenticated-user-email`.
 *  - Until Access is configured, an ADMIN_SECRET (header or ?key=) gates entry.
 * If neither is satisfied, deny.
 */
function adminAllowed(request: Request, env: HandlerEnv): boolean {
  if (request.headers.get("cf-access-authenticated-user-email")) return true;
  if (env.adminSecret) {
    const key =
      request.headers.get("x-admin-key") ?? new URL(request.url).searchParams.get("key");
    if (key && key === env.adminSecret) return true;
  }
  return false;
}

export async function handleRequest(request: Request, env: HandlerEnv): Promise<Response> {
  const now = env.now?.() ?? Date.now();
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // ---- health ----
  if (path === "/healthz" && method === "GET") {
    return json({ ok: true, time: now });
  }

  // ---- upload token (the abuse gate) ----
  if (path === "/api/upload-token" && method === "POST") {
    const body = (await request.json().catch(() => null)) as
      | { mode?: string; boothSecret?: string; turnstileToken?: string }
      | null;
    const mode = body?.mode === "booth" ? "booth" : "phone";
    if (mode === "booth") {
      if (!body?.boothSecret || body.boothSecret !== env.boothSecret) {
        return json({ error: "unauthorized" }, 401);
      }
    } else {
      // phone: verify Turnstile server-side (skipped only when explicitly disabled)
      if (!env.turnstileDisabled) {
        const token = body?.turnstileToken ?? "";
        const ok = token && env.verifyTurnstile ? await env.verifyTurnstile(token) : false;
        if (!ok) return json({ error: "challenge_required" }, 401);
      }
    }
    const token = await signToken(
      { mode, exp: now + TOKEN_TTL_MS, nonce: crypto.randomUUID() },
      env.boothSecret
    );
    return json({ token, expiresIn: TOKEN_TTL_MS });
  }

  // ---- create upload session (server mints the key) ----
  if (path === "/api/recordings" && method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      ext?: string;
      mode?: string;
      mimeType?: string;
      sizeBytes?: number;
      token?: string;
    } | null;
    if (!(await tokenFrom(request, body, env, now))) return json({ error: "unauthorized" }, 401);
    if (!body?.id || !isValidId(body.id)) return json({ error: "invalid id" }, 400);
    let ext: string;
    try {
      ext = safeExt(body.ext ?? "");
    } catch {
      return json({ error: "disallowed type" }, 415);
    }
    const size = Number(body.sizeBytes ?? 0);
    if (!(size > 0) || size > env.maxBytes) return json({ error: "size out of range" }, 413);

    const existing = await env.index.get(body.id);
    if (existing && existing.status === "complete") {
      // server-minted, non-overwriting: never clobber a finished recording
      return json({ error: "already exists" }, 409);
    }
    const key = mintKey(body.id, ext, new Date(now)).video;
    if (!existing) {
      const row: RecordRow = {
        id: body.id,
        key,
        receivedAt: now,
        createdAt: now,
        mode: body.mode === "phone" ? "phone" : "booth",
        durationMs: 0,
        mimeType: String(body.mimeType ?? `video/${ext}`),
        ext,
        sizeBytes: size,
        status: "uploading",
        hasContact: 0,
        consentVer: "",
      };
      await env.index.upsert(row);
    }
    const dir = dirOf(key);
    const receivedParts = await listReceivedParts(env, dir);
    return json({ id: body.id, key, partSize: CONFIG.partSize, receivedParts });
  }

  // ---- upload a part (staged; per-part integrity) ----
  const partMatch = path.match(/^\/api\/recordings\/([^/]+)\/parts\/(\d+)$/);
  if (partMatch && method === "PUT") {
    const id = partMatch[1];
    const n = Number(partMatch[2]);
    if (!(await tokenFrom(request, null, env, now))) return json({ error: "unauthorized" }, 401);
    if (!isValidId(id)) return json({ error: "invalid id" }, 400);
    const row = await env.index.get(id);
    if (!row) return json({ error: "no session" }, 404);
    if (row.status === "complete") return json({ error: "already exists" }, 409);
    const bytes = await bytesOf(request);
    if (bytes.byteLength === 0 || bytes.byteLength > env.maxBytes) {
      return json({ error: "bad part size" }, 413);
    }
    const sha = await sha256Hex(bytes);
    const claimed = request.headers.get("x-sha256");
    if (claimed && claimed !== sha) return json({ error: "checksum mismatch" }, 422);
    await env.bucket.put(`${dirOf(row.key)}/parts/${n}`, bytes);
    return json({ ok: true, n, sha256: sha });
  }

  // ---- complete (verify each part + whole object) ----
  const completeMatch = path.match(/^\/api\/recordings\/([^/]+)\/complete$/);
  if (completeMatch && method === "POST") {
    const id = completeMatch[1];
    const body = (await request.json().catch(() => null)) as {
      totalSize?: number;
      sha256?: string;
      parts?: { n: number; size: number; sha256: string }[];
      token?: string;
    } | null;
    if (!(await tokenFrom(request, body, env, now))) return json({ error: "unauthorized" }, 401);
    const row = await env.index.get(id);
    if (!row) return json({ error: "no session" }, 404);
    const manifest = (body?.parts ?? []).slice().sort((a, b) => a.n - b.n);
    if (manifest.length === 0) return json({ error: "no parts" }, 400);

    const staged = await listReceivedParts(env, dirOf(row.key));
    if (staged.length !== manifest.length) {
      await env.index.setStatus(id, "partial");
      return json({ error: "missing parts", staged, expected: manifest.length }, 409);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (const part of manifest) {
      const obj = await env.bucket.get(`${dirOf(row.key)}/parts/${part.n}`);
      if (!obj) {
        await env.index.setStatus(id, "partial");
        return json({ error: `missing part ${part.n}` }, 409);
      }
      const buf = new Uint8Array(await obj.arrayBuffer());
      if (buf.byteLength !== part.size || (await sha256Hex(buf)) !== part.sha256) {
        await env.index.setStatus(id, "partial");
        return json({ error: `corrupt part ${part.n}` }, 422);
      }
      chunks.push(buf);
      total += buf.byteLength;
    }

    const assembled = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      assembled.set(c, off);
      off += c.byteLength;
    }
    if (total !== Number(body?.totalSize) || (await sha256Hex(assembled)) !== body?.sha256) {
      await env.index.setStatus(id, "partial");
      return json({ error: "integrity check failed" }, 422);
    }

    await env.bucket.put(row.key, assembled);
    for (const n of staged) await env.bucket.delete(`${dirOf(row.key)}/parts/${n}`);
    await env.index.setStatus(id, "complete", { sizeBytes: total });
    return json({ ok: true, key: row.key, sizeBytes: total });
  }

  // ---- metadata + optional contact ----
  const metaMatch = path.match(/^\/api\/recordings\/([^/]+)\/meta$/);
  if (metaMatch && method === "POST") {
    const id = metaMatch[1];
    const body = (await request.json().catch(() => null)) as {
      meta?: {
        durationMs?: number;
        mimeType?: string;
        contact?: unknown;
        consent?: { version?: string };
      };
      token?: string;
    } | null;
    if (!(await tokenFrom(request, body, env, now))) return json({ error: "unauthorized" }, 401);
    const row = await env.index.get(id);
    if (!row) return json({ error: "no session" }, 404);
    const meta = body?.meta ?? {};
    if (Number(meta.durationMs ?? 0) > env.maxDurationMs) {
      return json({ error: "too long" }, 413);
    }
    await env.bucket.put(`${dirOf(row.key)}/meta.json`, JSON.stringify({ ...meta, id, receivedAt: row.receivedAt }));
    await env.index.setStatus(id, row.status, {
      durationMs: Number(meta.durationMs ?? row.durationMs),
      mimeType: String(meta.mimeType ?? row.mimeType),
      hasContact: meta.contact ? 1 : 0,
      consentVer: String(meta.consent?.version ?? row.consentVer),
    });
    return json({ ok: true });
  }

  // ---- admin: list (behind Cloudflare Access in prod) ----
  if (path === "/api/admin/recordings" && method === "GET") {
    if (!adminAllowed(request, env)) return json({ error: "unauthorized" }, 401);
    const recordings = await env.index.list();
    return json({ recordings });
  }

  // ---- admin: download (XSS-safe: never serve guest media inline) ----
  const dlMatch = path.match(/^\/api\/admin\/recordings\/([^/]+)\/download$/);
  if (dlMatch && method === "GET") {
    if (!adminAllowed(request, env)) return json({ error: "unauthorized" }, 401);
    const row = await env.index.get(dlMatch[1]);
    if (!row) return json({ error: "not found" }, 404);
    const obj = await env.bucket.get(row.key);
    if (!obj) return json({ error: "no object" }, 404);
    const buf = await obj.arrayBuffer();
    return new Response(buf, {
      headers: {
        "content-type": "application/octet-stream", // not the guest-declared type
        "content-disposition": `attachment; filename="${row.id}.${row.ext}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    });
  }

  // ---- static asset fallback ----
  if (env.assets) return env.assets.fetch(request);
  return json({ error: "not found" }, 404);
}
