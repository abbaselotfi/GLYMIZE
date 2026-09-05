import { afterEach, describe, expect, it } from "vitest";
import type { GenericMedication, IranMarketDrugProduct, MasterDrugRegistryEntry } from "@glymize/contracts";
import {
  buildType2Assessment,
  clearType2DecisionGraphRuntimeCatalogForTests,
  configureType2DecisionGraphRuntimeCatalog,
} from "../src/index-runtime.js";
import type { Type2StructuredConsiderationRequestV2 } from "../src/type2-intake-v2.js";

const master: MasterDrugRegistryEntry = {
  id: "WD-SAFETY-PARITY-1",
  canonicalName: "Parityformin",
  combination: false,
  therapeuticAreas: ["Diabetes"],
  drugClass: "Biguanide",
  primaryIndications: ["Type 2 diabetes"],
  guidelineRole: "Glucose lowering",
  diabetesOrPhenotype: "T2D",
  clinicalEffects: [{ domain: "glycemic_control", direction: "benefit", evidenceStrength: "guideline_recommended" }],
  sourceCodes: ["ADA9-2026"],
  sourceUrls: ["https://example.test/ada"],
  reviewState: "approved",
};

const medication: GenericMedication = {
  id: "generic-parityformin",
  canonicalName: "Parityformin",
  persianName: "پریتی‌فورمین",
  className: "Biguanide",
  therapyGroup: "oral_glucose_lowering",
  administrationRoute: "oral",
  masterRegistryId: master.id,
};

const marketProduct: IranMarketDrugProduct = {
  id: "nfi-safety-parity-1",
  masterDrugId: master.id,
  genericName: master.canonicalName,
  dosageForm: "Tablet",
  strengthPresentation: "500 mg",
  route: "oral",
  packagePresentation: "30 tablets",
  licenseStatus: "Active",
  price: { amountToman: 100_000, priceKind: "consumer_retail" },
  insuranceCoverages: [],
  sourceUrl: "https://example.test/nfi",
  sourceReference: "NFI parity fixture",
  observedAt: "2026-09-01T00:00:00.000Z",
  matchConfidence: 100,
};

function structuredRequest(): Type2StructuredConsiderationRequestV2 {
  return {
    currentHba1c: 7.8,
    targetHba1c: 7,
    factors: ["pregnancy", "diabetic_foot"],
    clinicalContext: {
      pregnancy: true,
      glycemia: { fastingPlasmaGlucoseMgDl: 101 },
      pregnancyCare: { diabetesType: "gdm", gestationalAgeWeeks: 28 },
      diabeticFoot: { footUlcerPresent: true, clinicalInfectionPresent: false },
      retinopathy: {
        diabeticRetinopathyPresent: true,
        severity: "moderate_npdr",
        diabeticMacularEdema: false,
      },
      nutritionSupport: { intent: "glycemic_benefit" },
    },
  };
}

afterEach(() => clearType2DecisionGraphRuntimeCatalogForTests());

describe("Type 2 runtime parallel-safety parity", () => {
  it("adds the reviewed safety projection in the unconfigured compatibility fallback", () => {
    clearType2DecisionGraphRuntimeCatalogForTests();
    const result = buildType2Assessment([medication], structuredRequest());

    expect(result.parallelSafety.retinopathy.escalations).toEqual(expect.arrayContaining([
      expect.objectContaining({ specialty: "ophthalmology", urgency: "prompt" }),
    ]));
    expect(result.parallelSafety.diabeticFoot).toMatchObject({
      state: "uninfected_ulcer",
      antibioticExecution: false,
      antibioticBoundary: "not_indicated_for_uninfected_ulcer",
    });
    expect(result.parallelSafety.nutritionSupport).toMatchObject({
      state: "glycemic_supplement_not_recommended",
      supplementOrNutritionPrescriptionExecution: false,
    });
    expect(result.parallelSafety.pregnancy).toMatchObject({
      state: "gdm_lifestyle_then_insulin_if_needed",
      autonomousInsulinDoseExecution: false,
      glucoseAbovePregnancyTarget: true,
    });
  });

  it("returns the same safety channel when Decision Graph runtime catalog is configured", () => {
    configureType2DecisionGraphRuntimeCatalog({ masterRegistry: [master], marketProducts: [marketProduct] });
    const result = buildType2Assessment([medication], structuredRequest());

    expect(result.parallelSafety.diabeticFoot.antibioticBoundary).toBe("not_indicated_for_uninfected_ulcer");
    expect(result.parallelSafety.retinopathy.escalations[0]).toMatchObject({ specialty: "ophthalmology" });
    expect(result.parallelSafety.nutritionSupport.supplementOrNutritionPrescriptionExecution).toBe(false);
    expect(result.parallelSafety.pregnancy.autonomousInsulinDoseExecution).toBe(false);
  });

  it("keeps broad legacy flags fail-closed without inventing specialist phenotype", () => {
    const result = buildType2Assessment([medication], {
      currentHba1c: 7.8,
      targetHba1c: 7,
      factors: ["pregnancy", "diabetic_foot"],
    });

    expect(result.parallelSafety.retinopathy.escalations).toEqual([]);
    expect(result.parallelSafety.diabeticFoot.state).toBe("no_foot_ulcer_context");
    expect(result.parallelSafety.nutritionSupport.state).toBe("not_requested");
    expect(result.parallelSafety.pregnancy.state).toBe("needs_diabetes_type");
    expect(result.parallelSafety.pregnancy.autonomousInsulinDoseExecution).toBe(false);
  });
});
