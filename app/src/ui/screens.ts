import type { Mode } from "../types";
import type { State } from "../state/machine";

// Builds every screen once; the controller toggles `.is-active` and updates the
// dynamic bits. Buttons carry data-action for event delegation. Copy is warm
// and non-transactional (Design-Direction §7).

export interface ScreenRefs {
  stage: HTMLElement;
  screens: Partial<Record<string, HTMLElement>>;
  previewVideo: HTMLVideoElement;
  reviewVideo: HTMLVideoElement;
  countdownNum: HTMLElement;
  timer: HTMLElement;
  levelFill: HTMLElement;
  savingStatus: HTMLElement;
  checkNote: HTMLElement;
  contact: { name: HTMLInputElement; email: HTMLInputElement; phone: HTMLInputElement };
  attendant: HTMLElement;
}

// state -> screen key
export const SCREEN_FOR: Record<State, string> = {
  idle: "welcome",
  permission: "permission",
  ready: "ready",
  countdown: "countdown",
  recording: "recording",
  check: "check",
  review: "review",
  contact: "contact",
  saving: "saving",
  thankyou: "thankyou",
  denied: "denied",
  error: "error",
};

function section(key: string, html: string): string {
  return `<section class="screen" data-screen="${key}" aria-label="${key}">${html}</section>`;
}

export function buildStage(root: HTMLElement, mode: Mode): ScreenRefs {
  const begin = mode === "booth" ? "Begin" : "Share a memory";
  const html = `
    <div class="stage">
      ${section(
        "welcome",
        `<div class="portrait portrait--placeholder" aria-hidden="true">T</div>
         <p class="prompt">Share a memory of Tony.</p>
         <p class="lead">A short message for his family — take your time.</p>
         <div class="controls"><button class="btn btn--primary btn--lg" data-action="begin">${begin}</button></div>`
      )}
      ${section(
        "permission",
        `<p class="prompt">A quick hello to your camera.</p>
         <p class="lead">We'll ask to use the camera and microphone so you can record.</p>
         <div class="controls"><button class="btn btn--primary btn--lg" data-action="allow">Allow</button></div>
         <p class="subtle">Your message goes only to Tony's family.</p>`
      )}
      ${section(
        "ready",
        `<div class="preview-frame"><video data-ref="preview" muted playsinline></video></div>
         <p class="lead">When you're ready, take your time.</p>
         <div class="controls"><button class="btn btn--primary btn--lg" data-action="start">Start recording</button></div>
         <div class="level" aria-hidden="true"><i data-ref="level"></i></div>`
      )}
      ${section(
        "countdown",
        `<div class="countdown"><span class="ring"></span><span class="num" data-ref="count">3</span></div>
         <p class="lead">Take your time.</p>`
      )}
      ${section(
        "recording",
        `<div class="preview-frame"><video data-ref="recpreview" muted playsinline></video></div>
         <div class="rec-row"><span class="rec-dot" aria-hidden="true"></span>
           <span class="timer" data-ref="timer">0:00</span></div>
         <p class="lead">Speak from the heart.</p>
         <div class="controls"><button class="btn btn--lg" data-action="stop">Done</button></div>`
      )}
      ${section(
        "check",
        `<p class="prompt">One moment…</p>
         <p class="lead" data-ref="checknote">Making sure we caught that.</p>`
      )}
      ${section(
        "review",
        `<div class="preview-frame"><video class="is-playback" data-ref="review" playsinline controls></video></div>
         <p class="lead">Happy with it?</p>
         <div class="controls">
           <button class="btn" data-action="rerecord">Record again</button>
           <button class="btn btn--primary" data-action="keep">Keep &amp; send</button>
         </div>`
      )}
      ${section(
        "contact",
        `<p class="prompt">Leave your name?</p>
         <p class="lead">Only if you'd like — in case the family would like to say thank you.</p>
         <div class="fields">
           <div class="field"><label for="c-name">Name</label><input id="c-name" data-ref="c-name" autocomplete="name" /></div>
           <div class="field"><label for="c-email">Email</label><input id="c-email" data-ref="c-email" type="email" autocomplete="email" /></div>
           <div class="field"><label for="c-phone">Phone</label><input id="c-phone" data-ref="c-phone" type="tel" autocomplete="tel" /></div>
         </div>
         <div class="controls">
           <button class="btn" data-action="skip">Skip</button>
           <button class="btn btn--primary" data-action="submit">Send</button>
         </div>`
      )}
      ${section(
        "saving",
        `<p class="prompt">Keeping your message safe…</p>
         <p class="status" data-ref="saving" aria-live="polite">Holding your message…</p>`
      )}
      ${section(
        "thankyou",
        `<div class="bloom" aria-hidden="true"></div>
         <p class="prompt">Thank you for sharing.</p>
         ${mode === "booth" ? `<div class="controls"><button class="btn" data-action="reset">Done</button></div>` : `<p class="lead">You can close this when you're ready.</p><div class="controls"><button class="btn" data-action="reset">Record another</button></div>`}`
      )}
      ${section(
        "denied",
        `<p class="prompt">We couldn't reach the camera.</p>
         <p class="lead">No worries — please allow camera and microphone access, then try again.</p>
         <div class="controls"><button class="btn btn--primary" data-action="allow">Try again</button></div>`
      )}
      ${section(
        "error",
        `<p class="prompt">Let's try that again.</p>
         <p class="lead">Something interrupted us, but nothing is lost.</p>
         <div class="controls"><button class="btn btn--primary" data-action="reset">Start over</button></div>`
      )}
    </div>
    ${mode === "booth" ? `<p class="attendant" data-ref="attendant"></p>` : ""}
  `;
  root.innerHTML = html;

  const stage = root.querySelector(".stage") as HTMLElement;
  const screens: Partial<Record<string, HTMLElement>> = {};
  stage.querySelectorAll<HTMLElement>("[data-screen]").forEach((el) => {
    screens[el.dataset.screen as string] = el;
  });
  const ref = <T extends HTMLElement>(name: string) =>
    root.querySelector(`[data-ref="${name}"]`) as T;

  return {
    stage,
    screens,
    previewVideo: ref<HTMLVideoElement>("preview"),
    reviewVideo: ref<HTMLVideoElement>("review"),
    countdownNum: ref("count"),
    timer: ref("timer"),
    levelFill: ref("level"),
    savingStatus: ref("saving"),
    checkNote: ref("checknote"),
    contact: {
      name: ref<HTMLInputElement>("c-name"),
      email: ref<HTMLInputElement>("c-email"),
      phone: ref<HTMLInputElement>("c-phone"),
    },
    attendant: ref("attendant"),
  };
}
