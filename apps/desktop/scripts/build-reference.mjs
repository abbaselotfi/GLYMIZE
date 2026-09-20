import { spawnSync } from "node:child_process";
import { copyFile, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeOfflineReference } from "../../web/scripts/offline-reference-projection.mjs";
import { MANIFEST_NAME, createDesktopManifest, validateDesktopStage } from "./reference-profile.mjs";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const WEB_ROOT = path.join(REPOSITORY_ROOT, "apps/web");
const WEB_EXPORT = path.join(WEB_ROOT, ".next-desktop-reference");
const STAGE = path.join(DESKTOP_ROOT, "dist");
const LOCK = path.join(WEB_ROOT, ".desktop-reference-build.lock");
const FORBIDDEN_KEYS = new Set(["CF_PAGES", "GITHUB_PAGES", "GITHUB_PAGES_CUSTOM_DOMAIN", "GLYMIZE_OFFLINE_BUNDLE_ENABLED",
  "GLYMIZE_RUNTIME_PROXY_UPSTREAM", "NEXT_PUBLIC_RUNTIME_API_URL", "NEXT_PUBLIC_ADMIN_API_URL", "NEXT_PUBLIC_LOCAL_UI_BYPASS"]);
const ENV_ALLOWLIST = ["APPDATA", "CI", "COMSPEC", "ComSpec", "LOCALAPPDATA", "NODE_OPTIONS", "NUMBER_OF_PROCESSORS",
  "OS", "PATH", "Path", "PATHEXT", "PROCESSOR_ARCHITECTURE", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "USERPROFILE"];

function assertOwned(target, owner) {
  const resolved = path.resolve(target);
  if (resolved !== path.resolve(owner) && !resolved.startsWith(`${path.resolve(owner)}${path.sep}`))
    throw new Error(`DESKTOP_REFERENCE_UNOWNED_PATH:${resolved}`);
}

async function rejectDotenvOverrides() {
  const names = new Set(await readdir(WEB_ROOT));
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (!names.has(name)) continue;
    const source = await readFile(path.join(WEB_ROOT, name), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match && FORBIDDEN_KEYS.has(match[1])) throw new Error(`DESKTOP_REFERENCE_DOTENV_CONFLICT:${name}:${match[1]}`);
    }
  }
}

function buildEnvironment() {
  for (const key of FORBIDDEN_KEYS) {
    if (String(process.env[key] ?? "").trim()) throw new Error(`DESKTOP_REFERENCE_ENV_CONFLICT:${key}`);
  }
  const env = {};
  for (const key of ENV_ALLOWLIST) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, NODE_ENV: "production", GITHUB_PAGES: "false", CF_PAGES: "0",
    GLYMIZE_DESKTOP_REFERENCE_PROFILE: "true", GLYMIZE_NEXT_DIST_DIR: ".next-desktop-reference",
    NEXT_PUBLIC_RUNTIME_API_URL: "", NEXT_PUBLIC_ADMIN_API_URL: "", NEXT_PUBLIC_LOCAL_UI_BYPASS: "0" };
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`DESKTOP_REFERENCE_COMMAND_FAILED:${result.status ?? "unknown"}`);
}

function localReferences(source, relative) {
  const found = new Set();
  const matcher = relative.endsWith(".css")
    ? /url\(["']?(\/(?:_next\/static\/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+\.(?:png|svg|ico)))(?:[?#][^"')]+)?["']?\)/g
    : /["'(](\/(?:_next\/static\/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+\.(?:png|svg|ico)))(?:[?#][^"')]+)?["')]/g;
  for (const match of source.matchAll(matcher))
    found.add(match[1].slice(1));
  return [...found];
}

function sanitizeDesktopAsset(relative, bytes) {
  if (relative.endsWith(".css"))
    return Buffer.from(bytes.toString("utf8").replace(/@import\s+url\(["']?https?:\/\/[^)]+\)[^;]*;/gi, ""));
  if (relative.endsWith(".html")) {
    const sanitized = bytes.toString("utf8")
      .replace(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/>/g, "")
      .replace(/\[\\"\$\\",\\"link\\",\\"\d+\\",\{\\"rel\\":\\"manifest\\",\\"href\\":\\"\/manifest\.webmanifest\\",\\"crossOrigin\\":\\"\$undefined\\"\}\],/g, "");
    if (sanitized.includes("manifest.webmanifest")) throw new Error("DESKTOP_REFERENCE_MANIFEST_STRIP_FAILED");
    return Buffer.from(sanitized);
  }
  return bytes;
}

async function copyRequiredAssets() {
  const queue = ["offline/index.html"];
  const copied = new Set();
  while (queue.length) {
    const relative = queue.shift();
    if (copied.has(relative)) continue;
    const source = path.join(WEB_EXPORT, relative);
    const destination = path.join(STAGE, relative);
    assertOwned(source, WEB_EXPORT);
    assertOwned(destination, STAGE);
    const sourceBytes = await readFile(source);
    const bytes = sanitizeDesktopAsset(relative, sourceBytes);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    copied.add(relative);
    if (/\.(?:html|css|js)$/i.test(relative)) {
      for (const reference of localReferences(bytes.toString("utf8"), relative)) if (!copied.has(reference)) queue.push(reference);
    }
  }
}

let lock;
try {
  assertOwned(WEB_EXPORT, WEB_ROOT);
  assertOwned(STAGE, DESKTOP_ROOT);
  lock = await open(LOCK, "wx");
  await rejectDotenvOverrides();
  await rm(path.join(WEB_ROOT, "out"), { recursive: true, force: true });
  await rm(WEB_EXPORT, { recursive: true, force: true });
  await rm(STAGE, { recursive: true, force: true });
  const env = buildEnvironment();
  run(process.execPath, [path.join(WEB_ROOT, "scripts/next.cjs"), "build", "--webpack"], { cwd: WEB_ROOT, env });
  const reference = await writeOfflineReference(WEB_EXPORT);
  await copyRequiredAssets();
  await mkdir(path.join(STAGE, "data"), { recursive: true });
  await copyFile(path.join(WEB_EXPORT, "data/offline-reference.json"), path.join(STAGE, "data/offline-reference.json"));
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT, encoding: "utf8" });
  const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: REPOSITORY_ROOT, encoding: "utf8" });
  if (revision.status !== 0 || !/^[a-f0-9]{40}$/.test(revision.stdout.trim()) || dirty.status !== 0)
    throw new Error("DESKTOP_REFERENCE_GIT_STATE_UNAVAILABLE");
  const manifest = await createDesktopManifest(STAGE, { sourceRevision: revision.stdout.trim(), sourceDirty: Boolean(dirty.stdout.trim()),
    sourceHash: reference.sourceHash, sourceDate: reference.sourceDate });
  await writeFile(path.join(STAGE, MANIFEST_NAME), JSON.stringify(manifest));
  await validateDesktopStage(STAGE, manifest);
  console.log(`[desktop-reference] ${manifest.version}: ${manifest.assets.length} assets / ${manifest.totalBytes} bytes`);
} finally {
  await lock?.close();
  await rm(LOCK, { force: true });
}
