import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeOfflineReference } from "./offline-reference-projection.mjs";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = ["index.html", "offline/index.html"];
const MAX_BYTES = 128 * 1024 * 1024;
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function filesBelow(root, prefix = "") {
  let entries;
  try {
    entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("OFFLINE_SYMLINK_NOT_ALLOWED");
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await filesBelow(root, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

export async function writeOfflineBundle(outputDir, basePath = "") {
  if (basePath && !/^\/[A-Za-z0-9_-]+$/.test(basePath))
    throw new Error("OFFLINE_BASE_PATH_INVALID");
  const root = path.resolve(outputDir);
  const candidates = [
    ...SHELL,
    "data/offline-reference.json",
    ...(await filesBelow(root, "_next/static")).filter((f) =>
      /\.(js|css|woff2?|ttf|otf|png|svg|webp)$/.test(f)
      && (!f.startsWith("_next/static/chunks/app/") || /^_next\/static\/chunks\/app\/(layout|page|offline\/page)-[^/]+\.js$/.test(f)),
    ),
    ...(await filesBelow(root, "brand")).filter((f) => /\.(png|svg|webp)$/.test(f)),
    "icon-192.png",
    "icon-512.png",
  ];
  // Build-time public assets only, never patient/admin route discovery.
  const assets = [];
  let totalBytes = 0;
  for (const file of [...new Set(candidates)].sort()) {
    const source = path.join(root, file);
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink())
      throw new Error("OFFLINE_SOURCE_NOT_REGULAR_FILE");
    const size = sourceStat.size;
    totalBytes += size;
    if (size >= 25 * 1024 * 1024 || totalBytes > MAX_BYTES)
      throw new Error("OFFLINE_BUNDLE_BUDGET_EXCEEDED");
    const hash = digest(await readFile(source));
    const pathname = `${basePath}/${file.endsWith("index.html") ? file.slice(0, -10) : file}`;
    assets.push({ path: pathname, file, sha256: hash, bytes: size });
  }
  const template = await readFile(path.join(WEB_ROOT, "scripts/offline-sw-template.js"), "utf8");
  if (!template.includes("/* OFFLINE_BUNDLE */ null"))
    throw new Error("OFFLINE_TEMPLATE_MARKER_MISSING");
  const version = digest(JSON.stringify({ basePath, assets, template })).slice(0, 24);
  const snapshotDir = path.join(root, "_offline", version);
  await mkdir(snapshotDir, { recursive: true });
  for (const asset of assets) {
    const name = `${asset.sha256}${path.extname(asset.file)}`;
    asset.snapshot = `${basePath}/_offline/${version}/${name}`;
    await writeFile(path.join(snapshotDir, name), await readFile(path.join(root, asset.file)));
  }
  const manifest = {
    schemaVersion: 1,
    profile: "reference-lite",
    version,
    basePath,
    totalBytes,
    assets: assets.map(({ file, ...asset }) => asset),
  };
  await writeFile(
    path.join(root, "sw.js"),
    template.replace("/* OFFLINE_BUNDLE */ null", JSON.stringify(manifest)),
  );
  await writeFile(path.join(root, "offline-bundle.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "version.json"), JSON.stringify({ version }));
  const headersPath = path.join(root, "_headers");
  let headers = "";
  try {
    headers = await readFile(headersPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  headers = headers.replace(/# GLYMIZE_OFFLINE_BEGIN[\s\S]*?# GLYMIZE_OFFLINE_END\n?/g, "");
  headers += `\n# GLYMIZE_OFFLINE_BEGIN\n${basePath}/_offline/*\n  Cache-Control: public, max-age=31536000, immutable\n${basePath}/sw.js\n  Cache-Control: no-cache\n${basePath}/version.json\n  Cache-Control: no-cache\n${basePath}/offline-bundle.json\n  Cache-Control: no-cache\n# GLYMIZE_OFFLINE_END\n`;
  await writeFile(headersPath, headers);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (
    process.env.GITHUB_PAGES !== "true" ||
    process.env.GLYMIZE_OFFLINE_BUNDLE_ENABLED !== "true"
  ) {
    console.log(
      "[offline-bundle] requires static export and explicit GLYMIZE_OFFLINE_BUNDLE_ENABLED=true; skipped",
    );
  } else {
    const base =
      process.env.GITHUB_PAGES_CUSTOM_DOMAIN === "true"
        ? ""
        : `/${process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "GLYMIZE"}`;
    await writeOfflineReference(path.join(WEB_ROOT, "out"));
    const manifest = await writeOfflineBundle(path.join(WEB_ROOT, "out"), base);
    console.log(
      `[offline-bundle] ${manifest.version}: ${manifest.assets.length} public assets / ${manifest.totalBytes} bytes`,
    );
  }
}
