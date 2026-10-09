import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Resolve the library to its TypeScript/Vue sources (same pattern as the root vitest
    // config): the playground live-reloads library edits with no build step.
    alias: [
      { find: "@jujiuyey/ledger-vue/styles.css", replacement: fromHere("../vue/src/styles.css") },
      { find: "@jujiuyey/ledger-vue/locales", replacement: fromHere("../vue/src/locales.ts") },
      { find: "@jujiuyey/ledger-vue", replacement: fromHere("../vue/src/index.ts") }
    ]
  },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    port: 5331
  }
});
