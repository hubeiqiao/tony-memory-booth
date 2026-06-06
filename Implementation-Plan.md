# Memory Booth — Implementation & Development Plan (v2, audited)

*Engineering plan for the recording web app. No code yet — this defines what we
build, how, and in what order, so implementation later is fast and low-risk.*

Companion to `Memory-Booth-Plan.md` (the non-technical proposal). This version
incorporates a three-track review (security/privacy, architecture/reliability,
event-readiness/UX); see **Appendix A** for the audit outcome and what changed.

---

## 0. Guiding principles

1. **Never lose a recording.** One-time, irreplaceable event. Every choice
   favors data safety over features or elegance.
2. **Works without good Wi-Fi.** The booth must function fully offline and sync
   later. Network is unreliable by default.
3. **Boringly simple for the guest.** One tap to start, one to stop. Designed
   for an older, non-technical crowd.
4. **Honest UI.** We never tell a guest "saved" unless the recording is durably
   safe by that path's definition (see §6).
5. **Few moving parts.** Fewer dependencies = fewer day-of failure modes.
6. **Private by default. Server-authoritative.** Clients are untrusted; the
   Worker enforces keys, caps, and integrity. Recordings/contacts are visible
   only to the family.

---

## 1. Scope

### In scope (v1 — event-ready by June 21)
- One web app, two run modes: **Booth** (laptop/Chrome) and **Phone** (QR →
  mobile browser).
- Record video+audio, configurable cap (~90–120s), start/stop, review,
  keep/re-record, optional contact details, thank-you, attendant-assisted reset.
- Local-first durable capture + resilient background upload to Cloudflare R2.
- Private storage; a simple family-only review/download view.
- Hosted on **Joe's existing Cloudflare account** under a **temporary URL**
  first; `tonybailetti.com` attached later.

### Out of scope (v1) — possible later
- Public "wall of messages," transcription/captions, trimming/editing, music,
  guest accounts, multi-language UI, analytics dashboards, automated emails.

---

## 2. Architecture overview

```
            BOOTH (laptop, Chrome, fullscreen)        PHONE (QR -> mobile browser)
                          |                                      |
                          v                                      v
              +-----------------------------------------------------------+
              |                Recording Web App (static SPA)             |
              |  getUserMedia + MediaRecorder | state machine | UI        |
              |  IndexedDB durable buffer | resilient uploader            |
              +-----------------------------------------------------------+
                          |                 (HTTPS, same origin)
                          v
              +-----------------------------------------------------------+
              |        Cloudflare Worker  (API + static asset serving)    |
              |  mint key | upload-token | multipart broker | save meta   |
              |  family view (Access) | rate limit | integrity verify     |
              +-----------------------------------------------------------+
                   |                     |                      |
                   v                     v                      v
        +---------------------+  +-----------------+  +------------------------+
        | R2: video blobs     |  | D1: recording   |  | Isolated media-serving |
        | (private)           |  | index + meta    |  | origin (attachment +   |
        |                     |  |                 |  | nosniff, Access-gated) |
        +---------------------+  +-----------------+  +------------------------+

   Booth also writes a PRIMARY local copy to disk (File System Access API)
   + end-of-night USB backup (two drives). R2 is the SECONDARY copy.
```

Single origin for app + API keeps CORS/cookies/Access simple. **Guest media is
served back only from an isolated, Access-gated path** (never inline from the
app origin) — see §9.

---

## 3. Tech stack & rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Vanilla **TypeScript + Vite** | Tiny bundle, no framework runtime risk, fast on cellular |
| Capture | **MediaRecorder** + `getUserMedia` | Native, no libraries |
| Local durability | **IndexedDB** (Blob, persisted) + **File System Access** (booth disk) | Survives crash/close; booth keeps a real file |
| Backend | **Cloudflare Worker** | Same platform Joe uses; serves app + API |
| Object storage | **Cloudflare R2** (S3-compatible) | No egress fees, good for media |
| Index/metadata | **Cloudflare D1** (one row per recording) + `meta.json` in R2 | Fast, reliable listing/reconciliation for the family view (resolves prior open decision) |
| Family gate | **Cloudflare Access (Zero Trust)** | Email-based gate, no auth to build |
| Abuse control | **Turnstile → short-lived upload token** (phone link); server secret for booth; rate limiting | Stops spam without per-guest friction at the booth |
| Deploy | **Wrangler**, Git-connected build | Reuses known-good pipeline |

---

## 4. Core user flow & state machine

States: `IDLE → PERMISSION → READY → COUNTDOWN → RECORDING → CHECK → REVIEW →
(CONTACT optional) → SAVING → THANKYOU → (reset) IDLE`

- **PERMISSION**: request camera+mic once (at booth setup, persisted); friendly
  explainer if denied.
- **COUNTDOWN**: 3·2·1 with live preview.
- **RECORDING**: REC dot + countdown; manual stop; at the cap, a **soft grace**
  ("wrap up") rather than an abrupt cut.
- **CHECK** (new): **capture-time sanity checks** — minimum duration, non-silent
  audio level, non-black video frame. If it fails, prompt re-record. We never
  "save" an empty/broken clip.
- **REVIEW**: local playback; *Keep & Send* or *Re-record* (re-record discards
  the local blob only after explicit confirm).
- **CONTACT** (optional): name / email / phone; prominent **Skip**.
- **SAVING**: durable write first, then upload; the ✓ semantics differ by mode
  (see §6).
- **THANKYOU**: warm message; **clears any contact details from the screen** so
  nothing personal lingers for the next guest. Booth resets under attendant
  control (or after a comfortable timeout); phone shows "record another / done."

Explicit edge transitions: permission denied, no camera/mic, storage full, tab
hidden mid-recording, refresh mid-recording, sub-minimum/empty recording.

---

## 5. Recording subsystem (highest technical risk — plan carefully)

- **Codec/container detection** via `MediaRecorder.isTypeSupported()`, priority:
  - Safari/iOS: `video/mp4` (H.264/AAC).
  - Chrome/Android/desktop: `video/webm;codecs=vp9,opus` or `vp8,opus`.
  - Persist the **actual** mime type in metadata; never assume `.webm`.
- **Constraints**: 720p, `facingMode:"user"`. Note `videoBitsPerSecond` is only a
  **hint** — derive size caps from a **measured worst case** on real devices,
  not the nominal bitrate. Budget up to ~150 MB.
- **iOS Safari** (front-loaded test — see M1): MediaRecorder supported 14.3+ but
  historically quirky; requires HTTPS + user gesture; use `playsinline`+`muted`
  on the preview; handle `visibilitychange`/Low-Power-Mode killing capture.
- **Timeslice**: `recorder.start(timeslice)` so `dataavailable` fires
  periodically → persist chunks incrementally (a crash loses at most one slice).
- **Resource discipline (booth soak)**: on every reset, fully **stop all tracks,
  release the MediaStream, revoke object URLs, and tear down the recorder** to
  prevent leaks across dozens of sessions. Verified by the M4 soak test.
- **Audio**: external mic on booth; echo-cancel/noise-suppress constraints;
  on-screen **input-level meter**.

---

## 6. Reliability & data-safety design (the core promise)

**Durable buffer setup (at app start):**
- Call `navigator.storage.persist()` and **surface to the attendant if denied**
  (so the booth isn't run on evictable storage).
- `storage.estimate()` **pre-flight** before each recording; if headroom is low,
  warn/divert.
- Handle `QuotaExceededError` explicitly with a fallback (flush-to-disk on
  booth; prompt on phone). **Never evict a local copy until it is BOTH on disk
  (booth) and confirmed uploaded.**

**Write-before-confirm ordering:**
1. As chunks arrive, append to an **IndexedDB** record.
2. On stop, finalize the IndexedDB blob (await `tx.complete`).
3. **Booth only**: also write the file to a chosen **local disk folder** (File
   System Access). This is the primary durable copy, independent of network and
   browser cache.
4. Begin **resilient upload** to R2 in the background.
5. Mark the D1/IndexedDB record `uploaded` only after the **server confirms
   integrity** (size + checksum).

**What "✓ saved" means — and it must never be a lie:**
- **Booth**: ✓ appears only after the **IndexedDB transaction *and* the local
  disk write** both complete. Because a real file exists locally, ✓ is **not**
  gated on upload.
- **Phone**: there is **no local disk copy**, so ✓ must wait for **upload
  completion** (IndexedDB is the safety net until then; warn before leaving with
  an upload pending).

**Resilient uploader:**
- **Server-minted, non-overwriting keys.** The Worker mints a namespaced key
  server-side (clients never choose the final key) and **rejects overwrites**,
  so a public/malicious client can't clobber another guest's object. A
  client **idempotency token** collapses retries to one object; server stamps
  `receivedAt`.
- **Multipart upload to R2**, brokered by the Worker. **Fixed part size ≥5 MiB**;
  on completion verify **per-part checksum + size + part count** (do *not* rely
  on the multipart ETag — it isn't a plain content hash). Retry parts with
  exponential backoff.
- An **R2 lifecycle rule aborts incomplete multipart uploads** (24–48h) and a
  **billing alert** guards against runaway cost from abandoned parts.
- A background **upload queue** survives in-app navigation; resumes on startup.

**Booth recovery & backup:**
- On start, scan for un-uploaded recordings and resume.
- **End-of-night ritual**: copy the local folder to **two USB drives**, **verify
  file count against the app's counter**, **spot-play** a couple, and hand off to
  a **named carrier**. Take **interim backups** during the event, not only at the
  end. (Operator checklist in WP-H.)

---

## 7. Storage layout & data model

**R2 object keys (server-minted):**
```
recordings/{yyyymmdd}/{server-id}/video.{ext}
recordings/{yyyymmdd}/{server-id}/meta.json
recordings/{yyyymmdd}/{server-id}/thumb.jpg   # optional, later
```

**D1 index row** (authoritative for listing/reconciliation): `id`, `receivedAt`
(server), `createdAt` (client), `mode`, `durationMs`, `mimeType`, `ext`,
`sizeBytes`, `status` (`uploading|complete|partial`), `hasContact`, `consentVer`.

**meta.json** (in private bucket): the above plus optional
`contact:{name,email,phone}`, `consent:{accepted:true, text, version}`, trimmed
`appVersion`. **No precise IP stored alongside contact**; user-agent is trimmed.

PII note: `contact` is optional, lives only in the private bucket/D1, is **never
logged**, and is covered by the retention/handover/deletion plan (§12).

---

## 8. Backend API (Cloudflare Worker)

Single Worker serves the static app **and** these routes (sketch, not code):

- `POST /api/upload-token` → phone: verify **Turnstile**, return a **short-lived,
  recording-scoped token**. Booth: authenticate via **server-side secret**.
- `POST /api/recordings` → create session: **server mints key**, inits R2
  multipart; requires a valid upload token; applies rate limit + caps.
- `PUT  /api/recordings/:id/parts/:n` → upload a part (token required).
- `POST /api/recordings/:id/complete` → verify size+checksum+part count; write
  D1 `complete`.
- `POST /api/recordings/:id/meta` → save metadata + optional contact (token
  required; **guarded**, not anonymous-writable).
- `GET  /api/admin/recordings` / `/:id/download` → **behind Cloudflare Access**;
  download via **short-TTL per-click signed URLs**.
- `GET  /healthz` → connectivity self-check (no sensitive data; not a write).
- Error beacon endpoint → **guarded + rate-limited**, PII-free payloads only.

All caps (max size, duration, mime allow-list, parts) enforced **server-side**.

---

## 9. Security & privacy

> ⚠️ Uploads originate from the public (guests have no accounts). The surface is
> guarded by **upload tokens**, not just IP heuristics.

- **Recording-scoped upload tokens** are the primary anti-abuse gate (IP rate
  limiting alone is unreliable behind shared venue NAT/Wi-Fi). Phone obtains a
  token via **Turnstile**; the **booth uses a server-side secret** — **no
  bypassable client flag**.
- **Private R2 bucket**, no public read. Downloads only via Access-gated,
  **short-TTL signed URLs**.
- **Serve guest media safely (prevent stored XSS).** Guest uploads are untrusted:
  **validate by magic bytes** (not just declared mime), serve with
  **`Content-Disposition: attachment`** + **`X-Content-Type-Options: nosniff`**
  from an **isolated origin**, apply a strict **CSP**, and never use
  `Access-Control-Allow-Origin: *`.
- **Cloudflare Access** on all `/api/admin/*` and the family view (family emails
  only). Add **CSRF protection before any destructive admin action** (e.g.
  delete).
- **Hard caps** server-side: size, duration, mime allow-list, parts, per-token
  recordings.
- **Consent**: on-screen line ("Your message will be shared with Tony's
  family"); store **consent text + version** with each recording. Scope is
  **family-only**; **re-consent is required before any future public use**.
- **PII minimization/logging**: trim user-agent, define **log retention**,
  **decouple IP from recording id** in any logs; never log contact details.
- **Secrets** via `wrangler secret`; **HTTPS only** (also required by
  getUserMedia).

---

## 10. Booth mode specifics

- **Kiosk/fullscreen** Chrome; disable sleep/screensaver; on mains power.
- **Permissions granted once at setup** and persisted; after a reboot the
  attendant **re-selects the local save folder** (File System Access handles
  don't always survive a restart) — included in the start-of-day checklist.
- **Single large primary button**; **attendant-controlled reset** (so a guest
  isn't rushed and the next person doesn't see prior contact info).
- **Offline-first**: fully operational with no network; uploads queue and drain.
- **Local disk copy is mandatory** in booth mode (§6).
- **Named on-site technical owner + escalation path** for the day.
- **Start-of-day verification ritual** (power, camera, mic level, test
  recording, disk folder selected, persist() granted, counters at zero) and the
  end-of-night backup ritual — both in the attendant guide (WP-H).

---

## 11. Phone / QR mode specifics

- **QR → frozen short URL** → app loads in `phone` mode.
- **Permission pre-prompt** explaining why camera/mic is needed; gentle fallback
  copy if denied.
- **✓ only on upload completion** (no local disk copy); **warn before leaving**
  with a pending upload.
- **Network awareness**: record regardless; upload in background; honest
  progress.
- **Large targets, minimal text**; after-event soft landing for people arriving
  later from home.

---

## 12. Family viewing, handover & lifecycle

- **v1**: Access-gated `/admin` list with playback + **bulk download**.
  **Prove "download all" works** during QA (it's a common late failure).
- **Handover**: produce a single archive of all recordings + a contacts CSV/JSON
  (for thank-yous); deliver to the family securely.
- **PII lifecycle**: documented **retention window**, a **deletion path** in R2 +
  D1 after handover (if the family wishes), and a simple **takedown/moderation**
  path if a recording needs removal.
- **Later**: optional curated tribute wall (out of v1; would require re-consent).

---

## 13. Hosting & deployment

- **Now**: deploy to **Joe's existing Cloudflare account**.
- **Temporary domain**: a `*.workers.dev` URL **or** a subdomain Joe already
  controls (e.g. `booth.<existing-domain>`). No purchase needed to start.
- **R2 + D1** created in Joe's account; bound to the Worker. R2 **lifecycle +
  billing alert** configured (§6).
- **Environments**: `preview` and `production`; secrets per env.
- **CI/Deploy**: Git-connected Wrangler build (mirrors the memorial site).
- **Freeze the public URL before printing any QR codes.** When Eduardo registers
  `tonybailetti.com`, attach it as a custom domain; the app is domain-agnostic.

---

## 14. Testing & QA plan

**Device matrix (real hardware):** iPhone Safari (current + one prior iOS);
Android Chrome (mid-range, not just flagship); the **actual** booth
laptop+webcam+mic; iPad.

**Scenarios:** happy path booth+phone; permission denied / no devices / hardware
mute; network (Wi-Fi, slow 3G, offline→reconnect resume, airplane mid-upload);
interruptions (call, lock, tab switch, low battery, refresh mid-recording);
device storage full; **multi-hour booth soak** (dozens in a row — no leak, clean
reset, all uploads drain) as the **M4 exit gate**; **concurrency** (many phones
uploading at once — size against expected guest count); data-safety drill (kill
tab mid-recording → recoverable; booth disk copy exists).

**Two rehearsals**: an early functional dry-run after M3, and a **full
venue-like rehearsal on real hardware** before June 21 including the USB backup
ritual.

---

## 15. Visual design, accessibility & UX for an older audience

**The visual & emotional design direction is specified in `Design-Direction.md`**
— a committed "candlelight" aesthetic (warm **dark** booth theme + warm "paper"
theme for phone/web), distinctive serif + humanist type (Fraunces / Hanken
Grotesk), paper-grain atmosphere, and slow, breath-like motion, cohesive with
the memorial's print language. The app must feel like *his* remembrance, not a
generic recorder. Calm symmetry and warmth are the deliberate, context-right
choice over flashy novelty.

- **Offline asset bundling (hard requirement):** fonts, grain texture, and all
  assets are **self-hosted/bundled** — the booth runs offline, so no web-font
  CDN at the event (ties to §0, §10, §13).
- Large fonts, high contrast (**verify ratios in the dark theme**), **≥48px
  touch targets**, visible amber focus ring, no color-only cues.
- Plain, warm, non-technical language; **gentle failure states** (never
  "Error/Retry"); see `Design-Direction.md` §7.
- Booth captions readable from a seated distance; input-level meter + clear
  REC/▶ states; **`prefers-reduced-motion` honored**.
- Generous timers; easy "start over"; physical booth reachable for limited
  mobility.
- English-only v1 (flag if the community needs another language).

---

## 16. Observability (lightweight, privacy-respecting)

- `/healthz` + a PII-free client error beacon (guarded/rate-limited).
- Counters: created vs. uploaded vs. pending — so the attendant can confirm
  "all uploaded" and reconcile against the USB backup at end of night.

---

## 17. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| iOS Safari recording quirks | High | **iOS spike in M1** on real devices; mp4 path; booth (Chrome) is the reliable centerpiece |
| Venue Wi-Fi poor/absent | High | Offline-first booth; local disk + two-USB backup; background queue |
| Lost recording | Critical | Persisted storage + write-before-confirm + IndexedDB + disk; idempotent resumable upload; startup recovery |
| Dishonest "saved" | High | Mode-specific ✓ semantics (§6); capture-time sanity checks |
| Object clobbering on public endpoint | High | **Server-minted non-overwriting keys** + idempotency token |
| Stored XSS from guest media | High | Magic-byte validation; attachment+nosniff; isolated origin; CSP |
| Abandoned multipart cost | Medium | R2 lifecycle abort + billing alert |
| Spam/abuse on public link | Medium | Turnstile→upload token; server caps; private bucket |
| Older guests confused by phone permissions | Medium | Staffed booth primary; pre-prompts; attendant help |
| Single hardware failure | Medium | Spare-kit; app runs on any Chrome machine |
| Time pressure before June 21 | Medium | Booth happy-path first; durability before resumable upload; phone + extras layered after |

---

## 18. Milestones (dated; map to June 21)

> Fill exact dates on kickoff. Ordering is fixed: **durability before resumable
> upload**, **iOS spike early**, **two rehearsals**.

| Phase | Target | Deliverable | Exit criteria |
|-------|--------|-------------|---------------|
| M0 — Skeleton | Day 1–2 | App shell, state machine, Worker serving app, R2+D1 on Joe's Cloudflare, temp URL | Loads on phone + laptop at temp URL |
| M1 — Capture + **iOS spike** | Day 2–4 | Record→review→re-record, codec detection, cap, **real-iPhone recording proven** | Records cleanly on Chrome **and** current+prior iOS |
| M2 — Durability | Day 4–6 | persist()+estimate+quota handling, IndexedDB buffer, booth disk write, ✓ semantics | Tab-crash + storage-full drills lose nothing |
| M3 — Upload | Day 6–8 | Server-minted keys, multipart resumable, integrity verify, queue/resume, lifecycle+alert | Upload survives offline→online; no clobber |
| M4 — Full flow + **soak** | Day 8–11 | Contact/meta/thank-you/reset, sanity checks, teardown discipline | **Multi-hour soak passes** (no leak, all drain) |
| M5 — Security/family view | Day 11–13 | Turnstile/token, server caps, XSS-safe serving, Access admin + **download-all** | Family can view/download; abuse + XSS guards verified |
| M6 — Hardening + rehearsals | Day 13–17 | Device matrix, a11y pass, attendant guide, USB ritual, **full rehearsal** | Rehearsal on real hardware passes |
| Event | June 21 | — | — |
| Post | — | Handover archive + contacts; retention/deletion | Family has everything |

---

## 19. Task breakdown (work packages)

- **WP-A Setup**: repo, Vite+TS, Worker, wrangler envs, R2+D1, lifecycle+alert,
  temp domain, CI.
- **WP-B Capture core**: getUserMedia, MediaRecorder, codec detection, cap +
  grace, preview, level meter, **teardown discipline**.
- **WP-C State machine + UI**: all screens incl. **CHECK** sanity step, contact
  (optional), thank-you with **PII clear**, attendant reset; accessibility.
  Implements `Design-Direction.md` — **build the design-token sheet first**,
  then the screens.
- **WP-D Durability**: persist()/estimate/quota, IndexedDB buffer, FSA disk
  write, ✓ semantics, startup recovery.
- **WP-E Uploader**: server-minted keys, idempotency, multipart resumable,
  integrity, queue.
- **WP-F Worker API + security**: upload-token/Turnstile, caps, rate limit,
  XSS-safe media serving, Access, CSRF on destructive actions, healthz/beacon
  guards.
- **WP-G Family view**: Access list, playback, **download-all**, export +
  contacts CSV, deletion/takedown path.
- **WP-H Booth ops**: kiosk config, offline behavior, **start-of-day checklist**,
  **two-USB backup ritual**, named owner + escalation, spare-kit, venue recon.
- **WP-I QA**: device matrix, scenarios, **soak**, concurrency sizing, two
  rehearsals.
- **WP-J Hardening + handover**: security review, retention/deletion, archive
  handover.

---

## 20. Open decisions (resolved + remaining)

Resolved by the audit: **metadata index = D1**; **booth-first** then enable
phone; **upload tokens** as the abuse gate; **two USB drives**.

Remaining to confirm before build:
1. Record cap default (90s vs 120s) + grace length.
2. Temporary domain: `*.workers.dev` vs subdomain of an existing Joe domain.
3. Retention window after handover; who authorizes deletion.
4. Family viewer email addresses for Cloudflare Access.
5. Expected guest count (concurrency + storage sizing).
6. Named on-site technical owner for June 21.

---

## Appendix A — Audit outcome (incorporated)

A three-track review (security/privacy, architecture/reliability,
event-readiness/UX) plus a consolidation pass produced **13 must-fix, 14
should-fix, 9 optional** items. Reviewers largely aligned. The one real
**tradeoff** — anti-abuse friction vs. ease for older guests — is resolved by:
**booth = no challenge** (server-side secret), **phone = low-friction Turnstile →
upload token**.

**Must-fix — now in the body:**
1. Honest, mode-specific "✓ saved" semantics + capture-time sanity checks
   (§4, §6, §11).
2. Server-minted, non-overwriting object keys + idempotency token + server
   `receivedAt` (§6, §7, §8).
3. Persisted durable storage: `persist()` + `estimate()` pre-flight +
   `QuotaExceeded` fallback; evict only after on-disk **and** uploaded (§6).
4. Multipart integrity: fixed part ≥5 MiB, per-part checksum/size/count (not the
   multipart ETag), lifecycle abort + billing alert (§6, §8, §17).
5. iOS recording spike front-loaded to **M1** (§5, §14, §18).
6. Booth resource-teardown discipline + **multi-hour soak as M4 gate** (§5, §14,
   §18).
7. USB backup hardening: two drives, verify counts, spot-play, named carrier,
   interim backups (§6, §10).
8. Start-of-day power-on/verification checklist (§10, WP-H).
9. Named on-site technical owner + escalation (§10, §17).
10. Dated timeline; durability before resumable upload; two rehearsals (§18).
11. Stored-XSS-safe media serving: isolated origin, nosniff,
    `Content-Disposition: attachment`, magic-byte validation, CSP, no `ACAO:*`
    (§2, §8, §9).
12. Remove booth Turnstile client-flag bypass → server secret/Access (§8, §9).
13. Consent family-only; store consent **text + version**; re-consent before any
    public use (§9, §12).

**Should-fix — now in the body:** recording-scoped upload tokens as primary gate
+ guarded `/meta`, `/healthz`, beacon (§8, §9); short-TTL per-click signed
download URLs + prove "download-all" (§8, §12); contact-PII lifecycle/deletion/
secure handover (§7, §12); trimmed UA + log retention + IP/id decoupling (§7,
§9); D1 index (§3, §7); partial-recording policy (§4, §6); permission once + FSA
re-select after reboot (§10); guest-count/throughput sizing (§14, §20); soft cap
+ attendant-controlled reset (§4, §5); attendant emotional script + breakage
runbook (WP-H); spare-kit + venue recon (§17, WP-H); clear residual PII on reset
(§4); content-moderation/takedown path (§12); size caps from measured worst case
(§5).

**Optional / later (noted, not yet specced):** optional replay before keep;
longer/skippable countdown; minor/bystander consent nuance; second language;
print-QR vs frozen-temp-URL timing; strip metadata from any later `thumb.jpg`;
document the Worker request-body limit rationale for the proxied-upload path.
