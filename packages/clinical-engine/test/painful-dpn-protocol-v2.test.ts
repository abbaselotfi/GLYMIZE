import { describe, expect, it } from "vitest";
import {
  applyReviewedPainfulDpnKnowledgeV2,
  approvedDoseRulesForV2,
  buildFactMapV2,
  buildReviewedPainfulDpnDoseRulesV2,
  buildReviewedPainfulDpnGateRulesV2,
  calculateProductMonthlyCostV2,
  defaultDecisionGraphPolicyV2,
  resolveClinicalObjectivesV2,
  resolveDosePlanV2,
  type ClinicalStateV2,
  type DecisionGraphInventoryV2,
  type DecisionGraphRequestV2,
  type IranMarketProductV2,
  type KnowledgeMedicationV2,
  type PatientContextV2,
} from "../src/decision-graph-v2/index.js";

const evidence = [{ sourceId: "worlddrug-test", title: "WorldDrug fixture", url: "https://example.test/worlddrug" }];

function medication(
  masterDrugId: string,
  genericName: string,
  overrides: Partial<KnowledgeMedicationV2> = {},
): KnowledgeMedicationV2 {
  return {
    masterDrugId,
    genericName,
    combination: false,
    therapeuticAreas: ["Neuropathy"],
    therapyGroup: "other",
    primaryLanes: [],
    routeOptions: ["oral"],
    dosageFormGroups: ["capsule"],
    efficacyBand: "none",
    hypoglycemiaRisk: "moderate",
    weightDirection: "unknown",
    effects: [],
    tags: [],
    evidence,
    engineState: "review_required",
    ...overrides,
  };
}

const baseInventory: DecisionGraphInventoryV2 = {
  knowledge: [
    medication("WD-0225", "Pregabalin"),
    medication("WD-0227", "Duloxetine"),
    medication("WD-OPIOID", "Tapentadol"),
  ],
  marketProducts: [],
  doseRules: [],
  insurancePolicies: [],
};

const state: ClinicalStateV2 = {
  pathway: "maintain_and_monitor",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 0,
  reasons: [],
  evidence: [],
};

function painfulDpnPatient(overrides: Partial<PatientContextV2> = {}): PatientContextV2 {
  return {
    ageYears: 60,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    neuropathy: {
      diabeticPeripheralNeuropathyConfirmed: true,
      painfulSymptoms: true,
      atypicalFeaturesPresent: false,
    },
    kidney: {
      eGfr: 80,
      creatinineClearanceMlMin: 80,
      dialysis: false,
    },
    liver: {
      chronicLiverDisease: false,
      cirrhosis: false,
    },
    medicationSafety: {
      maoiUseOrRecentExposure: false,
      substantialAlcoholUse: false,
      knownPregabalinHypersensitivity: false,
    },
    ...overrides,
  };
}

function request(patient: PatientContextV2): DecisionGraphRequestV2 {
  return {
    patient,
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: baseInventory,
  };
}

function capsuleProduct(packSize: number): IranMarketProductV2 {
  return {
    productId: `PREG-50-${packSize}`,
    masterDrugId: "WD-0225",
    nfiMatchState: "verified",
    genericName: "Pregabalin",
    brandName: `Pregabalin ${packSize}`,
    dosageFormGroup: "capsule",
    route: "oral",
    consumptionUnit: "capsule",
    strengthComponents: [{ ingredientKey: "WD-0225", amount: 50, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: packSize,
    purchaseUnitLabel: `${packSize} capsules`,
    priceToman: packSize * 10_000,
    license: { everValid: true, currentValid: true },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-05T00:00:00.000Z",
  };
}

describe("reviewed painful DPN knowledge boundary", () => {
  it("promotes only pregabalin and duloxetine, never a generic opioid/neuropathy entry", () => {
    const inventory = applyReviewedPainfulDpnKnowledgeV2(baseInventory);
    const pregabalin = inventory.knowledge.find((item) => item.genericName === "Pregabalin")!;
    const duloxetine = inventory.knowledge.find((item) => item.genericName === "Duloxetine")!;
    const opioid = inventory.knowledge.find((item) => item.genericName === "Tapentadol")!;

    expect(pregabalin.engineState).toBe("approved");
    expect(pregabalin.primaryLanes).toContain("neuropathy");
    expect(pregabalin.effects.some((item) => item.objective === "painful_dpn_symptom_control")).toBe(true);
    expect(duloxetine.engineState).toBe("approved");
    expect(duloxetine.primaryLanes).toContain("neuropathy");
    expect(opioid.engineState).toBe("review_required");
    expect(opioid.primaryLanes).not.toContain("neuropathy");
  });

  it("creates the DPN objective only for explicitly confirmed painful typical DPN", () => {
    const yes = resolveClinicalObjectivesV2(request(painfulDpnPatient()), state, defaultDecisionGraphPolicyV2);
    expect(yes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "painful_dpn_symptom_control", lane: "neuropathy", level: "mandatory" }),
    ]));

    const unconfirmed = resolveClinicalObjectivesV2(request(painfulDpnPatient({ neuropathy: {
      diabeticPeripheralNeuropathyConfirmed: false,
      painfulSymptoms: true,
      atypicalFeaturesPresent: false,
    } })), state, defaultDecisionGraphPolicyV2);
    expect(unconfirmed.some((item) => item.id === "painful_dpn_symptom_control")).toBe(false);

    const atypical = resolveClinicalObjectivesV2(request(painfulDpnPatient({ neuropathy: {
      diabeticPeripheralNeuropathyConfirmed: true,
      painfulSymptoms: true,
      atypicalFeaturesPresent: true,
    } })), state, defaultDecisionGraphPolicyV2);
    expect(atypical.some((item) => item.id === "painful_dpn_symptom_control")).toBe(false);
  });
});

describe("reviewed painful DPN dose and hard-safety rules", () => {
  const reviewed = applyReviewedPainfulDpnKnowledgeV2(baseInventory);
  const rules = buildReviewedPainfulDpnDoseRulesV2(reviewed);
  const gates = buildReviewedPainfulDpnGateRulesV2(reviewed.knowledge);

  it("resolves pregabalin 50 mg TID only with CrCl >=60 and explicit safety facts", () => {
    const patient = painfulDpnPatient();
    const facts = buildFactMapV2(patient, false);
    const approved = approvedDoseRulesForV2("WD-0225", rules, facts, "initiation", "neuropathy");
    expect(approved).toHaveLength(1);
    const plan = resolveDosePlanV2(approved[0]!, patient, state)!;
    expect(plan.dailyComponents).toEqual([{ ingredientKey: "WD-0225", amount: 150, unit: "mg" }]);
    expect(plan.perAdministrationComponents).toEqual([{ ingredientKey: "WD-0225", amount: 50, unit: "mg" }]);
    expect(plan.administrationsPerDay).toBe(3);
  });

  it("does not invent a pregabalin schedule for ambiguous intermediate renal bands or dialysis", () => {
    for (const creatinineClearanceMlMin of [45, 20]) {
      const patient = painfulDpnPatient({ kidney: { eGfr: 45, creatinineClearanceMlMin, dialysis: false } });
      expect(approvedDoseRulesForV2("WD-0225", rules, buildFactMapV2(patient, false), "initiation", "neuropathy")).toHaveLength(0);
    }
    const dialysis = painfulDpnPatient({ kidney: { eGfr: 10, creatinineClearanceMlMin: 10, dialysis: true } });
    expect(approvedDoseRulesForV2("WD-0225", rules, buildFactMapV2(dialysis, false), "initiation", "neuropathy")).toHaveLength(0);
  });

  it("uses the unambiguous severe-renal pregabalin starting dose below CrCl 15 when not on dialysis", () => {
    const patient = painfulDpnPatient({ kidney: { eGfr: 12, creatinineClearanceMlMin: 12, dialysis: false } });
    const approved = approvedDoseRulesForV2("WD-0225", rules, buildFactMapV2(patient, false), "initiation", "neuropathy");
    expect(approved).toHaveLength(1);
    const plan = resolveDosePlanV2(approved[0]!, patient, state)!;
    expect(plan.dailyComponents).toEqual([{ ingredientKey: "WD-0225", amount: 25, unit: "mg" }]);
    expect(plan.administrationsPerDay).toBe(1);
  });

  it("requires explicit renal/hepatic/MAOI/alcohol safety reconciliation for duloxetine 60 mg QD", () => {
    const patient = painfulDpnPatient();
    const approved = approvedDoseRulesForV2("WD-0227", rules, buildFactMapV2(patient, false), "initiation", "neuropathy");
    expect(approved).toHaveLength(1);
    const plan = resolveDosePlanV2(approved[0]!, patient, state)!;
    expect(plan.dailyComponents).toEqual([{ ingredientKey: "WD-0227", amount: 60, unit: "mg" }]);
    expect(plan.administrationsPerDay).toBe(1);

    const missingSafety = painfulDpnPatient({ medicationSafety: undefined });
    expect(approvedDoseRulesForV2("WD-0227", rules, buildFactMapV2(missingSafety, false), "initiation", "neuropathy")).toHaveLength(0);
  });

  it("registers label exclusions for pregabalin hypersensitivity and duloxetine renal/hepatic/MAOI/alcohol risk", () => {
    expect(gates.some((rule) => rule.id.startsWith("LABEL-PREGABALIN-HYPERSENSITIVITY"))).toBe(true);
    expect(gates.some((rule) => rule.id.startsWith("LABEL-DULOXETINE-MAOI"))).toBe(true);
    expect(gates.some((rule) => rule.id.startsWith("LABEL-DULOXETINE-RENAL-LT30"))).toBe(true);
    expect(gates.some((rule) => rule.id.startsWith("LABEL-DULOXETINE-CHRONIC-LIVER"))).toBe(true);
    expect(gates.some((rule) => rule.id.startsWith("LABEL-DULOXETINE-SUBSTANTIAL-ALCOHOL"))).toBe(true);
  });
});

describe("generic package-aware costing for painful DPN", () => {
  it("calculates 90 pregabalin capsules/30 days correctly for 28, 30 and 60-count packs", () => {
    const reviewed = applyReviewedPainfulDpnKnowledgeV2(baseInventory);
    const rules = buildReviewedPainfulDpnDoseRulesV2(reviewed);
    const patient = painfulDpnPatient();
    const rule = approvedDoseRulesForV2("WD-0225", rules, buildFactMapV2(patient, false), "initiation", "neuropathy")[0]!;
    const dose = resolveDosePlanV2(rule, patient, state)!;
    const preferences = { routePreference: "oral_or_injectable" as const, costPreference: "no_constraint" as const };

    const c28 = calculateProductMonthlyCostV2({ product: capsuleProduct(28), dose, insurancePolicies: [], preferences })!;
    const c30 = calculateProductMonthlyCostV2({ product: capsuleProduct(30), dose, insurancePolicies: [], preferences })!;
    const c60 = calculateProductMonthlyCostV2({ product: capsuleProduct(60), dose, insurancePolicies: [], preferences })!;

    expect(c28.consumptionUnits30Days).toBe(90);
    expect(c28.purchaseUnitsNeeded30Days).toBe(4);
    expect(c28.leftoverConsumptionUnitsAfter30Days).toBe(22);
    expect(c30.purchaseUnitsNeeded30Days).toBe(3);
    expect(c30.leftoverConsumptionUnitsAfter30Days).toBe(0);
    expect(c60.purchaseUnitsNeeded30Days).toBe(2);
    expect(c60.leftoverConsumptionUnitsAfter30Days).toBe(30);
  });
});
