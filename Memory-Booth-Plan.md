# A Memory Booth for Tony — Rough Plan & Wireframe

*For the Celebration of Life · June 21*

A simple, warm way for guests to record a short video message or memory for the
family. One web app powers everything: it runs on a laptop as a quiet "booth,"
it opens on phones via a QR code, and it stays online afterward so anyone who
couldn't attend can still share something.

This builds on Eduardo's idea for a recording booth at the celebration of life.
It's a first draft to react to — nothing here is locked in.

---

## 1. The idea in one paragraph

We set up a small, comfortable spot at the event. A guest sits down, taps one
big button, and the camera gives them about 60–120 seconds to speak — a memory,
a thank-you, a story about Tony. They tap again to finish. The message is saved
safely for the family, and the screen resets for the next person. The exact same
app also works on phones, so people who'd rather record on their own — or do it
later from home — can scan a QR code and share that way.

---

## 2. What a guest experiences

1. They see a welcome screen with Tony's photo and a single **Start** button.
2. A gentle **3 · 2 · 1** countdown gives them a moment to settle.
3. Recording begins. A timer counts down; the button now says **Stop**.
4. When they finish (or time runs out), they can **watch it back** and choose
   **Keep & Send** or **Re-record**.
5. They can **optionally leave their name and a way to reach them**, in case the
   family would like to follow up with a thank-you — easy to skip.
6. A **thank-you** screen appears, then the booth resets for the next guest.

No accounts, no typing, no setup. The whole thing is one tap to start, one to stop.

---

## 3. Wireframes

### Screen 1 — Welcome / Start
```
+--------------------------------------------+
|                                            |
|            [ Photo of Tony ]               |
|                                            |
|      Share a memory of Tony Bailetti       |
|                                            |
|    Record a short message for his family   |
|                                            |
|        +----------------------------+      |
|        |    ●   Start Recording     |      |
|        +----------------------------+      |
|                                            |
|   Your message goes only to Tony's family  |
|              About 60–120 seconds          |
+--------------------------------------------+
```

### Screen 2 — Countdown
```
+--------------------------------------------+
|                                            |
|          [ live camera preview ]           |
|                                            |
|                                            |
|                   3                        |
|                                            |
|               Get ready…                   |
|                                            |
+--------------------------------------------+
```

### Screen 3 — Recording
```
+--------------------------------------------+
|  ● REC                            01:12    |
|                                            |
|          [ live camera preview ]           |
|                                            |
|                                            |
|        +----------------------------+      |
|        |       ■   Stop & Save      |      |
|        +----------------------------+      |
|                                            |
|     Take your time. Speak from the heart.  |
+--------------------------------------------+
```

### Screen 4 — Review (keep or try again)
```
+--------------------------------------------+
|             Here's your message            |
|                                            |
|            [ video playback ▶ ]            |
|                                            |
|    +---------------+   +----------------+  |
|    |   Re-record   |   |  Keep & Send ✓ |  |
|    +---------------+   +----------------+  |
|                                            |
+--------------------------------------------+
```

### Screen 5 — Leave your details (optional)
```
+--------------------------------------------+
|                                            |
|       Want the family to be able to        |
|        reach you to say thank you?         |
|                 (optional)                 |
|                                            |
|   Name   [_______________________]         |
|   Email  [_______________________]         |
|   Phone  [_______________________]         |
|                                            |
|     +-----------+   +---------------+      |
|     |   Skip    |   |  Save & Done  |      |
|     +-----------+   +---------------+      |
|                                            |
+--------------------------------------------+
```

### Screen 6 — Thank you / Saved
```
+--------------------------------------------+
|                                            |
|                    ✓                       |
|                                            |
|           Thank you for sharing.           |
|                                            |
|     Your message has been saved for        |
|              Tony's family.                |
|                                            |
|         (resets for the next guest)        |
+--------------------------------------------+
```

### The booth itself (physical setup)
```
        A quiet corner / semi-private space
   +------------------------------------------+
   |   [ ring light ]                         |
   |        webcam ▢                          |
   |     +------------------+                 |
   |     |   Laptop /       |     🎤 mic      |
   |     |   big screen     |                 |
   |     +------------------+                 |
   |            [ chair ]                      |
   |                                          |
   |    "Sit down, tap the button, share."    |
   +------------------------------------------+
```

### QR card (for phones / around the room / after the event)
```
        +------------------------------+
        |    Share a memory of         |
        |       Tony Bailetti          |
        |                              |
        |        [  QR CODE  ]         |
        |                              |
        |   Scan to record a message   |
        |       for the family         |
        +------------------------------+
```

---

## 4. Three ways people can use the same app

| Way | Where | Best for |
|-----|-------|----------|
| **Booth** | A laptop + webcam + mic in a quiet corner | The main experience — best audio/video, a calm private moment, easy for guests who aren't comfortable with phones |
| **QR on phones** | Cards/posters around the venue | Many people at once with no line; people who'd rather record themselves |
| **After the event** | A shared link | Anyone who couldn't attend, or who wants to think about what to say |

The booth is the centerpiece. The QR and after-event link cost us almost nothing
extra to offer, and they make sure no one who wants to contribute gets left out.

---

## 5. Making sure nothing is ever lost

This only happens once, so the most important promise is: **we never lose a
message.** The plan is built around that:

- The booth **saves each recording the instant it's finished**, before anything
  else, so a weak venue Wi-Fi connection can't cause a loss.
- Saved recordings then upload to private cloud storage in the background.
- At the end of the night we also keep a copy on a USB drive as a backup.
- Every guest sees a clear "✓ saved" confirmation so no one is left wondering.

---

## 6. The website can hold more than recordings

Since we're building a site anyway, it can quietly grow into a small place that
holds more of Tony — the photos and videos we already have, and the messages
people record. If the family likes the idea, the recorded memories could later
become part of a lasting online tribute that lives at the same address.

A possible later layout — entirely optional, not needed for June 21:
```
+--------------------------------------------+
|   tonybailetti.com                         |
|--------------------------------------------|
|             [ hero photo of Tony ]         |
|           Remembering Tony Bailetti        |
|                                            |
|         [  Share a Memory  ]  ← record     |
|--------------------------------------------|
|   His Story   |   Photos   |   Videos      |
|--------------------------------------------|
|   [ wall of messages — family-only ]       |
+--------------------------------------------+
```

---

## 7. Domain & hosting

**Suggested domain: `tonybailetti.com` — it's available now.** It's clean, it's
his name, and it can hold both the memory booth now and a fuller tribute later.
*Suggestion: Eduardo purchases and owns the domain* (roughly ~$10–12/year at most
registrars — worth confirming at checkout). Joe is happy to help with the
technical setup.

**Hosting: Cloudflare.** It's a great fit for this and keeps everything in one
place:

- **Cloudflare Pages / Workers** — serves the recording web app.
- **Cloudflare R2** — private storage for the video messages (no surprise
  egress fees, well-suited to media files). *(Check Cloudflare's current R2
  pricing for exact numbers; volume here will be small.)*
- **Cloudflare Access** — optional, to lock the "view all messages" page so only
  the family can see it.

Everything lives in one Cloudflare account that Joe can help configure.

---

## 8. A few things to decide together

- **Who can see the messages?** Default plan: private to the family only.
- A short, gentle **consent line** on screen (e.g. "Your message will be shared
  with Tony's family") — good to agree on the exact wording.
- **Contact details are optional** and kept private — collected only so the
  family can reach out to say thank you, and never shared further.
- Rough **number of guests**, so we can plan booth capacity / whether to add a
  second station.
- Is there a **quiet corner** at the venue we can use for the booth?
- **Hardware:** one good external webcam + a clip-on or USB mic makes a big
  difference over a laptop's built-in mic. We can sort out what to borrow/bring.

---

## 9. Rough timeline (today → June 21)

| When | What |
|------|------|
| This week | Confirm the idea, buy `tonybailetti.com`, agree on privacy + consent wording |
| ~1 week out | Build the recording app, set up Cloudflare storage, test on real iPhones & Androids |
| Few days out | Dry run with the actual booth laptop + webcam + mic; print QR cards |
| June 21 | Set up the booth, keep the QR link live, collect messages |
| After | Hand the family all recordings; optionally fold them into a lasting tribute |

There's comfortably enough time. The build itself is small; most of the care
goes into testing and reliability.

---

## 10. Next steps

1. Get a thumbs-up (or changes) on this rough plan.
2. **Eduardo:** purchase and own `tonybailetti.com`, and share any photos or
   videos of Tony he has, if available.
3. **The rest of the team:** build and test the recording app on real phones.
4. Dry run the full booth before the day.

If this feels right, we'll start on a working prototype so you can try it
yourself well before the 21st.
