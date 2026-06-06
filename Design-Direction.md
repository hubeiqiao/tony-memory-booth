# Memory Booth — Visual & Emotional Design Direction

*The committed aesthetic for the recording app, written for the convocation —
the celebration of Professor Tony Bailetti's life. No code; this defines the
look, feel, motion, and voice so the build is fast and unmistakably *his*, not a
generic recorder.*

Companion to `Implementation-Plan.md` (the build) and `Memory-Booth-Plan.md`
(the proposal). Cohesive with the memorial's established print language
(warm ivory, old-style serif, bronze).

---

## 0. The concept: "A warm, candlelit room"

The whole experience should feel like being quietly invited into a calm, warm
room to speak — to the family, and to him. Not an app. Not a kiosk. A small,
dignified space made of paper, ink, and candlelight.

**The one unforgettable thing:** a softly glowing screen, a single warm portrait
of Tony, and one luminous button that begins a slow *breathing* countdown — the
moment of sitting down should feel like the room gently leaning in to listen.

**Tone:** reverent, warm, grateful, unhurried. Closer to a handwritten letter or
a memorial program than to software.

### Why not the usual "bold/unexpected" playbook
This is a grief-adjacent, one-shot event for an older, academic community.
Asymmetry, grid-breaking, energetic motion, and clever novelty would feel
disrespectful and confuse guests in an emotional moment. We get distinction the
*right* way for the context: **exceptional typography, warm light, real texture,
and slow, breath-like motion**, composed with calm symmetry and generous space.
Intentionality over intensity.

---

## 1. Two themes, one warm family

A single warm palette (warm neutrals + one bronze/amber accent), expressed as
two themes for the two contexts:

### Booth — "Candlelight" (warm dark)
Intimate, low-glare in a venue, flattering on camera, makes the live preview
glow. The default for the staffed booth.
```
--bg:        #17120E   /* deep warm espresso, near-black brown */
--bg-elev:   #211A14   /* raised surfaces */
--ink:       #F4EBDD   /* warm ivory text */
--ink-soft:  #CDBFAC
--muted:     #9A8A74
--accent:    #D2A24C   /* candle amber/bronze — the single glow */
--accent-dim:#C9933E
--glow:      rgba(210,162,76,0.16)   /* radial warmth behind focal point */
--rule:      rgba(244,235,221,0.12)
```

### Phone & after-event — "Paper" (warm light)
Matches the memorial's print/proposal language; better in daylight on phones.
```
--bg:    #FBF8F2   --ink:    #2B2925   --soft:  #544F47
--muted: #8B8377   --accent: #9C7A45   --rule:  #E7DFD0
```

One accent family across both = cohesion. **Never** the generic clinical white,
cold grey, or any purple/blue gradient.

---

## 2. Typography (distinctive, warm, legible)

Pair a soft old-style **serif** for the emotional voice with a warm **humanist
sans** for controls and legibility at a seated distance.

- **Display / prompts / thank-you — `Fraunces`** (variable, soft optical serif;
  characterful and warm, the screen-kin of the Baskerville/Hoefler used in the
  printed proposal). Use its *soft* opsz and a gentle weight (~400–500), large.
- **UI / labels / timer / buttons — `Hanken Grotesk`** (humanist, gentle, highly
  legible). Alt: `Figtree`.
- Numerals (countdown, timer): the serif at large size for the count; tabular
  sans for the running timer so it doesn't jitter.

Rules:
- **Self-host / bundle the fonts** — the booth runs **offline**, so no Google
  Fonts CDN at the event (this is a hard requirement, see plan §10/§13).
- Generous size and line-height; the welcome prompt should be readable across a
  room. Tight, characterful tracking on the serif display.
- **Banned:** Inter, Roboto, Arial, system-ui, and "safe" convergent picks
  (e.g. Space Grotesk). They read as AI-default and have no soul for this.

---

## 3. Atmosphere & texture (no flat fills)

Backgrounds carry warmth and depth, always subtly:
- A **soft radial glow** (candlelight) behind the focal element, using `--glow`.
- A fine **paper/film grain** overlay (a single small tiled asset or SVG
  `feTurbulence`, ~3–6% opacity) so surfaces feel like paper, not screens.
- A gentle **vignette** drawing the eye inward.
- On the booth, a faint warmth pooled at top-center, like light from above.

Everything here is *atmosphere, not decoration* — felt more than noticed. If a
guest consciously notices an effect, it's too strong.

---

## 4. Motion: breath and candlelight

Slow, soft, and organic — never energetic, springy, or "appy." Motion should
feel like breathing and like light shifting.

- **Page load (welcome):** staggered fade-up (16–24px, ~500ms ease-out, ~90ms
  stagger) — portrait, then prompt, then button settle in like a held breath.
- **Primary button:** on press, a gentle scale to ~1.02 and a soft amber *bloom*
  outward. No bounce, no shadow-pop.
- **Countdown:** a **breathing ring** that expands and softly contracts over ~1s
  per count, numbers cross-dissolving. Calm, not a ticking clock.
- **Recording:** the REC dot pulses slowly (~2s cycle); the timer counts quietly.
- **State transitions:** 400–600ms cross-dissolves, like a page turning or a
  light dimming — never slides or wipes.
- **Thank-you:** a single soft **bloom** of one mark, text fades up, a held
  beat, then a gentle dissolve back to rest.
- **Always honor `prefers-reduced-motion`:** replace with simple opacity fades.

---

## 5. Composition

- **Centered, symmetric, one focal element per screen.** Calm symmetry is the
  statement.
- **Generous negative space** — let the screen breathe; emptiness reads as
  respect.
- Live camera preview is framed softly (rounded, faint inner shadow, slight warm
  border) — a *portrait*, not a webcam feed.
- Controls sit low and obvious; nothing competes with the moment.

---

## 6. Per-screen visual treatment (maps to the 6 wireframes)

1. **Welcome** — Candlelight bg, warm radial glow, a soft **duotone portrait of
   Tony** (warm-toned, soft-edged) above a serif prompt: *"Share a memory of
   Tony."* One luminous amber button. Quiet sub-line about the family + time.
2. **Countdown** — Preview dimmed slightly; the breathing ring with a large
   serif 3 · 2 · 1; *"Take your time."*
3. **Recording** — Preview is the hero, softly framed; a slow REC pulse and calm
   timer top-corners; the stop button low-center; *"Speak from the heart."*
4. **Review** — The recording shown like a framed portrait; two clear, equal
   choices (*Re-record* / *Keep & send*) — the keep action carries the amber.
5. **Leave your details (optional)** — Warm, low-pressure; large fields; **Skip**
   is visually equal, never buried; one line: *"…in case the family would like
   to say thank you."*
6. **Thank-you** — Almost empty. A single soft amber bloom, *"Thank you for
   sharing."*, then a slow dissolve. The most restrained screen by design.

---

## 7. Voice & microcopy

Warm, plain, human, unhurried — second person. It should sound like a person,
not a product.
- Yes: *"Take your time." · "Speak from the heart." · "Thank you for sharing." ·
  "Your message goes to Tony's family."*
- No: transactional/app language — *"Submit", "Upload complete", "Session reset",
  "Error", "Retry"*. Even failure states stay gentle and reassuring.
- No emoji in the UI.

---

## 8. Accessibility, reconciled with the aesthetic

The warm-dark theme is *more* legible, not less, when done right:
- Ivory `--ink` on espresso `--bg` is high-contrast (verify ≥ 7:1 for body, ≥
  4.5:1 for large) — keep amber for accents/focus, not body text.
- **≥48px touch targets**, large type, visible **amber focus ring**, no
  color-only meaning, captions readable at a seated distance.
- `prefers-reduced-motion` fully supported; physical booth reachable for limited
  mobility (ties to plan §15).

---

## 9. What to avoid (generic-AI tells, doubly wrong here)

Inter/Roboto/system fonts · flat solid backgrounds · clinical bright white ·
purple/blue gradients · bouncy/springy micro-interactions · transactional
progress bars and toasts · generic rounded "cards" · emoji UI · dark-mode that's
cold grey instead of warm. Anything that feels like a SaaS dashboard.

---

## 10. Implementation prep (for later — no code now)

- CSS **custom properties** for all tokens; two theme classes
  (`.theme-candlelight`, `.theme-paper`) toggled by mode.
- **Bundle fonts + grain locally** (offline booth). Subset Fraunces/Hanken to
  the glyphs used to keep the bundle tiny for cellular phone loads.
- All motion in **CSS** behind a `prefers-reduced-motion` guard.
- A small set of **design tokens** is the contract between this doc and WP-C
  (State machine + UI). Build the token sheet first, then the screens.
- Keep the bundle small — design must not fight the offline-first / fast-on-
  cellular goals (plan §0, §11).
```
