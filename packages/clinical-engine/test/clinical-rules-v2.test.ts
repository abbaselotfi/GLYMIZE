import { describe, expect, it } from "vitest";
import {
  applyCoreClinicalRulesToInventoryV2,
  buildAda2026InsulinDoseRulesV2,
  buildCoreAda2026DecisionRulesV2,
  defaultDecisionGraphPolicyV2,
  normalizeKnowledgeMedicationWithAda2026V2,
  runInsulinDecisionSubgraphV2,
} from "../src/index.js";
import type { DecisionGraphInventoryV2, KnowledgeMedicationV2, PatientContextV2 } from "../src/index.js";

function knowledge(overrides: Partial<KnowledgeMedicationV2> = {}): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-TEST",
    genericName: "Test medicine",
    combination: false,
    therapeuticAreas: ["Diabetes"],
    therapyGroup: "other",
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "none",
    hypoglycemiaRisk: "moderate",
    weightDirection: "unknown",
    effects: [],
    tags: [],
    evidence: [{ sourceId: "world", title: "WorldDrug", url: "https://example.test" }],
    engineState: "review_required",
    ...overrides,
  };
}

const emptyInventory: DecisionGraphInventoryV2 = {
  knowledge: [],
  marketProducts: [],
  doseRules: [],
  insurancePolicies: [],
};

describe("ADA 2026 clinical knowledge normalization", () => {
  it("promotes a non-combination metformin record once the guideline efficacy profile resolves the prior unstructured field", () => {
    const result = normalizeKnowledgeMedicationWithAda2026V2(knowledge({ genericName: "Metformin", therapyGroup: "biguanide" }));
    expect(result.medication.efficacyBand).toBe("high");
    expect(result.medication.hypoglycemiaRisk).toBe("minimal");
    expect(result.medication.weightDirection).toBe("neutral");
    expect(result.medication.engineState).toBe("approved");
  });

  it("does not override explicit molecule-level very-high efficacy with a lower class floor", () => {
    const result = normalizeKnowledgeMedicationWithAda2026V2(knowledge({
      genericName: "Semaglutide, subcutaneous",
      therapyGroup: "glp_1_receptor_agonist",
      efficacyBand: "very_high",
      engineState: "approved",
    }));
    expect(result.medication.efficacyBand).toBe("very_high");
  });

  it("keeps unresolved FDC knowledge under review rather than promoting it from a class profile", () => {
    const result = normalizeKnowledgeMedicationWithAda2026V2(knowledge({
      genericName: "Metformin/Empagliflozin",
      combination: true,
      therapyGroup: "sglt2_inhibitor",
    }));
    expect(result.medication.engineState).toBe("review_required");
  });
});

describe("categorical safety rules", () => {
  it("creates a hard metformin renal gate and DPP4/GLP1 regimen conflict", () => {
    const rules = buildCoreAda2026DecisionRulesV2([
      knowledge({ masterDrugId: "WD-MET", genericName: "Metformin", therapyGroup: "biguanide", engineState: "approved" }),
    ]);
    expect(rules.medicationGateRules.some((rule) => rule.masterDrugId === "WD-MET" && rule.effect === "exclude")).toBe(true);
    expect(rules.regimenConflictRules.some((rule) => rule.tagA === "dpp4_inhibitor" && rule.tagB === "glp_1_receptor_agonist")).toBe(true);
  });
});

describe("ADA 2026 insulin subgraph", () => {
  it("requires weight before a basal starting dose is executable", () => {
    const patient: PatientContextV2 = {
      glycemia: { currentHba1c: 11, targetHba1c: 7 },
    };
    const state = {
      pathway: "insulin_centered" as const,
      insulinAction: "evaluate_start_basal" as const,
      severeHyperglycemia: true,
      hba1cGap: 4,
      reasons: [],
      evidence: [],
    };
    const result = runInsulinDecisionSubgraphV2(patient, state, defaultDecisionGraphPolicyV2);
    expect(result.status).toBe("needs_data");
    expect(result.requiredInputs).toContain("anthropometrics.weightKg");
  });

  it("detects the ADA overbasalization signal from a >=50 mg/dL bedtime-to-morning differential", () => {
    const patient: PatientContextV2 = {
      glycemia: {
        currentHba1c: 8.2,
        targetHba1c: 7,
        fastingPlasmaGlucoseMgDl: 110,
        smbg: { bedtimeMgDl: [190, 180, 200], fastingMgDl: [120, 110, 130] },
      },
      currentMedications: [{ genericName: "Insulin glargine", therapyGroup: "basal_insulin_analog", basalInsulinUnitsPerDay: 30 }],
    };
    const state = {
      pathway: "modest_intensification" as const,
      insulinAction: "request_postprandial_pattern" as const,
      severeHyperglycemia: false,
      hba1cGap: 1.2,
      fastingAtTarget: true,
      postprandialAboveTarget: false,
      reasons: [],
      evidence: [],
    };
    const result = runInsulinDecisionSubgraphV2(patient, state, defaultDecisionGraphPolicyV2);
    expect(result.overbasalization.suspected).toBe(true);
    expect(result.status).toBe("consider_glp1_or_frc");
  });

  it("builds weight-based basal and 4U-or-10%-basal prandial dose rules only for approved insulin knowledge", () => {
    const basal = knowledge({ masterDrugId: "WD-BASAL", genericName: "Insulin glargine", therapyGroup: "basal_insulin_analog", routeOptions: ["subcutaneous"], engineState: "approved", efficacyBand: "high" });
    const bolus = knowledge({ masterDrugId: "WD-BOLUS", genericName: "Insulin aspart", therapyGroup: "prandial_insulin_analog", routeOptions: ["subcutaneous"], engineState: "approved", efficacyBand: "high" });
    const rules = buildAda2026InsulinDoseRulesV2([basal, bolus]);
    expect(rules).toHaveLength(2);
    expect(rules.some((rule) => rule.formula.kind === "weight_based_daily")).toBe(true);
    expect(rules.some((rule) => rule.formula.kind === "prandial_initial")).toBe(true);
  });

  it("applies the normalized clinical profiles and core rules to the inventory without scores", () => {
    const result = applyCoreClinicalRulesToInventoryV2({
      ...emptyInventory,
      knowledge: [knowledge({ masterDrugId: "WD-MET", genericName: "Metformin", therapyGroup: "biguanide" })],
    });
    expect(result.inventory.knowledge[0]?.engineState).toBe("approved");
    expect(result.inventory.medicationGateRules?.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/priorityScore|decisionVector|scoreMedication/);
  });
});
