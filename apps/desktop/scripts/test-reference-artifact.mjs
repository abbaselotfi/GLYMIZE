import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_NAME, validateDesktopStage } from "./reference-profile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const manifest = JSON.parse(await readFile(path.join(root, MANIFEST_NAME), "utf8"));
await validateDesktopStage(root, manifest);
const html = await readFile(path.join(root, "offline/index.html"), "utf8");
if (/manifest\.webmanifest|serviceWorker\.register|https?:\/\/fonts\./.test(html))
  throw new Error("DESKTOP_REFERENCE_BROWSER_SURFACE_REJECTED");
console.log(JSON.stringify({ profile: manifest.profile, version: manifest.version, assets: manifest.assets.length,
  bytes: manifest.totalBytes, sourceHash: manifest.sourceHash, sourceDirty: manifest.sourceDirty }));
