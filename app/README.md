# Memory Booth — app

A calm, candlelit recording booth for the celebration of Professor Tony
Bailetti's life. Guests record a short video message for his family — at a
staffed **booth** (laptop) or from their **phone** via QR.

Built per [`../Implementation-Plan.md`](../Implementation-Plan.md) and
[`../Design-Direction.md`](../Design-Direction.md). This is the **local**
version: a Vite + TypeScript SPA plus a Cloudflare Worker backend that runs
locally. No cloud deploy here.

## Quick start

```bash
npm install
npm run dev        # SPA on http://localhost:5173  (booth mode)
# add ?mode=phone for the phone/paper theme
```

The SPA proxies `/api` and `/healthz` to a local Worker. To run the backend too:

```bash
npm run worker     # Worker on http://localhost:8787 (R2 + D1 emulated locally)
```

Then open the SPA; recordings upload to the local Worker, stored in a local R2
bucket and indexed in a local D1 database (under `.wrangler/state`).

> Booth uploads need a setup secret: open `http://localhost:5173/?key=dev-booth-secret-change-me`
> once (it's stored in `sessionStorage` and stripped from the URL). The phone
> path uses Turnstile, which is disabled locally via `TURNSTILE_DISABLED=1`.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server (SPA) |
| `npm run worker` | `wrangler dev` — local Worker + R2 + D1 |
| `npm test` | Run the full unit + integration suite (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build to `dist/` |
| `npm run verify` | typecheck + test + build |

## How it works

- **Capture** (`src/capture/`): `getUserMedia` + `MediaRecorder` with codec
  detection (mp4 for Safari/iOS, webm elsewhere), timeslice chunking, strict
  teardown, audio-level + frame-luma metering for sanity checks.
- **Durability** (`src/storage/`): chunks are written to **IndexedDB** as they
  arrive; `navigator.storage.persist()` + quota pre-flight; the booth also keeps
  a **primary copy on local disk** via the File System Access API.
  - **Honest "✓ saved"**: booth shows ✓ once IndexedDB **and** disk are written;
    phone shows ✓ only after **upload** completes (no local disk copy).
- **Uploader** (`src/upload/`): fixed-part (≥5 MiB) resumable multipart with a
  **per-part + whole-object SHA-256** integrity check, exponential-backoff
  retries, idempotency (the recording ULID), and resume (skips parts the server
  already has).
- **State machine** (`src/state/machine.ts`): `idle → permission → ready →
  countdown → recording → check → review → contact → saving → thankyou`, with
  re-record, attendant reset, and fatal paths.
- **UI** (`src/ui/`): all screens wired to the state machine and injected
  services; booth (candlelight) vs phone (paper) themes; ≥48px targets, amber
  focus ring, `prefers-reduced-motion`, PII cleared on reset.
- **Worker** (`worker/`): server-**mints** non-overwriting object keys, gates
  every write behind an HMAC **upload token** (booth secret / Turnstile),
  enforces size/type/duration caps, verifies integrity, and serves admin
  downloads **XSS-safely** (`octet-stream` + `attachment` + `nosniff`).
  `worker/handler.ts` is dependency-injected (`BucketLike`/`IndexLike`) so it's
  tested with in-memory fakes; `worker/index.ts` adapts real R2 + D1.

## Tests

~94 tests across utilities, state machine, capture, durability, uploader, the
Worker API (full lifecycle), and a jsdom controller walk-through. The Worker is
tested against in-memory R2/D1 fakes, so the suite runs without `workerd`.

```bash
npm test
```

## Layout

```
src/
  capture/   codec, recorder (mockable), level/luma, sanity checks
  storage/   idb buffer, persist/quota, FSA disk, saved semantics
  upload/    checksum, parts, retry, uploader
  state/     machine
  ui/        screens, controller
  styles/    tokens (candlelight + paper), base, screens, self-hosted fonts
  capture-service.ts / buffer-service.ts / api.ts   browser wiring
  main.ts    bootstrap
worker/      handler, token, keys, types, fakes (tests), index (CF entry)
test/        worker integration test
migrations/  D1 schema
```

## Notes / not-yet (deployment)

- Cloudflare **R2 lifecycle** (abort incomplete multipart) + **billing alert**,
  **Cloudflare Access** on `/api/admin/*`, real **Turnstile** keys, and a real
  **booth secret** (`wrangler secret put BOOTH_SECRET`) are configured at deploy
  time — see `../Implementation-Plan.md` §6/§8/§9/§13.
- Fonts are the **latin subset** of Fraunces + Hanken Grotesk, self-hosted in
  `public/fonts/` so the booth works offline.
