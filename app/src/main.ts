import "./styles/index.css";
import { detectMode, applyTheme } from "./mode";
import { Controller, type Scheduler } from "./ui/controller";
import { createCaptureService } from "./capture-service";
import { createBufferService } from "./buffer-service";
import { createUploadService } from "./api";
import { requestPersistentStorage } from "./storage/persist";
import { ulid } from "./util/ulid";
import { initTurnstile } from "./turnstile";

const mode = detectMode();
applyTheme(mode);

// Pick up a booth setup secret from the URL (?key=...) once, then keep it out
// of the address bar.
const key = new URLSearchParams(location.search).get("key");
if (key) {
  sessionStorage.setItem("boothSecret", key);
  const url = new URL(location.href);
  url.searchParams.delete("key");
  history.replaceState({}, "", url.toString());
}

const scheduler: Scheduler = {
  after: (ms, cb) => {
    const h = window.setTimeout(cb, ms);
    return () => clearTimeout(h);
  },
  every: (ms, cb) => {
    const h = window.setInterval(cb, ms);
    return () => clearInterval(h);
  },
};

const root = document.getElementById("app");
if (root) {
  // Make storage durable up front (and surface to the attendant if denied).
  void requestPersistentStorage().then((r) => {
    if (mode === "booth" && r.supported && !r.persisted) {
      console.warn("[memory-booth] storage is not persistent — buffer may be evictable");
    }
  });

  new Controller(root, {
    mode,
    capture: createCaptureService(),
    buffer: createBufferService(mode),
    upload: createUploadService(mode),
    scheduler,
    now: () => Date.now(),
    newId: () => ulid(),
    onError: (e) => console.warn("[memory-booth]", e),
  });

  // Phone anti-spam: render the Turnstile widget if a sitekey is configured.
  if (mode === "phone") {
    void initTurnstile(root.querySelector('[data-ref="turnstile"]'));
  }
}
