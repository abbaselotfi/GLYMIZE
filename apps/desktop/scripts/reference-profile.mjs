import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const MANIFEST_NAME = "desktop-reference-manifest.json";
const PATH_ALLOWLIST = /^(?:offline\/index\.html|data\/offline-reference\.json|_next\/static\/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+\.(?:png|svg|ico))$/;
const FORBIDDEN_TEXT = /(?:runtime-api|admin-catalog|claim-policy|NEXT_PUBLIC_(?:RUNTIME|ADMIN)_API_URL|GLYMIZE_RUNTIME_PROXY_UPSTREAM)/;

export function assertSafeRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/")
    || value.split("/").some((part) => part === "" || part === "." || part === "..")
    || !PATH_ALLOWLIST.test(value)) throw new Error(`DESKTOP_REFERENCE_PATH_REJECTED:${value}`);
  return value;
}

export function assertUniqueCaseInsensitive(paths) {
  const seen = new Set();
  for (const value of paths) {
    const folded = value.toLocaleLowerCase("en-US");
    if (seen.has(folded)) throw new Error(`DESKTOP_REFERENCE_CASE_COLLISION:${value}`);
    seen.add(folded);
  }
}

export async function walkRegularFiles(root, prefix = "") {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const info = await lstat(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error(`DESKTOP_REFERENCE_SYMLINK_REJECTED:${relative}`);
    if (info.isDirectory()) files.push(...await walkRegularFiles(root, relative));
    else if (info.isFile()) files.push(relative);
    else throw new Error(`DESKTOP_REFERENCE_NON_FILE_REJECTED:${relative}`);
  }
  return files.sort();
}

async function digestFile(filename) {
  const bytes = await readFile(filename);
  return { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function createDesktopManifest(stageRoot, metadata) {
  const paths = (await walkRegularFiles(stageRoot)).filter((value) => value !== MANIFEST_NAME);
  paths.forEach(assertSafeRelativePath);
  assertUniqueCaseInsensitive(paths);
  const assets = [];
  let totalBytes = 0;
  for (const assetPath of paths) {
    const digest = await digestFile(path.join(stageRoot, assetPath));
    if (digest.bytes <= 0 || digest.bytes >= 25 * 1024 * 1024) throw new Error(`DESKTOP_REFERENCE_ASSET_SIZE_REJECTED:${assetPath}`);
    totalBytes += digest.bytes;
    assets.push({ path: assetPath, ...digest });
  }
  if (totalBytes > 128 * 1024 * 1024) throw new Error("DESKTOP_REFERENCE_BUDGET_EXCEEDED");
  const basis = { schemaVersion: 1, profile: "desktop-reference", ...metadata, totalBytes, assets };
  const version = createHash("sha256").update(JSON.stringify(basis)).digest("hex").slice(0, 24);
  return { schemaVersion: 1, profile: "desktop-reference", version, ...metadata, totalBytes, assets };
}

export async function validateDesktopStage(stageRoot, manifest) {
  const files = await walkRegularFiles(stageRoot);
  const expected = [...manifest.assets.map((asset) => asset.path), MANIFEST_NAME].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error("DESKTOP_REFERENCE_FILE_SET_MISMATCH");
  assertUniqueCaseInsensitive(files);
  let totalBytes = 0;
  for (const asset of manifest.assets) {
    assertSafeRelativePath(asset.path);
    const digest = await digestFile(path.join(stageRoot, asset.path));
    if (digest.bytes !== asset.bytes || digest.sha256 !== asset.sha256) throw new Error(`DESKTOP_REFERENCE_HASH_MISMATCH:${asset.path}`);
    totalBytes += digest.bytes;
    if (/\.(?:html|js|css)$/i.test(asset.path)) {
      const text = await readFile(path.join(stageRoot, asset.path), "utf8");
      if (FORBIDDEN_TEXT.test(text)) throw new Error(`DESKTOP_REFERENCE_FORBIDDEN_TEXT:${asset.path}`);
    }
  }
  if (totalBytes !== manifest.totalBytes) throw new Error("DESKTOP_REFERENCE_TOTAL_SIZE_MISMATCH");
  const reference = JSON.parse(await readFile(path.join(stageRoot, "data/offline-reference.json"), "utf8"));
  if (reference.profile !== "reference-lite" || reference.sourceHash !== manifest.sourceHash
    || reference.sourceDate !== manifest.sourceDate) throw new Error("DESKTOP_REFERENCE_SOURCE_MISMATCH");
  return true;
}
