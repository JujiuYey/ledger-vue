import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import dts from "vite-plugin-dts";
import { fileURLToPath } from "node:url";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    // Bundled declarations (api-extractor rollup): ONE d.ts per entry with no internal relative
    // imports — extensionless specifiers, which vue-tsc's per-file emit produces, fail are-
    // the-types-wrong's node16 resolutions (the React edition gets the same shape from tsdown).
    dts({ tsconfigPath: fromHere("tsconfig.build.json"), rollupTypes: true })
  ],
  build: {
    lib: {
      entry: {
        index: fromHere("src/index.ts"),
        locales: fromHere("src/locales.ts")
      },
      formats: ["es", "cjs"]
    },
    cssCodeSplit: false,
    rollupOptions: {
      external: ["vue", "@tanstack/vue-table", "@tanstack/vue-virtual", "clsx", "@dnd-kit/dom", "reka-ui"],
      output: {
        exports: "named",
        // Named asset so the "./styles.css" export path is stable in dist.
        assetFileNames: (asset) => (asset.name === "style.css" ? "styles.css" : asset.name ?? "[name]")
      }
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  }
});
