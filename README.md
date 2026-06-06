# Tony Memory Booth

A calm, candlelit web app where guests record a short video message for the
family of **Dr. Tony Bailetti (1948–2026)** — at the **celebration of his life**,
and for anyone who wants to add a memory afterward.

*For Tony — and for the family who keeps him.*

**Live:** https://tony-memory.hubeiqiao.com · **In memoriam:**
https://sprott.carleton.ca/2026/in-memoriam-tony-bailetti/

> "Share a memory of Tony." — a few words for his family. Take your time; speak
> from the heart.

---

## What it is

Tony led Carleton's Technology Innovation Management program for three decades
and mentored hundreds of founders. This booth lets the people he touched leave
him — and his family — a short, heartfelt video message.

It runs two ways from one app:

- **Booth** — a staffed laptop at the convocation. Opened with a setup key,
  it keeps a primary copy of every recording on local disk so nothing depends on
  venue Wi-Fi.
- **Phone / QR** — guests scan a code (or visit the link) and record from their
  own phone, during the event or later from home.

The guest flow is deliberately gentle: a warm welcome with his portrait → a
preview with quiet prompts ("how you met him, a moment he believed in you,
something he taught you") → record → review → optional contact details → a
simple thank-you.

## Principles

- **Never lose a recording.** Chunks are written to IndexedDB as they arrive; the
  booth also writes a real file to disk; uploads are resumable and
  integrity-checked. "✓ saved" is never shown unless the message is truly safe.
- **Works without good Wi-Fi.** Offline-first capture; uploads drain in the
  background.
- **Private by default.** Recordings live in a private store and are visible only
  to the family, behind Cloudflare Access.
- **Dignified and simple.** Designed for an older, non-technical crowd — large
  targets, warm language, no rush, reduced-motion support.

## For the family

A private gallery at **`/admin`** (Cloudflare Access — email sign-in) lists every
message with inline playback, the sender's name and contact details (for
thank-yous), download-all, a contacts CSV, and a remove/takedown control.

## How it's built

- **Frontend:** Vanilla TypeScript + Vite SPA. Self-hosted Newsreader +
  Instrument Sans; warm near-black palette with a single red accent and a
  grayscale portrait — cohesive with the memorial site.
- **Capture:** `getUserMedia` + `MediaRecorder` with codec detection (mp4 on
  Safari/iOS, webm elsewhere), timeslice chunking, capture-time sanity checks.
- **Durability:** IndexedDB buffer, persisted storage + quota pre-flight, File
  System Access disk copy (booth).
- **Uploader:** resumable, fixed-part multipart with per-part + whole-object
  SHA-256 verification, idempotency, and retry/backoff.
- **Backend:** a single **Cloudflare Worker** serving the app + API, **R2** for
  video, **D1** for the index, server-minted non-overwriting keys, HMAC upload
  tokens, and XSS-safe media serving.
- **Auth:** Cloudflare Access (family emails) on `/admin`; Turnstile-ready phone
  path; booth server secret.
- **Deploy:** Git-connected **Cloudflare Workers Builds** — push to `main`
  builds and deploys.

See [`Implementation-Plan.md`](Implementation-Plan.md) and
[`Design-Direction.md`](Design-Direction.md) for the engineering plan and visual
direction, and [`Memory-Booth-Plan.md`](Memory-Booth-Plan.md) for the original
proposal.

## Develop

```bash
cd app
npm install
npm run dev      # SPA (add ?mode=phone for the phone theme)
npm run worker   # local Worker + R2 + D1 (wrangler dev)
npm test         # ~100 unit + integration tests
npm run build    # production build
```

## Repository layout

```
Memory-Booth-Plan.md      Non-technical proposal + wireframes
Implementation-Plan.md    Audited engineering plan
Design-Direction.md       Visual & emotional design direction
app/                      The application (Vite + TS SPA + Cloudflare Worker)
  src/                    capture · storage · upload · state · ui · styles
  worker/                 handler, keys, token, R2/D1 adapters
  public/admin/           the family view
```

---

*Built with care, in memory of a teacher who took people seriously before it was
obvious to anyone else.*
