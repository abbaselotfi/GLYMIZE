import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectType2DecisionGraphMarket } from "../lib/type2-decision-graph-market";

const row = () => ({ productId: "source-1", generic: { canonicalName: "Testformin" },
  product: { availabilityStatus: "active", licenseStatus: "Active", dosageFormNormalized: "Tablet", strengthRaw: "500 mg", packageRaw: "30 tablets" },
  market: { nfiVerificationStatus: "nfi_verified", observedAt: "2026-08-01T00:00:00Z", nfiUrl: "https://irc.fda.gov.ir/nfi/source-1" } });
const project = (products: unknown[]) => projectType2DecisionGraphMarket({ schemaVersion: 2, kind: "glymize_clinician_market_index", products, insuranceRecords: [] } as never);

describe("R30-02-D1 strict clinical source projection", () => {
  it.each(["verified", "admin_override", "not_verified", "", null, 42])("rejects raw status %s", (status) => {
    const product = row();
    expect(project([{ ...product, market: { ...product.market, nfiVerificationStatus: status } }]).rejected.verification).toBe(1);
  });
  it.each([null, {}, { generic: null }, { ...row(), product: { packageRaw: 42 } }])("rejects malformed input without throwing", (product) => {
    expect(project([product])).toMatchObject({ products: [], rejected: { malformed: 1 } });
  });
  it.each([undefined, "", "yesterday", "2026-99-99T00:00:00Z"])("does not invent observedAt for %s", (observedAt) => {
    const product = row();
    expect(project([{ ...product, market: { ...product.market, observedAt } }])).toMatchObject({ products: [], rejected: { observation: 1 } });
  });
  it.each([undefined, "", "javascript:alert(1)", "https://user:password@example.test/"])("does not invent source evidence for %s", (nfiUrl) => {
    const product = row();
    expect(project([{ ...product, market: { ...product.market, nfiUrl } }])).toMatchObject({ products: [], rejected: { source: 1 } });
  });
  it("preserves unknown license and stale source, excludes unavailable without mutating input", () => {
    const missing = { ...row(), product: {}, market: { ...row().market, observedAt: "2020-01-01T00:00:00Z" } };
    const before = structuredClone(missing);
    const result = project([missing, { ...row(), product: { availabilityStatus: "unavailable" } }]);
    expect(result.rejected.unavailable).toBe(1);
    expect(result.products[0]?.licenseStatus).toBeUndefined();
    expect(result.products[0]?.observedAt).toBe("2020-01-01T00:00:00Z");
    expect(missing).toEqual(before);
  });
  it("projects the exact nonempty checked-in source ID set across all therapeutic areas", () => {
    const source = JSON.parse(readFileSync(new URL("../public/data/glymize-clinician-market-v2.json", import.meta.url), "utf8"));
    const result = projectType2DecisionGraphMarket(source);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.rejected).toEqual({ malformed: 0, verification: 0, unavailable: 0, observation: 0, source: 0 });
    expect(result.products.map((p) => p.id).sort()).toEqual(source.products.map((p: { productId: string }) => p.productId).sort());
    expect(result.products.some((p) => p.atcCode?.startsWith("C"))).toBe(true);
  });
});
