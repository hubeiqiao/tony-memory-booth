import { describe, it, expect } from "vitest";
import { transition, canTransition, INITIAL, State, EventType } from "./machine";

function run(events: EventType[], start: State = INITIAL): State {
  return events.reduce((s, e) => transition(s, e), start);
}

describe("state machine", () => {
  it("walks the happy path to thankyou", () => {
    const end = run([
      "BEGIN",
      "PERMISSION_GRANTED",
      "START",
      "STOP",
      "CHECK_PASS",
      "KEEP",
      "CONTACT_DONE",
      "SAVED",
    ]);
    expect(end).toBe("thankyou");
  });

  it("denied permission then retry", () => {
    let s = run(["BEGIN", "PERMISSION_DENIED"]);
    expect(s).toBe("denied");
    s = transition(s, "PERMISSION_GRANTED");
    expect(s).toBe("ready");
  });

  it("sanity check failure returns to ready to re-record", () => {
    const s = run(["BEGIN", "PERMISSION_GRANTED", "START", "STOP"]);
    expect(s).toBe("check");
    expect(transition(s, "CHECK_FAIL")).toBe("ready");
  });

  it("re-record from review returns to ready", () => {
    const s = run([
      "BEGIN",
      "PERMISSION_GRANTED",
      "START",
      "STOP",
      "CHECK_PASS",
    ]);
    expect(s).toBe("review");
    expect(transition(s, "RERECORD")).toBe("ready");
  });

  it("save failure goes to error", () => {
    const s = run([
      "BEGIN",
      "PERMISSION_GRANTED",
      "START",
      "STOP",
      "CHECK_PASS",
      "KEEP",
      "CONTACT_DONE",
    ]);
    expect(s).toBe("saving");
    expect(transition(s, "SAVE_FAILED")).toBe("error");
  });

  it("RESET from any state returns to idle (attendant reset)", () => {
    expect(transition("recording", "RESET")).toBe("idle");
    expect(transition("thankyou", "RESET")).toBe("idle");
    expect(transition("contact", "RESET")).toBe("idle");
  });

  it("FATAL from any state goes to error", () => {
    expect(transition("recording", "FATAL")).toBe("error");
  });

  it("ignores invalid events as no-ops", () => {
    expect(transition("idle", "STOP")).toBe("idle");
    expect(transition("ready", "SAVED")).toBe("ready");
  });

  it("canTransition reflects validity", () => {
    expect(canTransition("idle", "BEGIN")).toBe(true);
    expect(canTransition("idle", "STOP")).toBe(false);
    expect(canTransition("recording", "RESET")).toBe(true);
  });
});
