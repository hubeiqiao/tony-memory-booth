import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Default to node; DOM/IDB tests opt in per-file with:
    //   // @vitest-environment jsdom
    environment: "node",
    include: ["src/**/*.test.ts", "worker/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: [],
  },
});
