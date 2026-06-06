// Crockford base32 ULID — lexicographically sortable, URL-safe, no ambiguous
// chars. Time + randomness are injectable so the generator is deterministic in
// tests.
const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U
const TIME_LEN = 10;
const RAND_LEN = 16;

export function encodeTime(now: number, len: number = TIME_LEN): string {
  if (!Number.isFinite(now) || now < 0) throw new Error("invalid time");
  let out = "";
  let t = Math.floor(now);
  for (let i = 0; i < len; i++) {
    out = ENC[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

export function encodeRandom(
  rnd: () => number = Math.random,
  len: number = RAND_LEN
): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ENC[Math.floor(rnd() * 32) % 32];
  }
  return out;
}

export function ulid(now: number = Date.now(), rnd: () => number = Math.random): string {
  return encodeTime(now) + encodeRandom(rnd);
}

const ULID_RE = new RegExp(`^[${ENC}]{${TIME_LEN + RAND_LEN}}$`);
export function isUlid(s: string): boolean {
  return ULID_RE.test(s);
}
