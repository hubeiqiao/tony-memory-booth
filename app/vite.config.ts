import { defineConfig } from "vite";

// In dev, the frontend runs on Vite (5173) and the Worker API runs on
// `wrangler dev` (8787). Proxy API + health calls to the Worker so the SPA
// uses same-origin relative URLs in every environment.
export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/healthz": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
