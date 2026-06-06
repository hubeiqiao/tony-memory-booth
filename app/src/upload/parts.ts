// Split a blob into fixed-size parts (>= 5 MiB each per §6). Part numbers are
// 1-based to match S3/R2 multipart conventions.

export interface Part {
  n: number;
  blob: Blob;
  size: number;
}

export function splitIntoParts(blob: Blob, partSize: number): Part[] {
  if (partSize <= 0) throw new Error("partSize must be > 0");
  const parts: Part[] = [];
  let n = 1;
  for (let off = 0; off < blob.size; off += partSize) {
    const slice = blob.slice(off, Math.min(off + partSize, blob.size));
    parts.push({ n, blob: slice, size: slice.size });
    n++;
  }
  return parts;
}
