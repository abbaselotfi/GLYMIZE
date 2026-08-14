import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DATA = path.join(WEB_ROOT, "out", "data");
const MONOLITH = path.join(OUT_DATA, "glymize-clinician-market-v2.json");
const META = path.join(OUT_DATA, "glymize-clinician-market-v2.meta.json");
const MANIFEST = path.join(OUT_DATA, "glymize-clinician-market-v2.manifest.json");
const CHUNK_DIR_NAME = "glymize-clinician-market-v2-chunks";
const CHUNK_DIR = path.join(OUT_DATA, CHUNK_DIR_NAME);

const TARGET_BYTES = 18 * 1024 * 1024;
const PAGES_LIMIT_BYTES = 25 * 1024 * 1024;
const SECTIONS = ["products", "presentationSummaries", "insuranceRecords"];

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function splitItems(section, items) {
  const chunks = [];
  let current = [];
  let currentBytes = 2;

  for (const item of items) {
    const itemBytes = bytes(item);
    if (itemBytes + 2 >= TARGET_BYTES) {
      throw new Error(`market_chunk_single_item_too_large:${section}:${itemBytes}`);
    }

    const separatorBytes = current.length ? 1 : 0;
    if (current.length && currentBytes + separatorBytes + itemBytes > TARGET_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }

    current.push(item);
    currentBytes += (current.length > 1 ? 1 : 0) + itemBytes;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

async function writeJson(file, value) {
  const text = JSON.stringify(value);
  const size = Buffer.byteLength(text, "utf8");
  if (size >= PAGES_LIMIT_BYTES) {
    throw new Error(`market_static_asset_exceeds_pages_limit:${path.basename(file)}:${size}`);
  }
  await fs.writeFile(file, text, "utf8");
  return size;
}

async function walkFiles(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(full)));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

if (!(await exists(MONOLITH))) {
  console.log("[market-static] no exported monolithic market asset; splitter skipped");
  process.exit(0);
}

const raw = await fs.readFile(MONOLITH, "utf8");
const sourceBytes = Buffer.byteLength(raw, "utf8");
const deploymentSha256 = createHash("sha256").update(raw).digest("hex");
const root = JSON.parse(raw);

for (const section of SECTIONS) {
  if (!Array.isArray(root[section])) {
    throw new Error(`market_static_missing_array:${section}`);
  }
}

if (root.schemaVersion !== 2 || root.kind !== "glymize_clinician_market_index") {
  throw new Error("market_static_source_schema_invalid");
}
if (root.scopeMode !== "full_clinical_market") {
  throw new Error("market_static_source_scope_invalid");
}
if ((root.scope?.productCount ?? -1) !== root.products.length) {
  throw new Error("market_static_source_product_count_mismatch");
}

if (await exists(META)) {
  const meta = JSON.parse(await fs.readFile(META, "utf8"));
  if (
    typeof meta.deploymentSha256 === "string" &&
    meta.deploymentSha256.toLowerCase() !== deploymentSha256
  ) {
    throw new Error(
      `market_static_meta_sha_mismatch:${meta.deploymentSha256}:${deploymentSha256}`,
    );
  }
}

const header = {};
for (const [key, value] of Object.entries(root)) {
  if (!SECTIONS.includes(key)) header[key] = value;
}

await fs.rm(CHUNK_DIR, { recursive: true, force: true });
await fs.mkdir(CHUNK_DIR, { recursive: true });

const sections = {};
const counts = {};
let emittedChunkCount = 0;
let largestChunkBytes = 0;

for (const section of SECTIONS) {
  const chunks = splitItems(section, root[section]);
  sections[section] = [];
  counts[section] = root[section].length;

  for (let i = 0; i < chunks.length; i += 1) {
    const fileName = `${section}-${String(i).padStart(3, "0")}.json`;
    const payload = {
      schemaVersion: 1,
      kind: "glymize_clinician_market_chunk",
      section,
      items: chunks[i],
    };
    const fullPath = path.join(CHUNK_DIR, fileName);
    const size = await writeJson(fullPath, payload);
    largestChunkBytes = Math.max(largestChunkBytes, size);
    emittedChunkCount += 1;

    sections[section].push({
      file: `${CHUNK_DIR_NAME}/${fileName}`,
      count: chunks[i].length,
      bytes: size,
    });
  }
}

const manifest = {
  schemaVersion: 1,
  kind: "glymize_clinician_market_chunk_manifest",
  deploymentSha256,
  sourceBytes,
  targetChunkBytes: TARGET_BYTES,
  counts,
  header,
  sections,
};

const manifestBytes = await writeJson(MANIFEST, manifest);

// Delete only after every chunk + manifest has been written successfully.
await fs.rm(MONOLITH);

const outputFiles = await walkFiles(path.join(WEB_ROOT, "out"));
let maxOutputBytes = 0;
let maxOutputFile = "";

for (const file of outputFiles) {
  const size = (await fs.stat(file)).size;
  if (size > maxOutputBytes) {
    maxOutputBytes = size;
    maxOutputFile = path.relative(path.join(WEB_ROOT, "out"), file);
  }
  if (size >= PAGES_LIMIT_BYTES) {
    throw new Error(
      `pages_output_file_too_large:${path.relative(path.join(WEB_ROOT, "out"), file)}:${size}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      sourceBytes,
      deploymentSha256,
      manifestBytes,
      emittedChunkCount,
      largestChunkBytes,
      maxOutputBytes,
      maxOutputFile,
      counts,
      sections: Object.fromEntries(
        Object.entries(sections).map(([key, entries]) => [
          key,
          entries.map(({ file, count, bytes }) => ({ file, count, bytes })),
        ]),
      ),
    },
    null,
    2,
  ),
);