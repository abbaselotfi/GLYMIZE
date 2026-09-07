import { afterEach, describe, expect, it } from "vitest";
import type { IranMarketDrugProduct, MasterDrugRegistryEntry } from "@glymize/contracts";
import {
  clearType2DecisionGraphRuntimeCatalogForTests,
  configureType2DecisionGraphRuntimeCatalog,
  listType2ReviewedProductSafetyReviewSetsV2,
} from "../src/index-runtime.js";

const masterDrugId = "WD-RUNTIME-SEMAGLUTIDE-SC";

const master: MasterDrugRegistryEntry = {
  id: masterDrugId,
  canonicalName: "Semaglutide, subcutaneous",
  persianName: "سماگلوتاید تزریقی",
  combination: false,
  therapeuticAreas: ["Diabetes", "MASH"],
  drugClass: "GLP-1 receptor agonist",
  primaryIndications: ["Type 2 diabetes", "MASH F2-F3"],
  guidelineRole: "Very high efficacy glucose lowering and reviewed MASH pathway",
  clinicalEffects: [
    {
      domain: "glycemic_control",
      direction: "strong_benefit",
      evidenceStrength: "guideline_recommended",
      sourceCodes: ["ADA9-2026"],
      sourceUrls: ["https://example.test/ada"],
    },
    {
      domain: "masld_mash",
      direction: "benefit",
      evidenceStrength: "label_indication",
      sourceCodes: ["US-LABEL-WEGOVY-2026-06"],
      sourceUrls: ["https://example.test/wegovy-label"],
    },
  ],
  sourceCodes: ["ADA9-2026", "US-LABEL-WEGOVY-2026-06"],
  sourceUrls: ["https://example.test/ada", "https://example.test/wegovy-label"],
  reviewState: "approved",
};

const wegovy: IranMarketDrugProduct = {
  id: "NFI-RUNTIME-WEGOVY-2_4",
  masterDrugId,
  genericName: "Semaglutide",
  brandName: "WEGOVY",
  dosageForm: "Prefilled pen",
  strengthPresentation: "2.4 mg",
  route: "subcutaneous",
  packagePresentation: "4 pens",
  licenseStatus: "Active",
  licenseValidUntilJalali: "1406/12/29",
  insuranceCoverages: [],
  sourceUrl: "https://example.test/nfi/wegovy",
  sourceReference: "NFI runtime WEGOVY fixture",
  observedAt: "2026-09-07T00:00:00.000Z",
  matchConfidence: 100,
};

afterEach(() => clearType2DecisionGraphRuntimeCatalogForTests());

describe("Type 2 product-safety runtime metadata authority", () => {
  it("publishes reviewed collection metadata from the exact configured runtime catalogue", () => {
    configureType2DecisionGraphRuntimeCatalog({
      masterRegistry: [master],
      marketProducts: [wegovy],
    });

    const sets = listType2ReviewedProductSafetyReviewSetsV2();
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      reviewSetId: "WEGOVY-MASH-SAFETY",
      reviewSetVersion: "2026-06-18",
      masterDrugId,
      productIdentity: { brandName: "WEGOVY", route: "subcutaneous" },
      reviewState: "approved",
    });
    expect(sets[0]!.criteria).toHaveLength(5);
    expect(sets[0]!.criteria.every((criterion) => criterion.promptFa.trim().length > 0)).toBe(true);
    expect(sets[0]!.criteria.map((criterion) => criterion.criterionId)).toEqual([
      "wegovy.personal_or_family_mtc_history",
      "wegovy.men2",
      "wegovy.serious_semaglutide_hypersensitivity",
      "wegovy.severe_gastroparesis",
      "wegovy.suspected_acute_pancreatitis",
    ]);
  });

  it("returns no fabricated metadata when runtime catalogue authority is absent", () => {
    clearType2DecisionGraphRuntimeCatalogForTests();
    expect(listType2ReviewedProductSafetyReviewSetsV2()).toEqual([]);
  });

  it("returns detached metadata so UI consumers cannot mutate runtime authority", () => {
    configureType2DecisionGraphRuntimeCatalog({
      masterRegistry: [master],
      marketProducts: [wegovy],
    });

    const first = listType2ReviewedProductSafetyReviewSetsV2();
    first[0]!.criteria[0]!.promptFa = "mutated-by-consumer";

    const second = listType2ReviewedProductSafetyReviewSetsV2();
    expect(second[0]!.criteria[0]!.promptFa).not.toBe("mutated-by-consumer");
  });
});
