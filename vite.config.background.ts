import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Service worker musí být jediný samostatný soubor bez ES-module importů
// (MV3 to bez "type": "module" v manifestu nepodporuje), proto build.lib
// s formátem "iife".
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(rootDir, "dist/background"),
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: resolve(rootDir, "src/background/serviceWorker.ts"),
      formats: ["iife"],
      name: "SharedMemoryBackground",
      fileName: () => "serviceWorker.js",
    },
  },
});
