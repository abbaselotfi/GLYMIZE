import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = (value) => typeof value === "string" && value.length <= 2000 ? value : null;
export function projectOfflineReference(source, sourceHash, sourceDate) {
  if (source?.schemaVersion !== 2 || source.kind !== "glymize_clinician_market_index"
    || !Array.isArray(source.products) || !/^[a-f0-9]{64}$/.test(sourceHash)
    || typeof sourceDate !== "string" || !Number.isFinite(Date.parse(sourceDate))) throw new Error("OFFLINE_REFERENCE_SOURCE_INVALID");
  const seen = new Set();
  const rows = source.products.map((row) => {
    if (!text(row?.productId) || seen.has(row.productId) || !text(row?.generic?.canonicalName)) throw new Error("OFFLINE_REFERENCE_IDENTITY_INVALID");
    seen.add(row.productId);
    let sourceUrl = null;
    try {
      const url = new URL(row.market?.nfiUrl);
      if (url.protocol === "https:" && !url.username && !url.password) sourceUrl = text(url.href);
    } catch { /* Unknown source is shown as unknown, never fabricated. */ }
    // Explicit P0 display fields only. No raw spreads, author, draft or clinical authority.
    return { id: row.productId, name: row.generic.canonicalName,
      brand: text(row.product?.brandName), form: text(row.product?.dosageFormNormalized),
      strength: text(row.product?.strengthRaw), license: text(row.product?.licenseStatus),
      observation: text(row.market?.observedAt), sourceUrl };
  });
  return { schemaVersion: 1, profile: "reference-lite", sourceHash, sourceDate, rows };
}

export async function writeOfflineReference(outputDir) {
  // Reuse the authoritative full-market validation before deriving distributable fields.
  const validation = spawnSync(process.execPath, [path.join(webRoot, "scripts/validate-market-v2.mjs")], { cwd: path.resolve(webRoot, "../.."), encoding: "utf8" });
  if (validation.error || validation.status !== 0) throw new Error("OFFLINE_REFERENCE_VALIDATION_FAILED", { cause: validation.error ?? validation.stderr });
  const bytes = await readFile(path.join(webRoot, "public/data/glymize-clinician-market-v2.json"));
  const meta = JSON.parse(await readFile(path.join(webRoot, "public/data/glymize-clinician-market-v2.meta.json"), "utf8"));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== meta.deploymentSha256) throw new Error("OFFLINE_REFERENCE_SOURCE_HASH_MISMATCH");
  const projection = projectOfflineReference(JSON.parse(bytes), hash, meta.sourceGeneratedAt);
  await mkdir(path.join(outputDir, "data"), { recursive: true });
  await writeFile(path.join(outputDir, "data/offline-reference.json"), JSON.stringify(projection));
  return projection;
}
