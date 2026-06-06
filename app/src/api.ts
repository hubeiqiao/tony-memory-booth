import type { Mode, RecordingMeta } from "./types";
import {
  Uploader,
  type UploadTransport,
  type UploadRequest,
  type CreatedSession,
  type CompleteManifest,
} from "./upload/uploader";
import type { UploadService } from "./ui/controller";
import { getTurnstileToken } from "./turnstile";

// Client transport for the Worker API (§8). Token acquisition: booth uses a
// server secret entered at setup (?key= / sessionStorage); phone uses Turnstile
// (disabled locally). The token gates create/part/complete/meta.

async function getToken(mode: Mode): Promise<string> {
  const boothSecret =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("boothSecret") ?? "" : "";
  const res = await fetch("/api/upload-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      mode === "booth" ? { mode, boothSecret } : { mode, turnstileToken: getTurnstileToken() }
    ),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

class HttpTransport implements UploadTransport {
  constructor(private token: string) {}
  async createSession(req: UploadRequest): Promise<CreatedSession> {
    const res = await fetch("/api/recordings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...req, token: this.token }),
    });
    if (!res.ok) throw new Error(`createSession ${res.status}`);
    return (await res.json()) as CreatedSession;
  }
  async putPart(id: string, n: number, body: Blob, sha256: string): Promise<void> {
    const res = await fetch(`/api/recordings/${id}/parts/${n}`, {
      method: "PUT",
      headers: { "x-upload-token": this.token, "x-sha256": sha256 },
      body,
    });
    if (!res.ok) throw new Error(`putPart ${res.status}`);
  }
  async complete(id: string, manifest: CompleteManifest): Promise<void> {
    const res = await fetch(`/api/recordings/${id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...manifest, token: this.token }),
    });
    if (!res.ok) throw new Error(`complete ${res.status}`);
  }
  async putMeta(id: string, meta: RecordingMeta): Promise<void> {
    await fetch(`/api/recordings/${id}/meta`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meta, token: this.token }),
    });
  }
}

export function createUploadService(mode: Mode): UploadService {
  return {
    async upload(blob: Blob, meta: RecordingMeta): Promise<void> {
      const token = await getToken(mode);
      const transport = new HttpTransport(token);
      const uploader = new Uploader({ transport });
      await uploader.upload(blob, {
        id: meta.id,
        ext: meta.ext,
        mode,
        mimeType: meta.mimeType,
        sizeBytes: meta.sizeBytes,
        token,
      });
      await transport.putMeta(meta.id, meta);
    },
  };
}
