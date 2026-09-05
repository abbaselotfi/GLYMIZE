import { afterEach, describe, expect, it } from "vitest";
import {
  activateApprovedClinicalRulePack,
  bundledClinicalRulePack,
  resetClinicalRulePackForTests,
} from "../src/rule-pack.js";
import {
  buildDecisionGraphPolicyV2FromActiveRulePack,
} from "../src/decision-graph-v2/policy.js";
import { buildCoreAda2026DecisionRulesV2 } from "../src/decision-graph-v2/safety-rules.js";
import { buildReviewedProductDoseRulesV2 } from "../src/decision-graph-v2/product-dose-rules.js";
import { runDecisionGraphV2 } from "../src/decision-graph-v2/engine.js";
import type {
  DecisionGraphRequestV2,
  KnowledgeMedicationV2,
} from "../src/decision-graph-v2/types.js";

function knowledge(overrides: Partial<KnowledgeMedicationV2> = {}): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-TEST",
    genericName: "Test medicine",
    combination: false,
    therapeuticAreas: ["Diabetes"],
    therapyGroup: "other",
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "high",
    hypoglycemiaRisk: "minimal",
    weightDirection: "neutral",
    effects: [],
    tags: [],
    evidence: [{ sourceId: "test", title: "Test", url: "https://example.test" }],
    engineState: "approved",
    ...overrides,
  };
}

function graphRequest(currentHba1c: number): DecisionGraphRequestV2 {
  return {
    patient: {
      glycemia: { currentHba1c, targetHba1c: 7 },
      anthropometrics: { weightKg: 80 },
    },
    preferences: {
      routePreference: "oral_or_injectable",
      costPreference: "no_constraint",
    },
    inventory: {
      knowledge: [],
      marketProducts: [],
      doseRules: [],
      insurancePolicies: [],
    },
  };
}

afterEach(() => {
  resetClinicalRulePackForTests();
});

describe("Phase 3 Task 3 — clinical threshold authority", () => {
  it("derives Decision Graph pathway thresholds from the active approved rule pack", () => {
    const pack = structuredClone(bundledClinicalRulePack);
    pack.version = "2026.08.1-test-threshold-authority";
    pack.type2.severeHyperglycemiaA1cThreshold = 9.4;
    pack.type2.combinationTherapyGap = 1.2;
    activateApprovedClinicalRulePack(pack);

    const policy = buildDecisionGraphPolicyV2FromActiveRulePack();
    expect(policy.severeHyperglycemiaA1cExclusiveAbove).toBe(9.4);
    expect(policy.combinationTherapyA1cGapAtOrAbove).toBe(1.2);

    const result = runDecisionGraphV2(graphRequest(9.5));
    expect(result.clinicalState.severeHyperglycemia).toBe(true);
    expect(result.clinicalState.pathway).toBe("insulin_centered");
  });

  it("derives metformin renal hard-gate thresholds from the same active rule pack", () => {
    const pack = structuredClone(bundledClinicalRulePack);
    pack.version = "2026.08.1-test-metformin-threshold-authority";
    pack.type2.metforminContraindicatedBelowEgfr = 28;
    pack.type2.metforminReviewBelowEgfr = 42;
    activateApprovedClinicalRulePack(pack);

    const rules = buildCoreAda2026DecisionRulesV2([
      knowledge({ masterDrugId: "WD-MET", genericName: "Metformin", therapyGroup: "biguanide" }),
    ]);
    const exclude = rules.medicationGateRules.find((rule) => rule.effect === "exclude" && rule.masterDrugId === "WD-MET");
    const conditional = rules.medicationGateRules.find((rule) => rule.effect === "conditional" && rule.masterDrugId === "WD-MET");

    expect(exclude?.when).toEqual({ fact: "kidney.eGfr", op: "lt", value: 28 });
    expect(conditional?.when).toEqual({
      all: [
        { fact: "kidney.eGfr", op: "gte", value: 28 },
        { fact: "kidney.eGfr", op: "lt", value: 42 },
      ],
    });
  });

  it("keeps sitagliptin label renal-dose boundaries independent from metformin core thresholds", () => {
    const pack = structuredClone(bundledClinicalRulePack);
    pack.version = "2026.08.1-test-label-threshold-separation";
    pack.type2.metforminContraindicatedBelowEgfr = 28;
    pack.type2.metforminReviewBelowEgfr = 42;
    activateApprovedClinicalRulePack(pack);

    const rules = buildReviewedProductDoseRulesV2({
      knowledge: [knowledge({ masterDrugId: "WD-SITA", genericName: "Sitagliptin", therapyGroup: "dpp4_inhibitor" })],
    });
    const predicates = rules
      .filter((rule) => rule.masterDrugId === "WD-SITA")
      .map((rule) => rule.eligibility);

    expect(predicates).toContainEqual({ fact: "kidney.eGfr", op: "gte", value: 45 });
    expect(predicates).toContainEqual({
      all: [
        { fact: "kidney.eGfr", op: "gte", value: 30 },
        { fact: "kidney.eGfr", op: "lt", value: 45 },
      ],
    });
    expect(predicates).toContainEqual({ fact: "kidney.eGfr", op: "lt", value: 30 });
  });
});
