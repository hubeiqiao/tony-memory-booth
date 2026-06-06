import "./styles/index.css";
import { detectMode, applyTheme } from "./mode";
import { Controller, type Scheduler } from "./ui/controller";
import { createCaptureService } from "./capture-service";
import { createBufferService } from "./buffer-service";
import { createUploadService } from "./api";
import { requestPersistentStorage } from "./storage/persist";
import { ulid } from "./util/ulid";
import { initTurnstile } from "./turnstile";

// Read a booth setup key from the URL (?key=...) first; its presence activates
// booth mode. Then keep it out of the address bar.
const params = new URLSearchParams(location.search);
const urlKey = params.get("key");
if (urlKey) {
  sessionStorage.setItem("boothSecret", urlKey);
  const url = new URL(location.href);
  url.searchParams.delete("key");
  history.replaceState({}, "", url.toString());
}
const hasBoothKey = !!(urlKey || sessionStorage.getItem("boothSecret"));

const mode = detectMode(location.search, hasBoothKey);
applyTheme(mode);

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
