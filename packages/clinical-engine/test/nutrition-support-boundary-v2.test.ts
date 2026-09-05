import { describe, expect, it } from "vitest";
import {
  resolveNutritionSupportBoundaryV2,
  runDecisionGraphV2WithSpecialistEscalations,
  type DecisionGraphRequestWithSpecialistContextsV2,
  type NutritionSupportContextV2,
} from "../src/decision-graph-v2/index.js";

function request(nutritionSupport?: NutritionSupportContextV2): DecisionGraphRequestWithSpecialistContextsV2 {
  return {
    patient: {
      ageYears: 58,
      glycemia: { currentHba1c: 7.4, targetHba1c: 7 },
      nutritionSupport,
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [],
      marketProducts: [],
      doseRules: [],
      insurancePolicies: [],
    },
  };
}

describe("ADA 2026 nutrition-support safety boundary", () => {
  it("does not create nutrition prescription execution when no indication is present", () => {
    const result = resolveNutritionSupportBoundaryV2(request());
    expect(result.state).toBe("not_requested");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
  });

  it("rejects supplement use solely for glycemic benefit", () => {
    const result = resolveNutritionSupportBoundaryV2(request({ intent: "glycemic_benefit" }));
    expect(result.state).toBe("glycemic_supplement_not_recommended");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
    expect(result.evidence.some((item) => item.locator?.includes("5.16"))).toBe(true);
  });

  it("routes documented deficiency to nutrient-specific review without inventing a product or dose", () => {
    const result = resolveNutritionSupportBoundaryV2(request({
      intent: "documented_deficiency",
      documentedMicronutrientDeficiency: true,
      deficiencyName: "vitamin B12 deficiency",
      deficiencyLabValueKnown: true,
    }));
    expect(result.state).toBe("deficiency_treatment_review");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
    expect(result.missingData).toHaveLength(0);
    expect(result.actions.join(" ")).toContain("nutrient-specific");
  });

  it("requires a named deficiency and requests objective deficiency data when incomplete", () => {
    const result = resolveNutritionSupportBoundaryV2(request({
      intent: "documented_deficiency",
      documentedMicronutrientDeficiency: true,
      deficiencyLabValueKnown: false,
    }));
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "nutritionSupport.deficiencyName", priority: "required" }),
      expect.objectContaining({ key: "nutritionSupport.deficiencyLabValue", priority: "recommended" }),
    ]));
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
  });

  it("surfaces metformin-associated B12 testing review without assuming deficiency", () => {
    const result = resolveNutritionSupportBoundaryV2(request({
      intent: "unspecified",
      metforminUse: true,
      anemiaOrPeripheralNeuropathy: true,
    }));
    expect(result.actions.join(" ")).toContain("vitamin B12");
    expect(result.state).toBe("needs_indication");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
  });

  it("surfaces beta-carotene harm counseling independently of prescribing", () => {
    const result = resolveNutritionSupportBoundaryV2(request({
      intent: "glycemic_benefit",
      betaCaroteneSupplementUseOrPlan: true,
    }));
    expect(result.actions.join(" ")).toContain("β-carotene");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
  });

  it("routes malnutrition to assessment rather than generic enteral/parenteral execution", () => {
    const result = resolveNutritionSupportBoundaryV2(request({
      intent: "malnutrition_support",
      malnutritionRiskOrDiagnosis: true,
      intentionalWeightLoss: true,
    }));
    expect(result.state).toBe("malnutrition_assessment");
    expect(result.actions.join(" ")).toContain("enteral/parenteral");
    expect(result.actions.join(" ")).toContain("پروتئین");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
  });

  it("keeps special-population support individualized and non-prescribing", () => {
    const result = resolveNutritionSupportBoundaryV2(request({
      intent: "special_population",
      specialPopulation: "vegetarian_or_vegan",
    }));
    expect(result.state).toBe("special_population_review");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
    expect(result.actions.join(" ")).toContain("فردی");
  });

  it("projects nutrition safety through the parallel wrapper without entering medication ranking", () => {
    const result = runDecisionGraphV2WithSpecialistEscalations(request({ intent: "glycemic_benefit" }));
    expect(result.nutritionSupportPathway.state).toBe("glycemic_supplement_not_recommended");
    expect(result.nutritionSupportPathway.supplementOrNutritionPrescriptionExecution).toBe(false);
    const trace = result.trace.find((item) => item.nodeId === "nutrition-support-safety-boundary");
    expect(trace?.summary).toContain("prescriptionExecution=false");
  });
});
