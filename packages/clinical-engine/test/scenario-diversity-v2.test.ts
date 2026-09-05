import { describe, expect, it } from "vitest";
import {
  chooseDiverseAlternatives,
  defaultDecisionGraphPolicyV2,
  diversityKeyV2,
  scenarioDiversityAxesV2,
  selectLexicographicallyV2,
  type ClinicalObjectiveV2,
  type DecisionGraphRequestV2,
  type RegimenCandidateV2,
  type RegimenKindV2,
} from "../src/decision-graph-v2/index.js";

const availability = {
  masterDrugId: "placeholder",
  classification: "current_market" as const,
  mainRecommendationEligible: true,
  moreOptionsEligible: true,
  currentProductIds: ["P1"],
  historicalProductIds: [],
  reasons: [],
};

function candidate(input: {
  id: string;
  masterDrugId?: string;
  therapyGroup?: string;
  kind?: RegimenKindV2;
  objectives?: RegimenCandidateV2["objectiveCoverage"];
  cost?: number;
  burden?: number;
  distinctProducts?: number;
  insuranceFit?: RegimenCandidateV2["insuranceFit"];
  route?: string;
}): RegimenCandidateV2 {
  const masterDrugId = input.masterDrugId ?? input.id;
  const therapyGroup = input.therapyGroup ?? "oral_glucose_lowering";
  return {
    regimenId: input.id,
    lane: "glycemic",
    kind: input.kind ?? "single",
    components: [{
      masterDrugId,
      genericName: masterDrugId,
      therapyGroup,
      tags: [],
      availability: { ...availability, masterDrugId },
      selectedProduct: {
        productId: `P-${masterDrugId}`,
        masterDrugId,
        nfiMatchState: "verified",
        genericName: masterDrugId,
        dosageFormGroup: "tablet",
        route: input.route ?? "oral",
        consumptionUnit: "tablet",
        strengthComponents: [{ ingredientKey: masterDrugId, amount: 1, unit: "mg" }],
        consumptionUnitsPerPurchaseUnit: 30,
        purchaseUnitLabel: "box",
        license: { everValid: true, currentValid: true },
        marketPresence: "confirmed_active",
        observedAt: "2026-09-05",
      },
    }],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightProfile: "neutral",
    objectiveCoverage: input.objectives ?? ["glycemic_control"],
    objectiveStrength: { glycemic_control: "benefit" },
    evidence: [],
    gate: { status: "pass", reasons: [], evidence: [] },
    routeFit: "match",
    insuranceFit: input.insuranceFit ?? "eligible",
    monthlyPatientCostToman: input.cost ?? 100_000,
    dailyAdministrationBurden: input.burden ?? 1,
    distinctProducts: input.distinctProducts ?? 1,
    reasons: [],
    cautions: [],
    preferenceConflicts: [],
  };
}

function request(
  preferences: Partial<DecisionGraphRequestV2["preferences"]> = {},
): DecisionGraphRequestV2 {
  return {
    patient: { glycemia: { currentHba1c: 8, targetHba1c: 7 } },
    preferences: {
      routePreference: "oral_or_injectable",
      costPreference: "no_constraint",
      ...preferences,
    },
    inventory: {
      knowledge: [],
      marketProducts: [],
      doseRules: [],
      insurancePolicies: [],
    },
  };
}

const glycemicObjective: ClinicalObjectiveV2 = {
  id: "glycemic_control",
  lane: "glycemic",
  level: "mandatory",
  reason: "test",
  evidence: [],
};
const kidneyObjective: ClinicalObjectiveV2 = {
  id: "kidney_protection",
  lane: "kidney",
  level: "mandatory",
  reason: "test",
  evidence: [],
};

describe("Phase 4 Task 9 scenario diversity", () => {
  it("keeps the reviewed policy at primary plus at most two alternatives", () => {
    expect(defaultDecisionGraphPolicyV2.topAlternativeCount).toBe(2);
  });

  it("treats generic composition and clinical structure as diversity but not price alone", () => {
    const metformin = candidate({ id: "metformin", masterDrugId: "WD-METFORMIN", cost: 80_000 });
    const sameClinicalScenarioDifferentPrice = candidate({ id: "metformin-price-variant", masterDrugId: "WD-METFORMIN", cost: 120_000 });
    const sglt2 = candidate({
      id: "empagliflozin",
      masterDrugId: "WD-EMPAGLIFLOZIN",
      objectives: ["glycemic_control", "kidney_protection"],
    });

    expect(diversityKeyV2(sameClinicalScenarioDifferentPrice)).toBe(diversityKeyV2(metformin));
    expect(diversityKeyV2(sglt2)).not.toBe(diversityKeyV2(metformin));
    expect(scenarioDiversityAxesV2(sglt2).masterDrugIds).toEqual(["WD-EMPAGLIFLOZIN"]);
  });

  it("never pads alternatives with a clinically redundant card", () => {
    const primary = candidate({ id: "primary", masterDrugId: "WD-METFORMIN" });
    const duplicate = candidate({ id: "same-axes", masterDrugId: "WD-METFORMIN", cost: 75_000 });
    const organProtective = candidate({
      id: "organ",
      masterDrugId: "WD-EMPAGLIFLOZIN",
      objectives: ["glycemic_control", "kidney_protection"],
    });
    const simplerFdc = candidate({
      id: "fdc",
      masterDrugId: "WD-FDC",
      therapyGroup: "fixed_dose_combination",
      kind: "fixed_dose_combination",
      burden: 1,
    });

    const chosen = chooseDiverseAlternatives(
      primary,
      [primary, duplicate, organProtective, simplerFdc],
      2,
    );
    expect(chosen.map((item) => item.regimenId)).toEqual(["organ", "fdc"]);
    expect(new Set([diversityKeyV2(primary), ...chosen.map(diversityKeyV2)]).size).toBe(3);

    const onlyDuplicate = chooseDiverseAlternatives(primary, [primary, duplicate], 2);
    expect(onlyDuplicate).toEqual([]);
  });

  it("preserves mandatory organ protection ahead of cheaper or simpler but incomplete options", () => {
    const kidneyProtective = candidate({
      id: "kidney-protective",
      masterDrugId: "WD-SGLT2",
      objectives: ["glycemic_control", "kidney_protection"],
      cost: 400_000,
      burden: 2,
      insuranceFit: "unknown",
    });
    const cheapIncomplete = candidate({
      id: "cheap-incomplete",
      masterDrugId: "WD-CHEAP",
      cost: 30_000,
      burden: 1,
      insuranceFit: "eligible",
    });

    const ordered = selectLexicographicallyV2(
      [cheapIncomplete, kidneyProtective],
      request({ costPreference: "moderate", adherencePriority: "simplify_regimen" }),
      [glycemicObjective, kidneyObjective],
    );
    expect(ordered[0]?.regimenId).toBe("kidney-protective");
  });

  it("lets explicit cost preference and simplification preference change ordering only after clinical equivalence", () => {
    const cheaperConditional = candidate({
      id: "cheap",
      masterDrugId: "WD-CHEAP",
      cost: 50_000,
      burden: 3,
      distinctProducts: 2,
      insuranceFit: "conditional",
    });
    const insuredExpensive = candidate({
      id: "insured",
      masterDrugId: "WD-INSURED",
      cost: 150_000,
      burden: 2,
      distinctProducts: 2,
      insuranceFit: "eligible",
    });
    const simpleExpensive = candidate({
      id: "simple",
      masterDrugId: "WD-SIMPLE",
      cost: 300_000,
      burden: 1,
      distinctProducts: 1,
      insuranceFit: "unknown",
    });

    const costOrdered = selectLexicographicallyV2(
      [insuredExpensive, cheaperConditional, simpleExpensive],
      request({ costPreference: "moderate" }),
      [glycemicObjective],
    );
    expect(costOrdered[0]?.regimenId).toBe("cheap");

    const standardOrdered = selectLexicographicallyV2(
      [insuredExpensive, cheaperConditional, simpleExpensive],
      request({ costPreference: "no_constraint" }),
      [glycemicObjective],
    );
    expect(standardOrdered[0]?.regimenId).toBe("insured");

    const simplifyOrdered = selectLexicographicallyV2(
      [insuredExpensive, cheaperConditional, simpleExpensive],
      request({ costPreference: "no_constraint", adherencePriority: "simplify_regimen" }),
      [glycemicObjective],
    );
    expect(simplifyOrdered[0]?.regimenId).toBe("simple");

    const alternatives = chooseDiverseAlternatives(
      simplifyOrdered[0]!,
      simplifyOrdered,
      defaultDecisionGraphPolicyV2.topAlternativeCount,
    );
    expect(alternatives).toHaveLength(2);
    expect(new Set([diversityKeyV2(simplifyOrdered[0]!), ...alternatives.map(diversityKeyV2)]).size).toBe(3);
  });
});
