import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/type2-claim-policy-runtime", () => ({ initializeTrustedType2ClaimPolicyRuntime: vi.fn(async () => {}) }));

const sha = "a".repeat(64);
const sections = ["products", "presentationSummaries", "insuranceRecords"] as const;
function fixture() {
  return {
    schemaVersion: 2, kind: "glymize_clinician_market_index", scopeMode: "full_clinical_market",
    scope: { productCount: 2 },
    runtimeIntegrity: { productRetentionPercent: 100, canonicalProductCount: 2, runtimeProductCount: 2 },
    sourceCalculationValidation: { packageDerivationErrorCount: 0, insulinProductsCount: 0, insulinProductsWithResolvedTotalUnitsPerPackageCount: 0 },
    products: ["A10BA02", "C09CA01"].map((atcCode, index) => ({
      productId: `p${index}`, generic: { canonicalName: `Drug ${index}`, genericRegistryCode: `g${index}` },
      product: { atcCode, availabilityStatus: "active", strengthRaw: "50 mg", unitsPerPackage: 30, unitType: "tablet" },
      market: { nfiVerificationStatus: "nfi_verified", observedAt: "2026-09-12T00:00:00Z", nfiUrl: "https://irc.fda.gov.ir/nfi" },
      price: { amountToman: 100, rawAmount: 1000, rawCurrency: "IRR" },
    })),
    presentationSummaries: [], insuranceRecords: [],
  };
}
function serve(index = fixture(), chunked = true) {
  const { products, presentationSummaries, insuranceRecords, ...header } = index;
  const values = { products, presentationSummaries, insuranceRecords };
  const manifest = {
    schemaVersion: 1, kind: "glymize_clinician_market_chunk_manifest", deploymentSha256: sha, header,
    counts: Object.fromEntries(sections.map((s) => [s, values[s].length])),
    sections: Object.fromEntries(sections.map((s) => [s, [{ file: `glymize-clinician-market-v2-chunks/${s}-000.json`, count: values[s].length, bytes: 1 }]])),
  };
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input, "https://fixture.test");
    if (url.pathname.endsWith(".meta.json")) return Response.json({ schemaVersion: 1, runtimeSchemaVersion: 2, kind: "glymize_clinician_market_deployment_meta", deploymentSha256: sha });
    if (url.pathname.endsWith(".manifest.json")) return chunked ? Response.json(manifest) : new Response(null, { status: 404 });
    for (const section of sections) {
      if (url.pathname.endsWith(`${section}-000.json`)) return Response.json({ schemaVersion: 1, kind: "glymize_clinician_market_chunk", section, items: values[section] });
    }
    if (url.pathname.endsWith("glymize-clinician-market-v2.json")) return Response.json(index);
    throw new Error("unexpected_test_url");
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, manifest };
}
beforeEach(() => { vi.resetModules(); vi.stubGlobal("window", {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared validated market transport", () => {
  it("deduplicates concurrent consumers and preserves monolith/chunk projection equality", async () => {
    const { fetcher } = serve();
    const a = await import("../lib/clinician-market-v2");
    const b = await import("../lib/type2-decision-graph-market");
    const [, chunkProducts, raw] = await Promise.all([a.loadClinicianMarketV2(), b.loadType2DecisionGraphMarketProducts(), a.loadValidatedClinicianMarketIndex()]);
    expect(raw.products).toHaveLength(2);
    expect(chunkProducts).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(5);
    await b.loadType2DecisionGraphMarketProducts();
    expect(fetcher).toHaveBeenCalledTimes(5);
    vi.resetModules();
    serve(fixture(), false);
    const mono = await import("../lib/type2-decision-graph-market");
    expect(await mono.loadType2DecisionGraphMarketProducts()).toEqual(chunkProducts);
  });

  it.each([401, 500])("does not fall back on manifest HTTP %s and allows retry", async (status) => {
    const { fetcher } = serve();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    fetcher.mockResolvedValueOnce(new Response(null, { status }));
    const { loadValidatedClinicianMarketIndex } = await import("../lib/clinician-market-v2");
    await expect(loadValidatedClinicianMarketIndex()).rejects.toThrow(`manifest_http_${status}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await loadValidatedClinicianMarketIndex()).products).toHaveLength(2);
  });

  it("rejects mismatched versions and corrupt chunks without a monolith request", async () => {
    const { manifest, fetcher } = serve();
    manifest.deploymentSha256 = "b".repeat(64);
    const { loadValidatedClinicianMarketIndex } = await import("../lib/clinician-market-v2");
    await expect(loadValidatedClinicianMarketIndex()).rejects.toThrow("manifest_version_mismatch");
    manifest.deploymentSha256 = sha;
    manifest.sections.products![0]!.count = 999;
    await expect(loadValidatedClinicianMarketIndex()).rejects.toThrow("chunk_invalid:products");
    expect(fetcher.mock.calls.some(([url]) => new URL(url, "https://fixture.test").pathname.endsWith("/glymize-clinician-market-v2.json"))).toBe(false);
  });

  it("keeps semantic, retention and package gates before publication", async () => {
    const data = fixture();
    data.runtimeIntegrity.productRetentionPercent = 99;
    serve(data);
    const { loadValidatedClinicianMarketIndex } = await import("../lib/clinician-market-v2");
    await expect(loadValidatedClinicianMarketIndex()).rejects.toThrow("retention_gate_failed");
    data.runtimeIntegrity.productRetentionPercent = 100;
    data.sourceCalculationValidation.packageDerivationErrorCount = 1;
    await expect(loadValidatedClinicianMarketIndex()).rejects.toThrow("package_derivation_gate_failed");
    data.sourceCalculationValidation.packageDerivationErrorCount = 0;
    expect((await loadValidatedClinicianMarketIndex()).products).toHaveLength(2);
  });

  it.skipIf(!existsSync(new URL("../out/data/glymize-clinician-market-v2.manifest.json", import.meta.url)))("loads actual exported split data and preserves source projection", async () => {
    const fetcher = vi.fn(async (input: string) => {
      const name = new URL(input, "https://fixture.test").pathname.replace(/^\/data\//, "");
      return new Response(readFileSync(new URL(`../out/data/${name}`, import.meta.url)), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const b = await import("../lib/type2-decision-graph-market");
    const chunkProducts = await b.loadType2DecisionGraphMarketProducts();
    expect(fetcher.mock.calls.some(([url]) => url.includes("-chunks/"))).toBe(true);
    vi.resetModules();
    const source = JSON.parse(readFileSync(new URL("../public/data/glymize-clinician-market-v2.json", import.meta.url), "utf8"));
    serve(source, false);
    const mono = await import("../lib/type2-decision-graph-market");
    expect(await mono.loadType2DecisionGraphMarketProducts()).toEqual(chunkProducts);
    expect(source.products.length).toBeGreaterThan(0);
    expect(chunkProducts.length).toBeGreaterThan(0);
    const expectedIds = source.products.filter((p: { productId: string; product: { availabilityStatus: string }; market: { nfiVerificationStatus: string; observedAt: string; nfiUrl: string } }) =>
      p.market.nfiVerificationStatus === "nfi_verified" && p.product.availabilityStatus !== "unavailable"
      && Number.isFinite(Date.parse(p.market.observedAt)) && p.market.nfiUrl.startsWith("https://")
    ).map((p: { productId: string }) => p.productId).sort();
    expect(chunkProducts.map((p) => p.id).sort()).toEqual(expectedIds);
  }, 20000); // Full real-data transport/projection (~30 MiB), not a small unit fixture.
});
