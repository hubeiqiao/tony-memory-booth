// Central tunables. Caps are also enforced server-side (clients are untrusted).
export const CONFIG = {
  appVersion: "0.1.0",
  // Recording length: soft grace near the cap rather than an abrupt cut (§4/§5).
  maxDurationMs: 120_000,
  graceMs: 5_000,
  minDurationMs: 2_000,
  countdownFrom: 3,
  // MediaRecorder timeslice so a crash loses at most one slice (§5).
  timesliceMs: 1_000,
  // Fixed multipart part size >= 5 MiB (§6).
  partSize: 5 * 1024 * 1024,
  maxBytes: 150 * 1024 * 1024,
  // Capture-time sanity thresholds (§4 CHECK).
  audioFloor: 0.02, // peak normalized level 0..1
  blackThreshold: 12, // brightest sampled luma 0..255
  consent: {
    text: "Your message will be shared with Tony's family.",
    version: "2026-06-21.v1",
  },
} as const;
