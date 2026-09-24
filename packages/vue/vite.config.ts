import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: fromHere("src/index.ts"),
        locales: fromHere("src/locales.ts")
      },
      formats: ["es", "cjs"],
      cssCodeSplit: false
    },
    rollupOptions: {
      external: ["vue", "@tanstack/vue-table", "@tanstack/vue-virtual", "clsx", "@dnd-kit/dom"],
      output: {
        // Named asset so the "./styles.css" export path is stable in dist.
        assetFileNames: (asset) => (asset.name === "style.css" ? "styles.css" : asset.name ?? "[name]")
      }
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  }
});
