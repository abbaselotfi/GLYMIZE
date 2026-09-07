import { describe, expect, it } from "vitest";
import {
  defaultDecisionGraphPolicyV2,
  runDecisionGraphV2,
  type DecisionGraphRequestV2,
  type DoseRuleV2,
  type IranMarketProductV2,
  type KnowledgeMedicationV2,
} from "../src/decision-graph-v2/index.js";

const ada = defaultDecisionGraphPolicyV2.evidence.pharmacologic;

function medication(): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-TRACE",
    genericName: "TraceDrug",
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
  };
}

function product(): IranMarketProductV2 {
  return {
    productId: "P-TRACE",
    masterDrugId: "WD-TRACE",
    nfiMatchState: "verified",
    genericName: "TraceDrug",
    dosageFormGroup: "tablet",
    route: "oral",
    consumptionUnit: "tablet",
    strengthComponents: [{ ingredientKey: "WD-TRACE", amount: 1, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 30,
    purchaseUnitLabel: "box",
    priceToman: 100_000,
    license: { everValid: true, currentValid: true },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-08",
  };
}

const doseRule: DoseRuleV2 = {
  id: "DOSE-TRACE",
  masterDrugId: "WD-TRACE",
  indication: "type2",
  formula: {
    kind: "fixed_daily_components",
    dailyComponents: [{ ingredientKey: "WD-TRACE", amount: 1, unit: "mg" }],
    administrationsPerDay: 1,
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
      doseRules: [doseRule],
      insurancePolicies: [],
    },
    ...overrides,
  };
}

function expectTraceableEvidence(evidence: Array<{ sourceId: string; title: string; version?: string; url: string }>) {
  expect(evidence.length).toBeGreaterThan(0);
  for (const item of evidence) {
    expect(item.sourceId.trim()).not.toBe("");
    expect(item.title.trim()).not.toBe("");
    expect(item.version?.trim()).toBeTruthy();
    expect(item.url.trim()).not.toBe("");
  }
}

describe("Type 2 clinical rule metadata traceability", () => {
  it("keeps organ-protection objectives linked to versioned evidence", () => {
    const base = request();
    const result = runDecisionGraphV2(request({
      patient: {
        ...base.patient,
        kidney: { ckd: true },
        cardiovascular: { heartFailure: true, ascvd: true },
        liver: { masldMash: true },
      },
    }));

    for (const id of ["kidney_protection", "heart_failure_protection", "ascvd_protection", "liver_directed_therapy"] as const) {
      const objective = result.objectives.find((item) => item.id === id);
      expect(objective, `missing objective ${id}`).toBeDefined();
      expectTraceableEvidence(objective!.evidence);
    }
  });

  it("keeps clinically-derived missing-data requirements linked to versioned evidence", () => {
    const base = request();
    const result = runDecisionGraphV2(request({
      patient: {
        ...base.patient,
        kidney: { ckd: true },
        cardiovascular: { heartFailure: true },
      },
    }));

    for (const key of ["kidney.eGfr", "kidney.uacrMgG", "cardiovascular.lvefPercent"] as const) {
      const requirement = result.missingData.find((item) => item.key === key);
      expect(requirement, `missing requirement ${key}`).toBeDefined();
      expectTraceableEvidence(requirement!.evidence);
    }
  });

  it("does not mislabel a request-policy requirement as a clinical guideline rule", () => {
    const base = request();
    const result = runDecisionGraphV2(request({
      preferences: {
        ...base.preferences,
        costPreference: "insured_only",
        insuranceProviders: undefined,
      },
    }));
    const requirement = result.missingData.find((item) => item.key === "preferences.insuranceProviders");
    expect(requirement).toBeDefined();
    expect(requirement!.evidence).toEqual([]);
  });
});
