// Pure state machine for the guest flow (§4). No DOM, no side effects — the UI
// and services react to state; this only computes the next state.
//
//   idle → permission → ready → countdown → recording → check → review
//        → contact → saving → thankyou → (reset) idle
//
// Edge transitions: permission denied, capture sanity fail, re-record, save
// failure, attendant reset (any → idle), and a fatal path (any → error).

export type State =
  | "idle"
  | "permission"
  | "ready"
  | "countdown"
  | "recording"
  | "check"
  | "review"
  | "contact"
  | "saving"
  | "thankyou"
  | "denied"
  | "error";

export type EventType =
  | "BEGIN"
  | "PERMISSION_GRANTED"
  | "PERMISSION_DENIED"
  | "START"
  | "CANCEL"
  | "COUNTDOWN_DONE"
  | "STOP"
  | "CHECK_PASS"
  | "CHECK_FAIL"
  | "KEEP"
  | "RERECORD"
  | "CONTACT_DONE"
  | "SAVED"
  | "SAVE_FAILED"
  | "RESET"
  | "FATAL";

export const INITIAL: State = "idle";

const TABLE: Record<State, Partial<Record<EventType, State>>> = {
  idle: { BEGIN: "permission" },
  permission: { PERMISSION_GRANTED: "ready", PERMISSION_DENIED: "denied" },
  ready: { START: "countdown" },
  countdown: { COUNTDOWN_DONE: "recording", CANCEL: "ready" },
  // tab-hidden / cap reached / manual stop all funnel through STOP
  recording: { STOP: "check" },
  check: { CHECK_PASS: "review", CHECK_FAIL: "ready" },
  review: { KEEP: "contact", RERECORD: "ready" },
  contact: { CONTACT_DONE: "saving" },
  saving: { SAVED: "thankyou", SAVE_FAILED: "error" },
  thankyou: {},
  denied: { PERMISSION_GRANTED: "ready" }, // attendant can grant + retry
  error: {},
};

/**
 * Compute the next state. Returns the same state for transitions that don't
 * apply (a no-op), so stray events never corrupt the flow.
 *
 * Global events apply from any state:
 *  - RESET → idle (attendant reset; also clears PII in the UI layer)
 *  - FATAL → error
 */
export function transition(state: State, event: EventType): State {
  if (event === "RESET") return "idle";
  if (event === "FATAL") return "error";
  const next = TABLE[state]?.[event];
  return next ?? state;
}

export function canTransition(state: State, event: EventType): boolean {
  return transition(state, event) !== state || event === "RESET";
}

/** Screens that hold guest data and must clear it when leaving (§4). */
export function holdsPii(state: State): boolean {
  return state === "contact";
}
