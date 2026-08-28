import { describe, expect, it } from "vitest";
import {
  assessIranAvailabilityV2,
  calculateProductMonthlyCostV2,
  defaultDecisionGraphPolicyV2,
  dominatesV2,
  runDecisionGraphV2,
  type DecisionGraphRequestV2,
  type DoseRuleV2,
  type IranMarketProductV2,
  type KnowledgeMedicationV2,
  type RegimenCandidateV2,
} from "../src/decision-graph-v2/index.js";

const ada = defaultDecisionGraphPolicyV2.evidence.pharmacologic;

function medication(overrides: Partial<KnowledgeMedicationV2> = {}): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-TEST",
    genericName: "TestDrug",
    persianName: "داروی تست",
    combination: false,
    therapeuticAreas: ["Type 2 diabetes"],
    therapyGroup: "oral_glucose_lowering",
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightDirection: "neutral",
    effects: [{ objective: "glycemic_control", direction: "benefit", evidence: [ada] }],
    evidence: [ada],
    engineState: "approved",
    ...overrides,
  };
}

function product(overrides: Partial<IranMarketProductV2> = {}): IranMarketProductV2 {
  return {
    productId: "P1",
    masterDrugId: "WD-TEST",
    nfiMatchState: "verified",
    genericName: "TestDrug",
    brandName: "Brand A",
    dosageFormGroup: "tablet",
    route: "oral",
    consumptionUnit: "tablet",
    strengthComponents: [{ ingredientKey: "WD-TEST", amount: 500, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 30,
    purchaseUnitLabel: "box",
    priceToman: 100_000,
    license: { everValid: true, currentValid: true },
    marketPresence: "confirmed_active",
    observedAt: "2026-08-08",
    ...overrides,
  };
}

const fixedDoseRule: DoseRuleV2 = {
  id: "DOSE-TEST",
  masterDrugId: "WD-TEST",
  indication: "type2",
  formula: {
    kind: "fixed_daily_components",
    dailyComponents: [{ ingredientKey: "WD-TEST", amount: 1000, unit: "mg" }],
    administrationsPerDay: 2,
  },
  evidence: [ada],
  reviewState: "approved",
};

function request(overrides: Partial<DecisionGraphRequestV2> = {}): DecisionGraphRequestV2 {
  return {
    patient: {
      glycemia: { currentHba1c: 8, targetHba1c: 7, fastingPlasmaGlucoseMgDl: 150 },
      anthropometrics: { weightKg: 80, bmi: 29 },
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [medication()],
      marketProducts: [product()],
      doseRules: [fixedDoseRule],
      insurancePolicies: [],
    },
    ...overrides,
  };
}

describe("Decision Graph v2 invariants", () => {
  it("has no score and reports the non-score selection method", () => {
    const result = runDecisionGraphV2(request());
    expect(result.engine.scoreBased).toBe(false);
    expect(result.engine.selectionMethod).toBe("hard_gates_then_pareto_then_lexicographic");
    expect(JSON.stringify(result)).not.toContain("priorityScore");
  });

  it("requires current NFI market evidence for main recommendations", () => {
    const med = medication();
    expect(assessIranAvailabilityV2(med, [product()]).classification).toBe("current_market");
    const historical = product({ productId: "H1", license: { everValid: true, currentValid: false }, marketPresence: "unavailable" });
    const historicalAssessment = assessIranAvailabilityV2(med, [historical]);
    expect(historicalAssessment.classification).toBe("historical_only");
    expect(historicalAssessment.mainRecommendationEligible).toBe(false);
    expect(historicalAssessment.moreOptionsEligible).toBe(true);
  });

  it("asks for weight when severe hyperglycemia activates insulin initiation", () => {
    const insulin = medication({
      masterDrugId: "INS-BASAL",
      genericName: "Basal insulin",
      therapyGroup: "basal_insulin",
      routeOptions: ["subcutaneous"],
      efficacyBand: "very_high",
      effects: [{ objective: "glycemic_control", direction: "strong_benefit", evidence: [ada] }, { objective: "insulin_replacement", direction: "strong_benefit", evidence: [ada] }],
    });
    const insulinProduct = product({ productId: "IP1", masterDrugId: "INS-BASAL", genericName: "Basal insulin", route: "subcutaneous", dosageFormGroup: "pen", consumptionUnit: "U", strengthComponents: [{ ingredientKey: "INS-BASAL", amount: 1, unit: "U" }], consumptionUnitsPerPurchaseUnit: 1500 });
    const insulinRule: DoseRuleV2 = {
      id: "BASAL-START",
      masterDrugId: "INS-BASAL",
      indication: "type2-severe",
      formula: { kind: "weight_based_daily", ingredientKey: "INS-BASAL", unit: "U", minPerKg: 0.1, maxPerKg: 0.2, administrationsPerDay: 1, selection: "by_glycemic_severity" },
      evidence: [ada],
      reviewState: "approved",
    };
    const base = request();
    const result = runDecisionGraphV2({
      ...base,
      patient: { glycemia: { currentHba1c: 11, targetHba1c: 7, randomGlucoseMgDl: 320 }, anthropometrics: {} },
      inventory: { ...base.inventory, knowledge: [insulin], marketProducts: [insulinProduct], doseRules: [insulinRule] },
    });
    expect(result.clinicalState.pathway).toBe("insulin_centered");
    expect(result.missingData.some((item) => item.key === "anthropometrics.weightKg" && item.blocksFinalDecision)).toBe(true);
    expect(result.status).toBe("needs_data");
  });

  it("requests postprandial data when fasting is at goal but A1C remains high", () => {
    const base = request();
    const result = runDecisionGraphV2({
      ...base,
      patient: {
        glycemia: { currentHba1c: 8.6, targetHba1c: 7, fastingPlasmaGlucoseMgDl: 115 },
        anthropometrics: { weightKg: 80 },
        currentMedications: [{ masterDrugId: "INS", genericName: "Glargine", therapyGroup: "basal_insulin", basalInsulinUnitsPerDay: 24 }],
      },
    });
    expect(result.clinicalState.insulinAction).toBe("request_postprandial_pattern");
    expect(result.missingData.some((item) => item.key === "glycemia.postprandialPattern")).toBe(true);
  });

  it("calculates real 30-day package cost from dose and strength", () => {
    const cost = calculateProductMonthlyCostV2({
      product: product(),
      dose: {
        ruleId: "R",
        masterDrugId: "WD-TEST",
        dailyComponents: [{ ingredientKey: "WD-TEST", amount: 2000, unit: "mg" }],
        administrationsPerDay: 2,
        displayStartDose: "2000 mg/day",
        monitoring: [],
        evidence: [ada],
        clinicianConfirmationRequired: true,
      },
      insurancePolicies: [],
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    });
    expect(cost?.consumptionUnitsPerDay).toBe(4);
    expect(cost?.consumptionUnits30Days).toBe(120);
    expect(cost?.purchaseUnitsNeeded30Days).toBe(4);
    expect(cost?.cashPurchaseCostToman).toBe(400_000);
  });

  it("uses Pareto dominance rather than additive points", () => {
    const base: RegimenCandidateV2 = {
      regimenId: "A",
      lane: "glycemic",
      kind: "single",
      components: [],
      efficacyBand: "high",
      hypoglycemiaRisk: "low",
      weightProfile: "neutral",
      objectiveCoverage: ["glycemic_control"],
      objectiveStrength: {},
      evidence: [],
      gate: { status: "pass", reasons: [], evidence: [] },
      routeFit: "match",
      insuranceFit: "eligible",
      monthlyPatientCostToman: 100_000,
      dailyAdministrationBurden: 1,
      distinctProducts: 1,
      reasons: [], cautions: [], preferenceConflicts: [],
    };
    const inferior = { ...base, regimenId: "B", monthlyPatientCostToman: 150_000, dailyAdministrationBurden: 2 };
    expect(dominatesV2(base, inferior, [])).toBe(true);
    expect(dominatesV2(inferior, base, [])).toBe(false);
  });
});
