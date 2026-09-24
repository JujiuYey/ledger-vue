import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript/Vue sources so tests run against source
    // (fast, no build step) and share a single Vue instance. The subpath needs its own entry —
    // the bare alias matches exactly, and without it "./locales" would fall back to the packed
    // dist (stale or absent).
    alias: {
      "@coldsmirk/ledger-vue/locales": fromHere("./packages/vue/src/locales.ts"),
      "@coldsmirk/ledger-vue": fromHere("./packages/vue/src/index.ts")
    }
  },
  plugins: [vue()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    clearMocks: true
  }
});
