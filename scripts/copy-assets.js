// Zkopíruje manifest.json a ikony do dist/ po dokončení tří Vite buildů.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const dist = resolve(root, "dist");

if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
}

cpSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
cpSync(resolve(root, "public/icons"), resolve(dist, "icons"), { recursive: true });

console.log("Zkopírováno: manifest.json, icons/ -> dist/");
