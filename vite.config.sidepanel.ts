import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Side panel je klasická (byť jednostránková) webová aplikace, proto ji
// stavíme jako běžný Vite HTML vstupní bod. `base: "./"` zajišťuje relativní
// cesty k assetům, protože stránka běží z chrome-extension://<id>/sidepanel/.
export default defineConfig({
  root: resolve(rootDir, "src/sidepanel"),
  base: "./",
  build: {
    outDir: resolve(rootDir, "dist/sidepanel"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(rootDir, "src/sidepanel/index.html"),
    },
  },
});
