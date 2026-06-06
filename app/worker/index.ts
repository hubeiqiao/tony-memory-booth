/// <reference types="@cloudflare/workers-types" />
import { handleRequest } from "./handler";
import type { BucketLike, IndexLike, RecordRow, StoredObject } from "./types";

// Real Cloudflare bindings (wired in wrangler.toml). This thin adapter maps R2
// + D1 to the dependency-injected interfaces the handler is tested against.
// Not exercised in the unit/integration tests (which use in-memory fakes) — run
// it locally with `npm run worker` (see README).

export interface Env {
  RECORDINGS: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
  BOOTH_SECRET: string;
  TURNSTILE_DISABLED?: string;
  MAX_BYTES?: string;
  MAX_DURATION_MS?: string;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  receivedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  mode TEXT NOT NULL,
  durationMs INTEGER NOT NULL DEFAULT 0,
  mimeType TEXT NOT NULL,
  ext TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  hasContact INTEGER NOT NULL DEFAULT 0,
  consentVer TEXT NOT NULL DEFAULT ''
);`;

function r2Bucket(bucket: R2Bucket): BucketLike {
  return {
    put: async (key, value) => {
      await bucket.put(key, value as ArrayBuffer | Uint8Array | string);
    },
    get: async (key): Promise<StoredObject | null> => {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return {
        size: obj.size,
        arrayBuffer: () => obj.arrayBuffer(),
        text: () => obj.text(),
      };
    },
    delete: (key) => bucket.delete(key),
    list: async (opts) => {
      const res = await bucket.list({ prefix: opts?.prefix });
      return { objects: res.objects.map((o) => ({ key: o.key })) };
    },
  };
}

function d1Index(db: D1Database): IndexLike {
  return {
    upsert: async (row: RecordRow) => {
      await db
        .prepare(
          `INSERT INTO recordings (id,key,receivedAt,createdAt,mode,durationMs,mimeType,ext,sizeBytes,status,hasContact,consentVer)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET key=excluded.key, status=excluded.status`
        )
        .bind(
          row.id, row.key, row.receivedAt, row.createdAt, row.mode, row.durationMs,
          row.mimeType, row.ext, row.sizeBytes, row.status, row.hasContact, row.consentVer
        )
        .run();
    },
    get: async (id) => {
      const r = await db.prepare(`SELECT * FROM recordings WHERE id=?`).bind(id).first();
      return (r as RecordRow | null) ?? null;
    },
    setStatus: async (id, status, patch = {}) => {
      const fields = ["status=?"];
      const vals: unknown[] = [status];
      for (const [k, v] of Object.entries(patch)) {
        fields.push(`${k}=?`);
        vals.push(v);
      }
      vals.push(id);
      await db.prepare(`UPDATE recordings SET ${fields.join(",")} WHERE id=?`).bind(...vals).run();
    },
    list: async () => {
      const res = await db.prepare(`SELECT * FROM recordings ORDER BY receivedAt DESC`).all();
      return (res.results as unknown as RecordRow[]) ?? [];
    },
  };
}

let schemaReady = false;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!schemaReady) {
      // idempotent local bootstrap; production also has a migration file
      await env.DB.exec(SCHEMA.replace(/\n\s*/g, " "));
      schemaReady = true;
    }
    return handleRequest(request, {
      bucket: r2Bucket(env.RECORDINGS),
      index: d1Index(env.DB),
      boothSecret: env.BOOTH_SECRET,
      turnstileDisabled: env.TURNSTILE_DISABLED === "1",
      maxBytes: Number(env.MAX_BYTES ?? 157286400),
      maxDurationMs: Number(env.MAX_DURATION_MS ?? 150000),
      assets: env.ASSETS,
    });
  },
};
