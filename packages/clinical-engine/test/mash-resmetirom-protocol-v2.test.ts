import { describe, expect, it } from "vitest";
import { applyHardGatesV2 } from "../src/decision-graph-v2/gates.js";
import { applyCoreClinicalRulesToInventoryV2 } from "../src/decision-graph-v2/inventory-rules.js";
import {
  applyReviewedMashKnowledgeV2,
  buildReviewedMashDoseRulesV2,
  evaluateReviewedResmetiromProtocolV2,
} from "../src/decision-graph-v2/mash-protocols.js";
import type {
  ClinicalObjectiveV2,
  ClinicalStateV2,
  DecisionGraphInventoryV2,
  DecisionGraphRequestV2,
  KnowledgeMedicationV2,
  PatientContextV2,
  RegimenCandidateV2,
} from "../src/decision-graph-v2/types.js";

const rawResmetirom: KnowledgeMedicationV2 = {
  masterDrugId: "TEST-RESMETIROM",
  genericName: "Resmetirom",
  combination: false,
  therapeuticAreas: ["MASH"],
  therapyGroup: "other",
  primaryLanes: ["liver"],
  routeOptions: ["oral"],
  dosageFormGroups: ["tablet"],
  efficacyBand: "none",
  hypoglycemiaRisk: "minimal",
  weightDirection: "neutral",
  effects: [],
  tags: [],
  evidence: [],
  engineState: "review_required",
};

function emptyInventory(knowledge: KnowledgeMedicationV2[] = [rawResmetirom]): DecisionGraphInventoryV2 {
  return {
    knowledge,
    marketProducts: [],
    doseRules: [],
    insurancePolicies: [],
    medicationGateRules: [],
    regimenConflictRules: [],
    regimenTemplates: [],
    frcProtocolBindings: [],
    insulinConversionRules: [],
    titrationProtocols: [],
  };
}

function patient(overrides: Partial<PatientContextV2> = {}): PatientContextV2 {
  return {
    ageYears: 54,
    pregnancy: false,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    anthropometrics: { weightKg: 85 },
    liver: {
      masldMash: true,
      fibrosisStage: "F3",
      cirrhosis: false,
      decompensatedCirrhosis: false,
    },
    currentMedications: [],
    ...overrides,
  };
}

const state: ClinicalStateV2 = {
  pathway: "maintain_and_monitor",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 0,
  reasons: [],
  evidence: [],
};

const liverObjective: ClinicalObjectiveV2 = {
  id: "liver_directed_therapy",
  lane: "liver",
  level: "strong_preference",
  reason: "MASH is active.",
  evidence: [],
};

function candidate(medication: KnowledgeMedicationV2): RegimenCandidateV2 {
  return {
    regimenId: `single:${medication.masterDrugId}`,
    lane: "liver",
    kind: "single",
    components: [{
      masterDrugId: medication.masterDrugId,
      genericName: medication.genericName,
      therapyGroup: medication.therapyGroup,
      tags: medication.tags ?? [],
      availability: {
        masterDrugId: medication.masterDrugId,
        classification: "current_market",
        mainRecommendationEligible: true,
        moreOptionsEligible: true,
        currentProductIds: ["TEST-REZDIFFRA-80"],
        historicalProductIds: [],
        reasons: ["Synthetic current-market fixture."],
      },
    }],
    efficacyBand: "none",
    hypoglycemiaRisk: "minimal",
    weightProfile: "neutral",
    objectiveCoverage: ["liver_directed_therapy"],
    objectiveStrength: { liver_directed_therapy: "benefit" },
    evidence: medication.evidence,
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "match",
    insuranceFit: "unknown",
    distinctProducts: 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
}

function requestFor(input: PatientContextV2): DecisionGraphRequestV2 {
  const promotedInventory = applyReviewedMashKnowledgeV2(emptyInventory());
  const rules = buildReviewedMashDoseRulesV2(promotedInventory);
  return {
    patient: input,
    preferences: {
      routePreference: "oral_or_injectable",
      costPreference: "no_constraint",
    },
    inventory: { ...promotedInventory, doseRules: rules },
  };
}

describe("reviewed resmetirom MASH protocol", () => {
  it("promotes only exact reviewed resmetirom and registers four label-derived dose rules", () => {
    const result = applyCoreClinicalRulesToInventoryV2(emptyInventory());
    const medication = result.inventory.knowledge.find((item) => item.masterDrugId === "TEST-RESMETIROM");

    expect(medication?.engineState).toBe("approved");
    expect(medication?.therapyGroup).toBe("liver_directed_therapy");
    expect(medication?.effects.some((effect) => effect.objective === "liver_directed_therapy")).toBe(true);
    expect(result.inventory.doseRules.filter((rule) => rule.masterDrugId === "TEST-RESMETIROM")).toHaveLength(4);
    expect(result.report.addedMashDoseRules).toBe(4);
  });

  it("selects the exact standard weight tier and returns a single executable dose plan", () => {
    const request = requestFor(patient());
    const medication = request.inventory.knowledge[0]!;
    const protocol = evaluateReviewedResmetiromProtocolV2(request.patient, medication);
    expect(protocol?.status).toBe("pass");
    expect(protocol?.doseRuleId).toContain("LABEL-RESMETIROM-80-LT100");

    const gated = applyHardGatesV2(request, state, [liverObjective], candidate(medication));
    expect(gated.gate.status).toBe("pass");
    expect(gated.components[0]?.doseOptions).toHaveLength(1);
    expect(gated.components[0]?.dosePlan?.dailyComponents?.[0]?.amount).toBe(80);
    expect(gated.components[0]?.dosePlan?.administrationsPerDay).toBe(1);
  });

  it("uses 100 mg at or above 100 kg", () => {
    const input = patient({ anthropometrics: { weightKg: 100 } });
    const request = requestFor(input);
    const medication = request.inventory.knowledge[0]!;
    const gated = applyHardGatesV2(request, state, [liverObjective], candidate(medication));

    expect(gated.gate.status).toBe("pass");
    expect(gated.components[0]?.dosePlan?.dailyComponents?.[0]?.amount).toBe(100);
  });

  it("applies the label clopidogrel dose reduction without creating a second dose option", () => {
    const input = patient({
      currentMedications: [{ genericName: "Clopidogrel", status: "active", dailyDose: [{ ingredientKey: "clopidogrel", amount: 75, unit: "mg" }], administrationsPerDay: 1 }],
    });
    const request = requestFor(input);
    const medication = request.inventory.knowledge[0]!;
    const gated = applyHardGatesV2(request, state, [liverObjective], candidate(medication));

    expect(gated.gate.status).toBe("pass");
    expect(gated.components[0]?.doseOptions).toHaveLength(1);
    expect(gated.components[0]?.dosePlan?.dailyComponents?.[0]?.amount).toBe(60);
    expect(gated.gate.reasons.join(" ")).toContain("Clopidogrel");
  });

  it("excludes gemfibrozil and blocks incompatible or undocumented affected-statin doses", () => {
    const gemfibrozilRequest = requestFor(patient({
      currentMedications: [{ genericName: "Gemfibrozil", status: "active" }],
    }));
    const gemfibrozilMedication = gemfibrozilRequest.inventory.knowledge[0]!;
    const gemfibrozil = applyHardGatesV2(
      gemfibrozilRequest,
      state,
      [liverObjective],
      candidate(gemfibrozilMedication),
    );
    expect(gemfibrozil.gate.status).toBe("exclude");

    const atorvastatinRequest = requestFor(patient({
      currentMedications: [{
        genericName: "Atorvastatin",
        status: "active",
        dailyDose: [{ ingredientKey: "atorvastatin", amount: 80, unit: "mg" }],
        administrationsPerDay: 1,
      }],
    }));
    const atorvastatinMedication = atorvastatinRequest.inventory.knowledge[0]!;
    const highDoseStatin = applyHardGatesV2(
      atorvastatinRequest,
      state,
      [liverObjective],
      candidate(atorvastatinMedication),
    );
    expect(highDoseStatin.gate.status).toBe("conditional");

    const unknownDoseRequest = requestFor(patient({
      currentMedications: [{ genericName: "Rosuvastatin", status: "active" }],
    }));
    const unknownDoseMedication = unknownDoseRequest.inventory.knowledge[0]!;
    const unknownDose = applyHardGatesV2(
      unknownDoseRequest,
      state,
      [liverObjective],
      candidate(unknownDoseMedication),
    );
    expect(unknownDose.gate.status).toBe("conditional");
  });

  it("fails closed when age, fibrosis, noncirrhotic status or weight is missing and excludes non-indicated stages", () => {
    const promoted = applyReviewedMashKnowledgeV2(emptyInventory()).knowledge[0]!;

    expect(evaluateReviewedResmetiromProtocolV2(patient({ ageYears: undefined }), promoted)?.status).toBe("needs_data");
    expect(evaluateReviewedResmetiromProtocolV2(patient({ liver: { masldMash: true, fibrosisStage: "unknown", cirrhosis: false } }), promoted)?.status).toBe("needs_data");
    expect(evaluateReviewedResmetiromProtocolV2(patient({ liver: { masldMash: true, fibrosisStage: "F3" } }), promoted)?.status).toBe("needs_data");
    expect(evaluateReviewedResmetiromProtocolV2(patient({ anthropometrics: {} }), promoted)?.status).toBe("needs_data");
    expect(evaluateReviewedResmetiromProtocolV2(patient({ liver: { masldMash: true, fibrosisStage: "F4", cirrhosis: true } }), promoted)?.status).toBe("exclude");
    expect(evaluateReviewedResmetiromProtocolV2(patient({ ageYears: 16 }), promoted)?.status).toBe("exclude");
  });
});
