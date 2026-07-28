import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Content script se injektuje jako klasický skript (ne modul), proto opět
// jediný IIFE soubor bez externích importů.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(rootDir, "dist/content"),
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: resolve(rootDir, "src/content/contentScript.ts"),
      formats: ["iife"],
      name: "SharedMemoryContent",
      fileName: () => "contentScript.js",
    },
  },
});
