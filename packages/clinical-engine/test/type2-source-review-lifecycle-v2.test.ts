import { describe, expect, it } from "vitest";
import type { MasterDrugRegistryEntry } from "@glymize/contracts";
import {
  applyHardGatesV2,
  buildDecisionGraphInventoryFromContractsV2,
  calculateInsulinConversionV2,
  generateRegimenCandidatesV2,
  lantusLabelEvidenceV2,
  suliquaEuEvidenceV2,
} from "../src/index.js";
import type {
  ClinicalStateV2,
  DecisionGraphInventoryV2,
  DecisionGraphRequestV2,
  EvidenceReferenceV2,
  InsulinConversionRuleV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
  MedicationGateRuleV2,
  RegimenConflictRuleV2,
} from "../src/index.js";

const evidence: EvidenceReferenceV2 = {
  sourceId: "TEST-SOURCE",
  title: "Lifecycle regression evidence",
  version: "1",
  url: "https://example.test/evidence",
};

function medication(id: string, tag: string): KnowledgeMedicationV2 {
  return {
    masterDrugId: id,
    genericName: `Medicine ${id}`,
    combination: false,
    therapeuticAreas: ["Diabetes"],
    therapyGroup: `group_${id.toLowerCase()}`,
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightDirection: "neutral",
    effects: [],
    tags: [tag],
    evidence: [evidence],
    engineState: "approved",
  };
}

function product(id: string): IranMarketProductV2 {
  return {
    productId: `P-${id}`,
    masterDrugId: id,
    nfiMatchState: "verified",
    genericName: `Medicine ${id}`,
    dosageFormGroup: "tablet",
    route: "oral",
    consumptionUnit: "tablet",
    strengthComponents: [{ ingredientKey: id, amount: 1, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 30,
    purchaseUnitLabel: "30 tablets",
    priceToman: 100000,
    license: { everValid: true, currentValid: true },
    marketPresence: "recently_observed",
    observedAt: "2026-09-01T00:00:00.000Z",
  };
}

const state: ClinicalStateV2 = {
  pathway: "modest_intensification",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 1,
  reasons: [],
  evidence: [],
};

function requestWithRules(input: {
  medicationGateRules?: MedicationGateRuleV2[];
  regimenConflictRules?: RegimenConflictRuleV2[];
  currentMedicationId?: string;
}): DecisionGraphRequestV2 {
  const a = medication("A", "tag_a");
  const b = medication("B", "tag_b");
  const inventory: DecisionGraphInventoryV2 = {
    knowledge: [a, b],
    marketProducts: [product("A"), product("B")],
    doseRules: [],
    insurancePolicies: [],
    medicationGateRules: input.medicationGateRules,
    regimenConflictRules: input.regimenConflictRules,
  };
  return {
    patient: {
      glycemia: { currentHba1c: 8, targetHba1c: 7 },
      pregnancy: true,
      currentMedications: input.currentMedicationId
        ? [{
            masterDrugId: input.currentMedicationId,
            genericName: `Medicine ${input.currentMedicationId}`,
            therapyGroup: `group_${input.currentMedicationId.toLowerCase()}`,
          }]
        : undefined,
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory,
  };
}

describe("Type 2 source version and review lifecycle", () => {
  it("requires explicit versions for the two regulatory sources closed by this task", () => {
    expect(lantusLabelEvidenceV2.version).toBe("2025-05-31");
    expect(suliquaEuEvidenceV2.version).toBe("2026-07-02");
  });

  it("preserves Master Registry observed provenance and uses a non-fabricated source-code fallback", () => {
    const base: MasterDrugRegistryEntry = {
      id: "WD-PROV",
      canonicalName: "Provenance medicine",
      searchSynonyms: [],
      combination: false,
      therapeuticAreas: ["Diabetes"],
      drugClass: "Other",
      primaryIndications: ["Type 2 diabetes"],
      guidelineRole: "Supportive test fixture",
      diabetesOrPhenotype: "T2D",
      clinicalEffects: [],
      sourceCodes: ["SRC-1"],
      sourceUrls: ["https://example.test/src"],
      reviewState: "approved",
    };
    const observed = buildDecisionGraphInventoryFromContractsV2({
      masterRegistry: [{ ...base, sourceObservedAt: "2026-08-07T20:49:40.432578+00:00" }],
      marketProducts: [],
    });
    expect(observed.inventory.knowledge[0]?.evidence.find((item) => item.sourceId === "SRC-1")?.version)
      .toBe("2026-08-07T20:49:40.432578+00:00");

    const fallback = buildDecisionGraphInventoryFromContractsV2({ masterRegistry: [base], marketProducts: [] });
    expect(fallback.inventory.knowledge[0]?.evidence.find((item) => item.sourceId === "SRC-1")?.version)
      .toBe("source-code:SRC-1");
  });

  it("does not apply candidate or retired medication gates to live decisions", () => {
    const template: Omit<MedicationGateRuleV2, "reviewState"> = {
      id: "TEST-PREGNANCY-BLOCK",
      masterDrugId: "A",
      when: { fact: "pregnancy", op: "eq", value: true },
      effect: "exclude",
      reason: "TEST gate must be lifecycle-bound",
      evidence: [evidence],
    };
    for (const reviewState of ["candidate", "retired"] as const) {
      const request = requestWithRules({ medicationGateRules: [{ ...template, reviewState }] });
      const candidate = generateRegimenCandidatesV2(request, state)
        .find((item) => item.regimenId === "med:A:glycemic")!;
      const gated = applyHardGatesV2(request, state, [], candidate);
      expect(gated.gate.status).not.toBe("exclude");
      expect(gated.gate.reasons).not.toContain(template.reason);
    }

    const approvedRequest = requestWithRules({
      medicationGateRules: [{ ...template, reviewState: "approved" }],
    });
    const approvedCandidate = generateRegimenCandidatesV2(approvedRequest, state)
      .find((item) => item.regimenId === "med:A:glycemic")!;
    const approved = applyHardGatesV2(approvedRequest, state, [], approvedCandidate);
    expect(approved.gate.status).toBe("exclude");
    expect(approved.gate.reasons).toContain(template.reason);
  });

  it("ignores non-approved regimen conflicts but enforces an approved conflict", () => {
    const template: Omit<RegimenConflictRuleV2, "reviewState"> = {
      id: "TEST-CONFLICT",
      tagA: "tag_a",
      tagB: "tag_b",
      reason: "TEST conflict",
      evidence: [evidence],
    };
    const hasAB = (request: DecisionGraphRequestV2) => generateRegimenCandidatesV2(request, state)
      .some((item) => {
        const ids = item.components.map((component) => component.masterDrugId);
        return ids.includes("A") && ids.includes("B");
      });

    expect(hasAB(requestWithRules({
      regimenConflictRules: [{ ...template, reviewState: "candidate" }],
      currentMedicationId: "A",
    }))).toBe(true);
    expect(hasAB(requestWithRules({
      regimenConflictRules: [{ ...template, reviewState: "retired" }],
      currentMedicationId: "A",
    }))).toBe(true);
    expect(hasAB(requestWithRules({
      regimenConflictRules: [{ ...template, reviewState: "approved" }],
      currentMedicationId: "A",
    }))).toBe(false);
  });

  it("executes only approved insulin conversion edges", () => {
    const baseRule: Omit<InsulinConversionRuleV2, "reviewState"> = {
      id: "TEST-CONVERSION",
      sourceMasterDrugId: "SRC",
      targetMasterDrugId: "DST",
      sourceFrequencyPerDay: [1],
      factor: 0.8,
      executionStatus: "executable",
      evidenceTier: "regulatory_label",
      reason: "TEST conversion",
      evidence: [evidence],
    };
    const request = {
      sourceMasterDrugId: "SRC",
      targetMasterDrugId: "DST",
      sourceTotalDailyUnits: 40,
      sourceFrequencyPerDay: 1,
    };
    expect(calculateInsulinConversionV2(
      request,
      [{ ...baseRule, reviewState: "candidate" }],
    ).status).toBe("unsupported");
    expect(calculateInsulinConversionV2(
      request,
      [{ ...baseRule, reviewState: "retired" }],
    ).status).toBe("unsupported");
    const approved = calculateInsulinConversionV2(
      request,
      [{ ...baseRule, reviewState: "approved" }],
    );
    expect(approved.status).toBe("executable");
    expect(approved.targetStartingTotalDailyUnits).toBe(32);
  });
});
