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

  // GLYMIZE_UCI_MISSING_GLYCEMIA_REGRESSION_V7
  it("fails closed instead of treating missing A1C context as maintenance", () => {
    const base = request();
    const incomplete: any = {
      ...base,
      patient: { ...base.patient, glycemia: {}, anthropometrics: {} },
    };

    const result = runDecisionGraphV2(incomplete);

    expect(result.clinicalState.pathway).toBe("insufficient_glycemic_data");
    expect(result.status).toBe("needs_data");
    expect(result.missingData.some((item) => item.key === "glycemia.currentHba1c" && item.blocksFinalDecision)).toBe(true);
    expect(result.missingData.some((item) => item.key === "glycemia.targetHba1c" && item.blocksFinalDecision)).toBe(true);
  });

  it("preserves urgent DKA routing when A1C context is missing", () => {
    const base = request();
    const dkaWithoutA1c: any = {
      ...base,
      patient: { ...base.patient, glycemia: { ketonesKnownPositive: true }, anthropometrics: {} },
    };

    const result = runDecisionGraphV2(dkaWithoutA1c);

    expect(result.clinicalState.pathway).toBe("insulin_centered");
    expect(result.status).toBe("urgent_clinician_review");
    expect(result.insulinSubgraph.status).toBe("urgent_review");
  });
  // GLYMIZE_HHS_CLOSURE_REGRESSION_V2
  it("routes explicit HHS urgently even when A1C and insurance context are missing", () => {
    const base = request();
    const hhs: any = {
      ...base,
      patient: {
        ...base.patient,
        glycemia: { acuteHyperglycemicCrisis: "hhs" },
        anthropometrics: {},
      },
      preferences: {
        routePreference: "oral_or_injectable",
        costPreference: "insured_only",
        insuranceProviders: [],
      },
    };

    const result = runDecisionGraphV2(hhs);

    expect(result.clinicalState.pathway).toBe("insulin_centered");
    expect(result.insulinSubgraph.status).toBe("urgent_review");
    expect(result.status).toBe("urgent_clinician_review");
  });

  it("routes mixed DKA/HHS urgently without weakening crisis precedence", () => {
    const base = request();
    const mixed: any = {
      ...base,
      patient: {
        ...base.patient,
        glycemia: {
          currentHba1c: 8,
          targetHba1c: 7,
          acuteHyperglycemicCrisis: "mixed",
        },
      },
    };

    const result = runDecisionGraphV2(mixed);

    expect(result.clinicalState.pathway).toBe("insulin_centered");
    expect(result.insulinSubgraph.status).toBe("urgent_review");
    expect(result.status).toBe("urgent_clinician_review");
  });
  // GLYMIZE_FINAL_ENGINE_DEBT_CLOSURE_V1
  it("preserves independent CKD/HF/ASCVD mandatory treatment objectives when A1C is already at target", () => {
    const base = request();
    const organMedication = medication({
      primaryLanes: ["kidney", "heart_failure", "ascvd"],
      effects: [
        { objective: "kidney_protection", direction: "strong_benefit", evidence: [ada] },
        { objective: "heart_failure_protection", direction: "strong_benefit", evidence: [ada] },
        { objective: "ascvd_protection", direction: "strong_benefit", evidence: [ada] },
      ],
    });

    const cases = [
      {
        label: "CKD",
        objective: "kidney_protection" as const,
        patient: {
          ...base.patient,
          glycemia: { currentHba1c: 7, targetHba1c: 7 },
          kidney: { ckd: true, eGfr: 60 },
        },
      },
      {
        label: "HF",
        objective: "heart_failure_protection" as const,
        patient: {
          ...base.patient,
          glycemia: { currentHba1c: 7, targetHba1c: 7 },
          cardiovascular: { heartFailure: true },
        },
      },
      {
        label: "ASCVD",
        objective: "ascvd_protection" as const,
        patient: {
          ...base.patient,
          glycemia: { currentHba1c: 7, targetHba1c: 7 },
          cardiovascular: { ascvd: true },
        },
      },
    ];

    for (const item of cases) {
      const result = runDecisionGraphV2({
        ...base,
        patient: item.patient,
        inventory: {
          ...base.inventory,
          knowledge: [organMedication],
        },
      });

      const blockingMissing = result.missingData
        .filter((missing) => missing.blocksFinalDecision)
        .map((missing) => missing.key);

      console.log("[GLYMIZE-FINAL-DEBT-DIAG]", {
        case: item.label,
        status: result.status,
        pathway: result.clinicalState.pathway,
        blockingMissing,
        objectives: result.objectives.map((objective) => `${objective.level}:${objective.id}`),
        coveredObjectives: result.treatmentPlan?.coveredObjectives ?? [],
        unresolvedObjectives: result.treatmentPlan?.unresolvedObjectives ?? [],
        componentIds: result.treatmentPlan?.components.map((component) => component.masterDrugId) ?? [],
      });

      expect(result.clinicalState.pathway, item.label).toBe("maintain_and_monitor");
      expect(
        result.objectives.some(
          (objective) => objective.id === item.objective && objective.level === "mandatory",
        ),
        item.label,
      ).toBe(true);
      expect(blockingMissing, `${item.label}: unexpected blocking missing data`).toEqual([]);
      expect(result.treatmentPlan, item.label).toBeDefined();
      expect(result.treatmentPlan?.coveredObjectives, item.label).toContain(item.objective);
      expect(result.treatmentPlan?.unresolvedObjectives, item.label).not.toContain(item.objective);
      expect(
        result.treatmentPlan?.components.some((component) => component.masterDrugId === "WD-TEST"),
        item.label,
      ).toBe(true);
      expect(result.status, item.label).toBe("complete");
    }
  });

  it("falls back from an admin-preferred brand with no usable price to a priced generic reference without losing monthly cost", () => {
    const base = request();
    const missingPricePreferred = product({
      productId: "P-PREFERRED-NO-PRICE",
      brandName: "Preferred Brand Without Price",
      priceToman: undefined,
    });
    const pricedGenericReference = product({
      productId: "P-GENERIC-REFERENCE",
      brandName: undefined,
      priceToman: 120_000,
    });

    const result = runDecisionGraphV2({
      ...base,
      preferences: {
        ...base.preferences,
        adminPreferredProductByMasterDrugId: {
          "WD-TEST": "P-PREFERRED-NO-PRICE",
        },
      },
      inventory: {
        ...base.inventory,
        marketProducts: [missingPricePreferred, pricedGenericReference],
      },
    });

    expect(result.primary).toBeDefined();
    expect(result.primary?.monthlyPatientCostToman).toBe(240_000);
    expect(result.primary?.components[0]?.genericCostBenchmark?.basis).toBe("generic_reference");
    expect(result.primary?.components[0]?.genericCostBenchmark?.referenceProductId).toBe("P-GENERIC-REFERENCE");
    expect(result.primary?.components[0]?.selectedProduct?.productId).toBe("P-GENERIC-REFERENCE");
    expect(result.primary?.components[0]?.selectedProductCost?.normalized30DayTreatmentCostToman).toBe(240_000);
  });});
