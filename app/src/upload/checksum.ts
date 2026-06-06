// Integrity checksums via Web Crypto (available in browsers and Node 20+/22+).
// Used to verify each multipart part and the whole object end-to-end (§6).

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256Hex(
  data: ArrayBuffer | Uint8Array | Blob
): Promise<string> {
  let buf: ArrayBuffer;
  if (data instanceof Blob) {
    buf = await data.arrayBuffer();
  } else if (data instanceof Uint8Array) {
    // copy into a tightly-sized ArrayBuffer
    buf = data.slice().buffer;
  } else {
    buf = data;
  }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return toHex(digest);
}
