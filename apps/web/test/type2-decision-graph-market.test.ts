import { afterEach, describe, expect, it, vi } from "vitest";
import { loadType2DecisionGraphMarketProducts } from "../lib/type2-decision-graph-market";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Decision Graph Iranian market provenance", () => {
  it("preserves NFI brand/price evidence and insurer source evidence", async () => {
    const marketIndex = {
      schemaVersion: 2,
      kind: "glymize_clinician_market_index",
      products: [
        {
          productId: "iran-losartan-50-1",
          generic: {
            canonicalName: "Losartan",
            genericRegistryCode: "12345",
          },
          product: {
            brandName: "Source Brand",
            brandRegistryCode: "BR-123",
            ircCode: "IRC-123",
            dosageFormNormalized: "Tablet",
            route: "oral",
            strengthRaw: "50 mg",
            packageRaw: "30 tablets",
            manufacturerName: "Source Manufacturer",
            licenseStatus: "Active",
            availabilityStatus: "active",
          },
          market: {
            nfiVerificationStatus: "verified",
            nfiUrl: "https://irc.fda.gov.ir/nfi/source-product",
            observedAt: "2026-08-08T00:00:00.000Z",
          },
          price: {
            amountToman: 123000,
            rawAmount: 1230000,
            rawCurrency: "IRR",
            observedAt: "2026-08-08T00:00:00.000Z",
          },
        },
      ],
      insuranceRecords: [
        {
          insuranceRecordId: "ihio-losartan-12345",
          provider: "health_insurance",
          genericCode: "12345",
          rawPercent: 82.5,
          rawPercentKind: "organization_percent",
          rawPercentBasis: "accepted_price",
          normalizedInsurerCoveragePercent: 82.5,
          normalizedPatientSharePercent: 17.5,
          normalizedPercentDerived: false,
          observedAt: "2026-08-08T00:00:00.000Z",
          sourceUrl: "https://mdp.ihio.gov.ir/",
          match: {
            status: "matched",
            matchedGenericRegistryCode: "12345",
          },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(marketIndex), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const [product] = await loadType2DecisionGraphMarketProducts();

    expect(product?.genericName).toBe("Losartan");
    expect(product?.brandName).toBe("Source Brand");
    expect(product?.sourceUrl).toBe("https://irc.fda.gov.ir/nfi/source-product");
    expect(product?.sourceReference).toBe("iran-losartan-50-1");
    expect(product?.price).toMatchObject({
      amountToman: 123000,
      sourceAmount: 1230000,
      sourceCurrency: "IRR",
      sourceUrl: "https://irc.fda.gov.ir/nfi/source-product",
      sourceReference: "iran-losartan-50-1",
    });
    expect(product?.insuranceCoverages).toEqual([
      expect.objectContaining({
        provider: "health_insurance",
        percent: 82.5,
        origin: "source",
        genericCode: "12345",
        sourceUrl: "https://mdp.ihio.gov.ir/",
        sourceReference: "ihio-losartan-12345",
        sourcePercent: 82.5,
      }),
    ]);
  });
});
