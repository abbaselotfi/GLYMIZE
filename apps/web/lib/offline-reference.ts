import { withBasePath } from "./base-path";

export type OfflineReferenceRow = { id: string; name: string; brand: string | null; form: string | null;
  strength: string | null; license: string | null; observation: string | null; sourceUrl: string | null };
export type OfflineReference = { schemaVersion: 1; profile: "reference-lite"; sourceHash: string; sourceDate: string; rows: OfflineReferenceRow[] };
export type DesktopReferenceManifest = { schemaVersion: 1; profile: "desktop-reference"; version: string;
  sourceRevision: string; sourceDirty: boolean; sourceHash: string; sourceDate: string; totalBytes: number;
  assets: { path: string; bytes: number; sha256: string }[] };
const rowKeys = ["id", "name", "brand", "form", "strength", "license", "observation", "sourceUrl"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseOfflineReference(value: unknown): OfflineReference {
  if (!record(value) || Object.keys(value).sort().join() !== ["schemaVersion", "profile", "sourceHash", "sourceDate", "rows"].sort().join()
    || value.schemaVersion !== 1 || value.profile !== "reference-lite"
    || typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceHash)
    || typeof value.sourceDate !== "string" || !Number.isFinite(Date.parse(value.sourceDate))
    || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 20000) throw new Error("OFFLINE_REFERENCE_INVALID");
  const ids = new Set<string>();
  for (const row of value.rows) {
    if (!record(row) || Object.keys(row).sort().join() !== [...rowKeys].sort().join()
      || !rowKeys.every((key) => row[key] === null || (typeof row[key] === "string" && row[key].length <= 2000))
      || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)
      || typeof row.name !== "string" || !row.name.trim()) throw new Error("OFFLINE_REFERENCE_ROW_INVALID");
    ids.add(row.id);
    if (row.sourceUrl !== null) {
      const url = new URL(row.sourceUrl as string);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("OFFLINE_REFERENCE_URL_INVALID");
    }
  }
  return value as OfflineReference;
}

export async function loadOfflineReference(signal: AbortSignal) {
  const response = await fetch(withBasePath("/data/offline-reference.json"), {
    signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
  });
  if (!response.ok || !response.body) throw new Error("OFFLINE_REFERENCE_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 6 * 1024 * 1024) throw new Error("OFFLINE_REFERENCE_TOO_LARGE");
      chunks.push(next.value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return { data: parseOfflineReference(JSON.parse(new TextDecoder().decode(joined))),
    bundleVersion: response.headers.get("x-glymize-offline-version") };
}

export function parseDesktopReferenceManifest(value: unknown): DesktopReferenceManifest {
  const keys = ["schemaVersion", "profile", "version", "sourceRevision", "sourceDirty", "sourceHash", "sourceDate", "totalBytes", "assets"];
  if (!record(value) || Object.keys(value).sort().join() !== keys.sort().join()
    || value.schemaVersion !== 1 || value.profile !== "desktop-reference"
    || typeof value.version !== "string" || !/^[a-f0-9]{24}$/.test(value.version)
    || typeof value.sourceRevision !== "string" || !/^[a-f0-9]{40}$/.test(value.sourceRevision)
    || typeof value.sourceDirty !== "boolean"
    || typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceHash)
    || typeof value.sourceDate !== "string" || !Number.isFinite(Date.parse(value.sourceDate))
    || typeof value.totalBytes !== "number" || !Number.isSafeInteger(value.totalBytes) || value.totalBytes <= 0
    || !Array.isArray(value.assets) || !value.assets.length || value.assets.length > 500) throw new Error("DESKTOP_REFERENCE_MANIFEST_INVALID");
  const paths = new Set<string>();
  for (const asset of value.assets) {
    if (!record(asset) || Object.keys(asset).sort().join() !== ["path", "bytes", "sha256"].sort().join()
      || typeof asset.path !== "string" || !/^(?:offline\/index\.html|data\/offline-reference\.json|_next\/static\/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+\.(?:png|svg|ico))$/.test(asset.path)
      || asset.path.includes("..") || paths.has(asset.path)
      || typeof asset.bytes !== "number" || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0
      || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("DESKTOP_REFERENCE_ASSET_INVALID");
    paths.add(asset.path);
  }
  return value as DesktopReferenceManifest;
}

export async function loadDesktopReference(signal: AbortSignal) {
  const manifestResponse = await fetch(withBasePath("/desktop-reference-manifest.json"), {
    signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store",
  });
  if (!manifestResponse.ok) throw new Error("DESKTOP_REFERENCE_MANIFEST_UNAVAILABLE");
  const length = Number(manifestResponse.headers.get("content-length") ?? 0);
  if (length > 256 * 1024) throw new Error("DESKTOP_REFERENCE_MANIFEST_TOO_LARGE");
  const manifest = parseDesktopReferenceManifest(await manifestResponse.json());
  const loaded = await loadOfflineReference(signal);
  if (loaded.data.sourceHash !== manifest.sourceHash || loaded.data.sourceDate !== manifest.sourceDate)
    throw new Error("DESKTOP_REFERENCE_SOURCE_MISMATCH");
  return { ...loaded, bundleVersion: manifest.version, desktopManifest: manifest };
}

export function searchOfflineReferences(rows: readonly OfflineReferenceRow[], query: string, page: number) {
  const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase().replaceAll("ي", "ی").replaceAll("ك", "ک");
  const needle = normalize(query.trim().slice(0, 160));
  const matches = needle ? rows.filter((row) => normalize(`${row.name} ${row.brand ?? ""} ${row.id}`).includes(needle)) : rows;
  const pages = Math.max(1, Math.ceil(matches.length / 30));
  const current = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
  return { rows: matches.slice(current * 30, (current + 1) * 30), count: matches.length, pages, current };
}
