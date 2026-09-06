import { describe, expect, it } from "vitest";
import type {
  GenericMedication,
  MasterDrugRegistryEntry,
} from "@glymize/contracts";
import {
  projectDecisionGraphRegimenToType2V2,
  TYPE2_DECISION_GRAPH_EXECUTION_PROJECTION_V1,
  type BuildType2DecisionGraphAssessmentInput,
} from "../src/type2-decision-graph-compat.js";
import type {
  ComposedTreatmentPlanV2,
  IranMarketProductV2,
  ProductMonthlyCostV2,
  RecommendationV2,
  ResolvedDosePlanV2,
} from "../src/decision-graph-v2/types.js";

const evidence = {
  sourceId: "LABEL-TEST-2026",
  title: "Reviewed test label",
  version: "2026",
  url: "https://example.invalid/label",
  strength: "regulatory_label" as const,
};

const dosePlan: ResolvedDosePlanV2 = {
  ruleId: "DOSE-TEST-APPROVED",
  masterDrugId: "WD-TEST",
  dosageFormGroup: "tablet",
  lane: "glycemic",
  useCase: "continuation",
  dailyComponents: [{ ingredientKey: "WD-TEST", amount: 1000, unit: "mg" }],
  administrationsPerDay: 2,
  administrationsPer30Days: 60,
  scheduleText: "500 mg twice daily",
  displayStartDose: "500 mg twice daily",
  titrationText: "Review after the approved interval",
  targetDoseText: "1000 mg/day",
  maximumDoseText: "per approved rule",
  monitoring: ["tolerance"],
  evidence: [evidence],
  clinicianConfirmationRequired: true,
};

const selectedProduct: IranMarketProductV2 = {
  productId: "NFI-PRODUCT-1",
  masterDrugId: "WD-TEST",
  nfiMatchState: "verified",
  genericName: "TestDrug",
  brandName: "Brand A",
  genericRegistryCode: "GEN-1",
  brandRegistryCode: "BRAND-1",
  ircCode: "IRC-1",
  dosageFormGroup: "tablet",
  route: "oral",
  consumptionUnit: "tablet",
  strengthComponents: [{ ingredientKey: "WD-TEST", amount: 500, unit: "mg" }],
  consumptionUnitsPerPurchaseUnit: 30,
  purchaseUnitLabel: "box",
  priceToman: 100_000,
  license: { everValid: true, currentValid: true },
  marketPresence: "confirmed_active",
  observedAt: "2026-09-01",
};

const selectedProductCost: ProductMonthlyCostV2 = {
  productId: "NFI-PRODUCT-1",
  brandName: "Brand A",
  dosageFormGroup: "tablet",
  doseFit: "exact",
  consumptionUnitsPerDay: 2,
  consumptionUnits30Days: 60,
  purchaseUnitsNeeded30Days: 2,
  consumedDrugValueToman: 200_000,
  cashPurchaseCostToman: 200_000,
  normalized30DayTreatmentCostToman: 200_000,
  leftoverConsumptionUnitsAfter30Days: 0,
  carryoverInventoryValueToman: 0,
  insurance: [{
    provider: "social_security",
    eligibility: "eligible",
    rawCoveragePercent: 70,
    displayCoveragePercent: 70,
    coveredPurchaseUnits: 2,
    uncoveredPurchaseUnits: 0,
    patientCostIfEligibleToman: 60_000,
    insurerCostIfEligibleToman: 140_000,
    conditions: [],
    genericRegistryCode: "GEN-1",
    brandRegistryCode: "BRAND-1",
  }],
};

const regimen: RecommendationV2 = {
  regimenId: "REGIMEN-1",
  lane: "glycemic",
  kind: "single",
  components: [{
    masterDrugId: "WD-TEST",
    genericName: "TestDrug",
    persianName: "داروی تست",
    therapyGroup: "oral_glucose_lowering",
    tags: [],
    dosePlan,
    availability: {
      masterDrugId: "WD-TEST",
      classification: "current_market",
      mainRecommendationEligible: true,
      moreOptionsEligible: true,
      currentProductIds: ["NFI-PRODUCT-1"],
      historicalProductIds: [],
      reasons: ["current verified market product"],
    },
    selectedProduct,
    selectedProductCost,
  }],
  efficacyBand: "high",
  hypoglycemiaRisk: "low",
  weightProfile: "neutral",
  objectiveCoverage: ["glycemic_control"],
  objectiveStrength: { glycemic_control: "benefit" },
  evidence: [evidence],
  gate: { status: "pass", reasons: [], evidence: [evidence] },
  routeFit: "match",
  insuranceFit: "eligible",
  monthlyPatientCostToman: 60_000,
  dailyAdministrationBurden: 2,
  distinctProducts: 1,
  reasons: ["graph selected regimen"],
  cautions: ["clinician review required"],
  preferenceConflicts: [],
  whySelected: ["passed hard gates"],
  evidenceSummary: [evidence],
};

const treatmentPlan: ComposedTreatmentPlanV2 = {
  planId: "PLAN-1",
  glycemicRegimenId: "REGIMEN-1",
  supportingRegimenIds: [],
  components: [{
    masterDrugId: "WD-TEST",
    genericName: "TestDrug",
    persianName: "داروی تست",
    therapyGroup: "oral_glucose_lowering",
    tags: [],
    action: "continue_with_dose_reconciliation",
    sourceRegimenIds: ["REGIMEN-1"],
    sourceLanes: ["glycemic"],
    servesObjectives: ["glycemic_control"],
    dosePlan,
    selectedProduct,
    selectedProductCost,
    normalized30DayPatientCostToman: 60_000,
    reasons: ["continue after dose reconciliation"],
  }],
  coveredObjectives: ["glycemic_control"],
  unresolvedObjectives: [],
  monthlyPatientCostToman: 60_000,
  dailyAdministrationBurden: 2,
  currentTherapyReview: [{
    masterDrugId: "WD-TEST",
    genericName: "TestDrug",
    disposition: "continue_in_plan",
    reason: "retained in composed plan",
  }],
  reasons: ["composed from executable graph output"],
  cautions: [],
};

const generic: GenericMedication = {
  id: "GENERIC-1",
  canonicalName: "TestDrug",
  persianName: "داروی تست",
  className: "Test class",
  therapyGroup: "oral_glucose_lowering",
  administrationRoute: "oral",
  masterRegistryId: "WD-TEST",
};

const master: MasterDrugRegistryEntry = {
  id: "WD-TEST",
  canonicalName: "TestDrug",
  persianName: "داروی تست",
  combination: false,
  therapeuticAreas: ["Type 2 diabetes"],
  drugClass: "Test class",
  clinicalEffects: [{
    domain: "glycemic_control",
    direction: "benefit",
    evidenceStrength: "label_indication",
    sourceCodes: [evidence.sourceId],
    sourceUrls: [evidence.url],
  }],
  sourceCodes: [evidence.sourceId],
  sourceUrls: [evidence.url],
  reviewState: "approved",
};

const input: BuildType2DecisionGraphAssessmentInput = {
  medications: [generic],
  masterRegistry: [master],
  marketProducts: [],
  request: {
    currentHba1c: 8,
    targetHba1c: 7,
    factors: [],
    currentMedications: [{
      genericMedicationId: "GENERIC-1",
      genericName: "TestDrug",
      doseAmount: 500,
      doseUnit: "mg",
      frequencyPerDay: 2,
      status: "active",
    }],
    insuranceCoverageByMedicationId: {
      "GENERIC-1": [{ provider: "social_security", percent: 70 }],
    },
  },
};

describe("Type 2 Decision Graph execution compatibility projection", () => {
  it("carries graph-composed action, approved dose, product and insurance cost without changing order authority", () => {
    const [projected] = projectDecisionGraphRegimenToType2V2(regimen, 1, input, treatmentPlan);

    expect(projected).toBeDefined();
    expect(projected!.outputStatus).toBe("information_only");
    expect(projected!.therapyAction).toBe("review_current_therapy");
    expect(projected!.decisionGraphExecution).toEqual({
      authority: TYPE2_DECISION_GRAPH_EXECUTION_PROJECTION_V1,
      action: "continue_with_dose_reconciliation",
      sourceRegimenIds: ["REGIMEN-1"],
      sourceLanes: ["glycemic"],
      servesObjectives: ["glycemic_control"],
      dosePlan,
      selectedProduct,
      selectedProductCost,
      normalized30DayPatientCostToman: 60_000,
      regimenInsuranceFit: "eligible",
      regimenMonthlyPatientCostToman: 60_000,
      reasons: ["continue after dose reconciliation"],
      clinicianConfirmationRequired: true,
    });
    expect(projected!.decisionGraphExecution?.dosePlan?.ruleId).toBe("DOSE-TEST-APPROVED");
    expect(projected!.decisionGraphExecution?.dosePlan?.evidence).toEqual([evidence]);
    expect(projected!.decisionGraphExecution?.selectedProductCost?.insurance[0]?.patientCostIfEligibleToman).toBe(60_000);
  });

  it("does not fabricate execution metadata when no matching composed treatment plan exists", () => {
    const [projected] = projectDecisionGraphRegimenToType2V2(regimen, 1, input);

    expect(projected).toBeDefined();
    expect(projected!.decisionGraphExecution).toBeUndefined();
    expect(projected!.outputStatus).toBe("information_only");
  });

  it("does not project a different regimen's composed action by master-drug coincidence alone", () => {
    const mismatched: ComposedTreatmentPlanV2 = {
      ...treatmentPlan,
      glycemicRegimenId: "OTHER-REGIMEN",
      components: treatmentPlan.components.map((component) => ({
        ...component,
        sourceRegimenIds: ["OTHER-REGIMEN"],
        action: "start",
      })),
    };
    const [projected] = projectDecisionGraphRegimenToType2V2(regimen, 1, input, mismatched);

    expect(projected!.decisionGraphExecution).toBeUndefined();
  });
});
