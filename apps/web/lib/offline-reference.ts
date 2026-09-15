import { withBasePath } from "./base-path";

export type OfflineReferenceRow = { id: string; name: string; brand: string | null; form: string | null;
  strength: string | null; license: string | null; observation: string | null; sourceUrl: string | null };
export type OfflineReference = { schemaVersion: 1; profile: "reference-lite"; sourceHash: string; sourceDate: string; rows: OfflineReferenceRow[] };
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

export function searchOfflineReferences(rows: readonly OfflineReferenceRow[], query: string, page: number) {
  const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase().replaceAll("ي", "ی").replaceAll("ك", "ک");
  const needle = normalize(query.trim().slice(0, 160));
  const matches = needle ? rows.filter((row) => normalize(`${row.name} ${row.brand ?? ""} ${row.id}`).includes(needle)) : rows;
  const pages = Math.max(1, Math.ceil(matches.length / 30));
  const current = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
  return { rows: matches.slice(current * 30, (current + 1) * 30), count: matches.length, pages, current };
}
