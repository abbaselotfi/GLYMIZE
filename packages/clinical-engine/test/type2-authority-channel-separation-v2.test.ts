import { describe, expect, it } from "vitest";
import {
  applyHardGatesV2,
  defaultDecisionGraphPolicyV2,
  enrichCandidateWithDoseMarketCostV2,
  runDecisionGraphV2,
  type ClinicalObjectiveV2,
  type ClinicalStateV2,
  type DecisionGraphRequestV2,
  type DoseRuleV2,
  type IranMarketProductV2,
  type KnowledgeMedicationV2,
  type RegimenCandidateV2,
} from "../src/decision-graph-v2/index.js";

const evidence = defaultDecisionGraphPolicyV2.evidence.pharmacologic;

function medication(overrides: Partial<KnowledgeMedicationV2> = {}): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-ORAL",
    genericName: "Test oral",
    combination: false,
    therapeuticAreas: ["Type 2 diabetes"],
    therapyGroup: "oral_glucose_lowering",
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightDirection: "neutral",
    effects: [{ objective: "glycemic_control", direction: "benefit", evidence: [evidence] }],
    evidence: [evidence],
    engineState: "approved",
    ...overrides,
  };
}

function product(masterDrugId: string, route: string, dosageFormGroup: string): IranMarketProductV2 {
  return {
    productId: `P-${masterDrugId}`,
    masterDrugId,
    nfiMatchState: "verified",
    genericName: masterDrugId,
    dosageFormGroup,
    route,
    consumptionUnit: route === "oral" ? "tablet" : "U",
    strengthComponents: [{ ingredientKey: masterDrugId, amount: route === "oral" ? 500 : 1, unit: route === "oral" ? "mg" : "U" }],
    consumptionUnitsPerPurchaseUnit: route === "oral" ? 30 : 1500,
    purchaseUnitLabel: "pack",
    priceToman: 100_000,
    license: { everValid: true, currentValid: true },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-08",
  };
}

function doseRule(masterDrugId: string, injectable = false): DoseRuleV2 {
  return {
    id: `DOSE-${masterDrugId}`,
    masterDrugId,
    indication: "type2",
    formula: {
      kind: "fixed_daily_components",
      dailyComponents: [{ ingredientKey: masterDrugId, amount: injectable ? 20 : 1000, unit: injectable ? "U" : "mg" }],
      administrationsPerDay: 1,
    },
    evidence: [evidence],
    reviewState: "approved",
  };
}

function candidate(masterDrugId: string, therapyGroup: string, route: string, dosageFormGroup: string): RegimenCandidateV2 {
  return {
    regimenId: `med:${masterDrugId}:glycemic`,
    lane: "glycemic",
    kind: therapyGroup.includes("insulin") ? "insulin_basal" : "single",
    components: [{
      masterDrugId,
      genericName: masterDrugId,
      therapyGroup,
      tags: [],
      availability: {
        masterDrugId,
        classification: "current_market",
        mainRecommendationEligible: true,
        moreOptionsEligible: true,
        currentProductIds: [`P-${masterDrugId}`],
        historicalProductIds: [],
        reasons: [],
      },
    }],
    efficacyBand: therapyGroup.includes("insulin") ? "very_high" : "high",
    hypoglycemiaRisk: therapyGroup.includes("insulin") ? "moderate" : "low",
    weightProfile: "neutral",
    objectiveCoverage: therapyGroup.includes("insulin") ? ["glycemic_control", "insulin_replacement"] : ["glycemic_control"],
    objectiveStrength: {},
    evidence: [evidence],
    gate: { status: "pass", reasons: [], evidence: [] },
    selectionConstraint: { status: "pass", kinds: [], reasons: [] },
    routeFit: route === "oral" ? "match" : "neutral",
    insuranceFit: "unknown",
    distinctProducts: 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
}

const maintenanceState: ClinicalStateV2 = {
  pathway: "maintenance_or_modest_gap",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 1,
  reasons: [],
  evidence: [evidence],
};

function baseRequest(): DecisionGraphRequestV2 {
  const oral = medication();
  return {
    patient: {
      glycemia: { currentHba1c: 8, targetHba1c: 7, fastingPlasmaGlucoseMgDl: 150 },
      anthropometrics: { weightKg: 80, bmi: 29 },
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [oral],
      marketProducts: [product("WD-ORAL", "oral", "tablet")],
      doseRules: [doseRule("WD-ORAL")],
      insurancePolicies: [],
    },
  };
}

describe("Type 2 authority-channel separation", () => {
  it("keeps oral-only as a selection constraint rather than a clinical exclusion", () => {
    const injectable = medication({
      masterDrugId: "WD-INJECT",
      genericName: "Test injectable",
      therapyGroup: "glp1_ra",
      routeOptions: ["subcutaneous"],
    });
    const request: DecisionGraphRequestV2 = {
      ...baseRequest(),
      preferences: { routePreference: "oral_only", costPreference: "no_constraint" },
      inventory: {
        knowledge: [injectable],
        marketProducts: [product("WD-INJECT", "subcutaneous", "injection_pen")],
        doseRules: [doseRule("WD-INJECT", true)],
        insurancePolicies: [],
      },
    };
    const result = applyHardGatesV2(request, maintenanceState, [], candidate("WD-INJECT", "glp1_ra", "subcutaneous", "injection_pen"));
    expect(result.gate.status).toBe("pass");
    expect(result.gate.reasons).not.toContain("پزشک/بیمار مسیر oral-only را به‌عنوان constraint انتخاب کرده است.");
    expect(result.selectionConstraint).toEqual({
      status: "blocked",
      kinds: ["route"],
      reasons: ["پزشک/بیمار مسیر oral-only را به‌عنوان constraint انتخاب کرده است."],
    });
  });

  it("preserves a true clinical authority failure as gate exclude", () => {
    const unapproved = medication({ engineState: "candidate" });
    const request = baseRequest();
    request.inventory.knowledge = [unapproved];
    const result = applyHardGatesV2(request, maintenanceState, [], candidate("WD-ORAL", "oral_glucose_lowering", "oral", "tablet"));
    expect(result.gate.status).toBe("exclude");
    expect(result.selectionConstraint?.status).toBe("pass");
  });

  it("keeps insured-only access failure out of the clinical gate while blocking selection", () => {
    const request = baseRequest();
    request.preferences = {
      routePreference: "oral_or_injectable",
      costPreference: "insured_only",
      insuranceProviders: ["social_security"],
    };
    const gated = applyHardGatesV2(request, maintenanceState, [], candidate("WD-ORAL", "oral_glucose_lowering", "oral", "tablet"));
    const enriched = enrichCandidateWithDoseMarketCostV2(request, gated, []);
    expect(enriched.gate.status).toBe("pass");
    expect(enriched.insuranceFit).toBe("unknown");
    expect(enriched.selectionConstraint?.status).toBe("blocked");
    expect(enriched.selectionConstraint?.kinds).toContain("access");
  });

  it("does not allow a route-blocked candidate into primary or alternatives", () => {
    const oral = medication();
    const injectable = medication({
      masterDrugId: "WD-INJECT",
      genericName: "Test injectable",
      therapyGroup: "glp1_ra",
      routeOptions: ["subcutaneous"],
    });
    const request = baseRequest();
    request.preferences = { routePreference: "oral_only", costPreference: "no_constraint" };
    request.inventory = {
      knowledge: [oral, injectable],
      marketProducts: [product("WD-ORAL", "oral", "tablet"), product("WD-INJECT", "subcutaneous", "injection_pen")],
      doseRules: [doseRule("WD-ORAL"), doseRule("WD-INJECT", true)],
      insurancePolicies: [],
    };
    const result = runDecisionGraphV2(request);
    expect(result.primary?.components.some((component) => component.masterDrugId === "WD-INJECT")).toBe(false);
    expect(result.alternatives.some((regimen) => regimen.components.some((component) => component.masterDrugId === "WD-INJECT"))).toBe(false);
    expect(result.moreOptions.some((regimen) => regimen.selectionConstraint?.status === "blocked")).toBe(true);
  });

  it("preserves mandatory insulin clinical visibility when insured-only access is unresolved without relying on display text", () => {
    const insulin = medication({
      masterDrugId: "INS-BASAL",
      genericName: "Basal insulin",
      therapyGroup: "basal_insulin",
      routeOptions: ["subcutaneous"],
      efficacyBand: "very_high",
      effects: [
        { objective: "glycemic_control", direction: "strong_benefit", evidence: [evidence] },
        { objective: "insulin_replacement", direction: "strong_benefit", evidence: [evidence] },
      ],
    });
    const request: DecisionGraphRequestV2 = {
      patient: {
        glycemia: { currentHba1c: 11, targetHba1c: 7, randomGlucoseMgDl: 320 },
        anthropometrics: { weightKg: 80, bmi: 29 },
      },
      preferences: {
        routePreference: "oral_or_injectable",
        costPreference: "insured_only",
        insuranceProviders: ["social_security"],
      },
      inventory: {
        knowledge: [insulin],
        marketProducts: [product("INS-BASAL", "subcutaneous", "injection_pen")],
        doseRules: [doseRule("INS-BASAL", true)],
        insurancePolicies: [],
      },
    };
    const result = runDecisionGraphV2(request);
    expect(result.clinicalState.pathway).toBe("insulin_centered");
    expect(result.primary?.components.some((component) => component.masterDrugId === "INS-BASAL")).toBe(true);
    expect(result.primary?.selectionConstraint?.status).toBe("pass");
    expect(result.primary?.insuranceFit).toBe("unknown");
    expect(result.status).toBe("no_fully_eligible_regimen");
  });

  it("keeps budget excess as a preference conflict, not a clinical or selection block", () => {
    const request = baseRequest();
    request.preferences = {
      routePreference: "oral_or_injectable",
      costPreference: "low_cost",
      monthlyMedicationBudgetToman: 1,
    };
    const gated = applyHardGatesV2(request, maintenanceState, [], candidate("WD-ORAL", "oral_glucose_lowering", "oral", "tablet"));
    const enriched = enrichCandidateWithDoseMarketCostV2(request, gated, []);
    expect(enriched.gate.status).toBe("pass");
    expect(enriched.selectionConstraint?.status).toBe("pass");
    expect(enriched.preferenceConflicts.some((item) => item.includes("بودجه"))).toBe(true);
  });
});
