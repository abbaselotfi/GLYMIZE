import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { loadDesktopReference, loadOfflineReference, parseDesktopReferenceManifest, parseOfflineReference, searchOfflineReferences } from "../lib/offline-reference";

const projectorUrl = new URL("../scripts/offline-reference-projection.mjs", import.meta.url).href;
const { projectOfflineReference } = await import(projectorUrl);
const source = { schemaVersion: 2, kind: "glymize_clinician_market_index", authorId: "secret-author", notifications: ["secret"],
  products: [{ productId: "ref-1", generic: { canonicalName: "Testformin" }, product: { brandName: "تست", privateNote: "secret" }, market: { nfiUrl: "https://irc.fda.gov.ir/nfi/1" } }] };
const fixture = () => projectOfflineReference(source, "a".repeat(64), "2026-08-12T00:00:00Z");
afterEach(() => vi.unstubAllGlobals());
describe("standalone P0 reference boundary", () => {
  it("uses an allowlist, retaining unknowns and excluding metadata", () => {
    const projected = fixture();
    expect(parseOfflineReference(projected)).toEqual(projected);
    expect(JSON.stringify(projected)).not.toMatch(/secret|author|notifications|privateNote/);
    expect(projected.rows[0].license).toBeNull();
    expect(projected.rows[0].observation).toBeNull();
  });
  it("rejects wrong profiles, injected fields, duplicate IDs and unsafe links", () => {
    for (const value of [{ ...fixture(), profile: "clinical" }, { ...fixture(), updatedBy: "admin" },
      { ...fixture(), rows: [{ ...fixture().rows[0], patient: "secret" }] },
      { ...fixture(), rows: [fixture().rows[0], fixture().rows[0]] },
      { ...fixture(), rows: [{ ...fixture().rows[0], sourceUrl: "javascript:alert(1)" }] }]) {
      expect(() => parseOfflineReference(value)).toThrow();
    }
  });
  it("fetches only the projected file with no credentials and ignores draft storage", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("draft_read_forbidden"); } });
    const fetch = vi.fn(async () => Response.json(fixture(), { headers: { "x-glymize-offline-version": "bundle-1" } }));
    vi.stubGlobal("fetch", fetch);
    const result = await loadOfflineReference(new AbortController().signal);
    expect(result.bundleVersion).toBe("bundle-1");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/data/offline-reference.json", expect.objectContaining({ credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }));
  });
  it("bounds search rendering to 30 rows without changing source", () => {
    const rows = Array.from({ length: 75 }, (_, i) => ({ ...fixture().rows[0], id: `ref-${i}` }));
    expect(searchOfflineReferences(rows, "testformin", 0).rows).toHaveLength(30);
    expect(searchOfflineReferences(rows, "", 99)).toMatchObject({ pages: 3, current: 2 });
    expect(searchOfflineReferences(rows, "missing", 0).count).toBe(0);
    expect(rows).toHaveLength(75);
  });
  it("rejects oversized and unavailable responses without returning partial data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(6 * 1024 * 1024 + 1))));
    await expect(loadOfflineReference(new AbortController().signal)).rejects.toThrow("OFFLINE_REFERENCE_TOO_LARGE");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(loadOfflineReference(new AbortController().signal)).rejects.toThrow("OFFLINE_REFERENCE_UNAVAILABLE");
  });
  it("binds a desktop package manifest to the exact projected source", async () => {
    const projected = fixture();
    const manifest = { schemaVersion: 1, profile: "desktop-reference", version: "b".repeat(24),
      sourceRevision: "c".repeat(40), sourceDirty: false, sourceHash: projected.sourceHash,
      sourceDate: projected.sourceDate, totalBytes: 123, assets: [{ path: "offline/index.html", bytes: 123, sha256: "d".repeat(64) }] };
    expect(parseDesktopReferenceManifest(manifest)).toEqual(manifest);
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(projected));
    vi.stubGlobal("fetch", fetch);
    const loaded = await loadDesktopReference(new AbortController().signal);
    expect(loaded.bundleVersion).toBe(manifest.version);
    expect(fetch).toHaveBeenNthCalledWith(1, "/desktop-reference-manifest.json", expect.objectContaining({ credentials: "omit", cache: "no-store" }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/data/offline-reference.json", expect.objectContaining({ credentials: "omit" }));
  });
  it("rejects malformed desktop manifests and mismatched projected sources", async () => {
    const projected = fixture();
    const manifest = { schemaVersion: 1, profile: "desktop-reference", version: "b".repeat(24),
      sourceRevision: "c".repeat(40), sourceDirty: false, sourceHash: "e".repeat(64),
      sourceDate: projected.sourceDate, totalBytes: 123, assets: [{ path: "offline/index.html", bytes: 123, sha256: "d".repeat(64) }] };
    expect(() => parseDesktopReferenceManifest({ ...manifest, remoteApi: "https://example.test" })).toThrow();
    expect(() => parseDesktopReferenceManifest({ ...manifest, assets: [{ ...manifest.assets[0], path: "admin/index.html" }] })).toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(Response.json(projected)));
    await expect(loadDesktopReference(new AbortController().signal)).rejects.toThrow("DESKTOP_REFERENCE_SOURCE_MISMATCH");
  });
  it("keeps auth, draft, engine and patient APIs out of the dedicated source surface", () => {
    const page = readFileSync(new URL("../app/offline/page.tsx", import.meta.url), "utf8");
    const loader = readFileSync(new URL("../lib/offline-reference.ts", import.meta.url), "utf8");
    expect(page + loader).not.toMatch(/api-client|browser-catalog-state|runtime-auth|claim-policy-runtime|configureType2|localStorage|sessionStorage|URLSearchParams/);
    const shell = readFileSync(new URL("../app/components/route-aware-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain('pathname === "/offline" || pathname === "/offline/"');
    expect(shell).not.toContain('startsWith("/offline');
  });
});
