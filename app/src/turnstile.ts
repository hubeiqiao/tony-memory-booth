// Cloudflare Turnstile (phone anti-spam). Dormant unless a sitekey is provided
// at build time (VITE_TURNSTILE_SITEKEY). When configured, it renders an
// (invisible/managed) widget on the permission screen and keeps the latest
// token for the upload-token request; the Worker verifies it server-side.

let latestToken = "";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function turnstileSiteKey(): string {
  // cast avoids needing vite/client types in tsconfig
  return ((import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_TURNSTILE_SITEKEY ?? "").trim();
}

export function getTurnstileToken(): string {
  return latestToken;
}

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(s);
  });
}

/** Render the widget into `el` if a sitekey is configured; otherwise no-op. */
export async function initTurnstile(el: HTMLElement | null): Promise<void> {
  const sitekey = turnstileSiteKey();
  if (!sitekey || !el) return;
  try {
    await loadScript();
    window.turnstile?.render(el, {
      sitekey,
      callback: (token: string) => {
        latestToken = token;
      },
      "expired-callback": () => {
        latestToken = "";
      },
      "error-callback": () => {
        latestToken = "";
      },
    });
  } catch {
    /* best-effort; if it fails the Worker will reject the upload token */
  }
}
