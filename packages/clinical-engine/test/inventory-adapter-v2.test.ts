import { describe, expect, it } from "vitest";
import type { IranMarketDrugProduct, MasterDrugRegistryEntry } from "@glymize/contracts";
import { assessIranAvailabilityV2, buildDecisionGraphInventoryFromContractsV2, generateRegimenCandidatesV2 } from "../src/index.js";

const master: MasterDrugRegistryEntry = {
  id: "WD-1000",
  canonicalName: "Testformin",
  persianName: "تست‌فورمین",
  searchSynonyms: ["Testformin HCl"],
  combination: false,
  therapeuticAreas: ["Diabetes"],
  drugClass: "Biguanide",
  primaryIndications: ["Type 2 diabetes"],
  guidelineRole: "High efficacy glucose lowering",
  diabetesOrPhenotype: "T2D",
  clinicalEffects: [],
  sourceCodes: ["ADA9-2026"],
  sourceUrls: ["https://example.test/ada"],
  reviewState: "approved",
};

function product(overrides: Partial<IranMarketDrugProduct> = {}): IranMarketDrugProduct {
  return {
    id: "nfi-1",
    masterDrugId: "WD-1000",
    genericName: "Testformin",
    brandName: "Testbrand",
    dosageForm: "Tablet",
    strengthPresentation: "500 mg",
    packagePresentation: "30 tablets",
    route: "oral",
    licenseStatus: "Active",
    licenseValidUntilJalali: "1405/12/29",
    price: { amountToman: 120000, priceKind: "consumer_retail" },
    insuranceCoverages: [{ provider: "health_insurance", percent: 69.6, referencePriceToman: 100000 }],
    sourceUrl: "https://nfi.example.test/item/1",
    sourceReference: "Iran NFI",
    observedAt: "2026-08-01T00:00:00.000Z",
    matchConfidence: 99,
    ...overrides,
  };
}

describe("Decision Graph V2 contract inventory adapter", () => {
  it("requires WorldDrug and a verified NFI relationship for current-market eligibility", () => {
    const built = buildDecisionGraphInventoryFromContractsV2({
      masterRegistry: [master],
      marketProducts: [product()],
      policy: { asOf: new Date("2026-08-08T00:00:00.000Z") },
    });
    expect(built.report.verifiedMarketProducts).toBe(1);
    const medication = built.inventory.knowledge[0]!;
    const availability = assessIranAvailabilityV2(medication, built.inventory.marketProducts);
    expect(availability.classification).toBe("current_market");
    expect(availability.mainRecommendationEligible).toBe(true);
  });

  it("keeps a WorldDrug-only medicine out of Iran recommendations", () => {
    const built = buildDecisionGraphInventoryFromContractsV2({ masterRegistry: [master], marketProducts: [] });
    const availability = assessIranAvailabilityV2(built.inventory.knowledge[0]!, built.inventory.marketProducts);
    expect(availability.classification).toBe("excluded_never_licensed");
    expect(availability.mainRecommendationEligible).toBe(false);
  });

  it("places an expired historically licensed product in historical-only rather than Top Recommendations", () => {
    const built = buildDecisionGraphInventoryFromContractsV2({
      masterRegistry: [master],
      marketProducts: [product({ licenseStatus: "Expired", licenseValidUntilJalali: "1403/01/01", observedAt: "2024-01-01T00:00:00.000Z" })],
      policy: { asOf: new Date("2026-08-08T00:00:00.000Z") },
    });
    const availability = assessIranAvailabilityV2(built.inventory.knowledge[0]!, built.inventory.marketProducts);
    expect(availability.classification).toBe("historical_only");
    expect(availability.mainRecommendationEligible).toBe(false);
    expect(availability.moreOptionsEligible).toBe(true);
  });

  it("normalizes tablet strength and package quantity for exact 30-day cost math", () => {
    const built = buildDecisionGraphInventoryFromContractsV2({
      masterRegistry: [master],
      marketProducts: [product()],
      policy: { asOf: new Date("2026-08-08T00:00:00.000Z") },
    });
    const mapped = built.inventory.marketProducts[0]!;
    expect(mapped.dosageFormGroup).toBe("tablet");
    expect(mapped.consumptionUnit).toBe("tablet");
    expect(mapped.consumptionUnitsPerPurchaseUnit).toBe(30);
    expect(mapped.strengthComponents).toEqual([{ ingredientKey: "WD-1000", amount: 500, unit: "mg" }]);
    expect(mapped.priceToman).toBe(120000);
  });

  it("creates insurance policy data without rounding away the raw source percentage", () => {
    const built = buildDecisionGraphInventoryFromContractsV2({
      masterRegistry: [master],
      marketProducts: [product()],
      policy: { asOf: new Date("2026-08-08T00:00:00.000Z") },
    });
    expect(built.inventory.insurancePolicies[0]?.coveragePercent).toBe(69.6);
    expect(built.inventory.insurancePolicies[0]?.referencePriceTomanPerPurchaseUnit).toBe(100000);
  });

  it("projects one evidence-backed medication into separate glycemic and organ-protection lanes", () => {
    const cardiorenal: MasterDrugRegistryEntry = {
      ...master,
      id: "WD-1001",
      canonicalName: "Testgliflozin",
      drugClass: "SGLT2 inhibitor",
      therapeuticAreas: ["Diabetes", "CKD", "Heart failure"],
      guidelineRole: "Outcome-directed therapy independent of A1C in CKD or HF",
      clinicalEffects: [
        { domain: "ckd", direction: "strong_benefit", evidenceStrength: "outcome_evidence", practicalNote: "Strong kidney benefit" },
        { domain: "heart_failure", direction: "strong_benefit", evidenceStrength: "outcome_evidence", practicalNote: "Strong HF benefit" },
      ],
    };
    const built = buildDecisionGraphInventoryFromContractsV2({
      masterRegistry: [cardiorenal],
      marketProducts: [product({ id: "nfi-2", masterDrugId: "WD-1001", genericName: "Testgliflozin" })],
      policy: { asOf: new Date("2026-08-08T00:00:00.000Z") },
    });
    const state = { pathway: "modest_intensification" as const, insulinAction: "none" as const, severeHyperglycemia: false, hba1cGap: 1, reasons: [], evidence: [] };
    const candidates = generateRegimenCandidatesV2({
      patient: { glycemia: { currentHba1c: 8, targetHba1c: 7 } },
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
      inventory: built.inventory,
    }, state);
    expect(candidates.some((item) => item.lane === "glycemic")).toBe(true);
    expect(candidates.some((item) => item.lane === "kidney" && item.kind === "organ_protection")).toBe(true);
    expect(candidates.some((item) => item.lane === "heart_failure" && item.kind === "organ_protection")).toBe(true);
  });

  it("does not auto-verify a non-direct weak name match", () => {
    const raw = product({ masterDrugId: undefined, genericName: "Testformin HCl", matchConfidence: 80 });
    const built = buildDecisionGraphInventoryFromContractsV2({ masterRegistry: [master], marketProducts: [raw] });
    expect(built.inventory.marketProducts[0]?.nfiMatchState).toBe("review_required");
    expect(built.report.reviewRequiredMarketProducts).toBe(1);
  });
});
