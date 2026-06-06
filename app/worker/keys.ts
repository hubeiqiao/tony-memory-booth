// Server-authoritative object keys (§6/§7). The Worker mints namespaced keys;
// clients never choose the final key. IDs and extensions are validated to
// prevent path traversal and to keep the mime allow-list server-side.

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const ALLOWED_EXT = ["mp4", "webm"] as const;
export type AllowedExt = (typeof ALLOWED_EXT)[number];

export function isValidId(id: string): boolean {
  return ULID_RE.test(id);
}

export function safeExt(ext: string): AllowedExt {
  const e = ext.toLowerCase().replace(/^\./, "");
  if ((ALLOWED_EXT as readonly string[]).includes(e)) return e as AllowedExt;
  throw new Error(`disallowed extension: ${ext}`);
}

export function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export interface MintedKey {
  dir: string;
  video: string;
  meta: string;
}

export function mintKey(id: string, ext: string, now: Date = new Date()): MintedKey {
  if (!isValidId(id)) throw new Error("invalid recording id");
  const e = safeExt(ext);
  const dir = `recordings/${yyyymmdd(now)}/${id}`;
  return { dir, video: `${dir}/video.${e}`, meta: `${dir}/meta.json` };
}
