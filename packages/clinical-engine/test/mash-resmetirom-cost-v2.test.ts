import { describe, expect, it } from "vitest";
import { calculateProductMonthlyCostV2 } from "../src/decision-graph-v2/cost.js";
import { resolveDosePlanV2 } from "../src/decision-graph-v2/dose.js";
import {
  applyReviewedMashKnowledgeV2,
  buildReviewedMashDoseRulesV2,
  evaluateReviewedResmetiromProtocolV2,
} from "../src/decision-graph-v2/mash-protocols.js";
import type {
  ClinicalStateV2,
  DecisionGraphInventoryV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
  PatientContextV2,
} from "../src/decision-graph-v2/types.js";

const raw: KnowledgeMedicationV2 = {
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

const baseInventory: DecisionGraphInventoryV2 = {
  knowledge: [raw],
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

function patient(weightKg = 85): PatientContextV2 {
  return {
    ageYears: 55,
    pregnancy: false,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    anthropometrics: { weightKg },
    liver: {
      masldMash: true,
      fibrosisStage: "F2",
      cirrhosis: false,
      decompensatedCirrhosis: false,
    },
    currentMedications: [],
  };
}

function product(strengthMg: number, priceToman: number): IranMarketProductV2 {
  return {
    productId: `REZDIFFRA-${strengthMg}`,
    masterDrugId: "TEST-RESMETIROM",
    nfiMatchState: "verified",
    genericName: "Resmetirom",
    brandName: "Synthetic RezDiffra fixture",
    dosageFormGroup: "tablet",
    route: "oral",
    consumptionUnit: "tablet",
    strengthComponents: [{ ingredientKey: "TEST-RESMETIROM", amount: strengthMg, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 30,
    purchaseUnitLabel: "box",
    priceToman,
    priceObservedAt: "2026-09-05",
    license: { everValid: true, currentValid: true },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-05",
  };
}

describe("resmetirom dose -> quantity -> price chain", () => {
  it("converts the 80 mg daily rule into 30 tablets and one 30-count purchase unit", () => {
    const inventory = applyReviewedMashKnowledgeV2(baseInventory);
    const medication = inventory.knowledge[0]!;
    const input = patient(85);
    const selected = evaluateReviewedResmetiromProtocolV2(input, medication);
    expect(selected?.status).toBe("pass");

    const rule = buildReviewedMashDoseRulesV2(inventory).find((item) => item.id === selected?.doseRuleId);
    expect(rule).toBeDefined();
    const dose = resolveDosePlanV2(rule!, input, state);
    expect(dose?.dailyComponents?.[0]?.amount).toBe(80);

    const cost = calculateProductMonthlyCostV2({
      product: product(80, 3_600_000),
      dose: dose!,
      insurancePolicies: [],
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    });

    expect(cost?.consumptionUnitsPerDay).toBe(1);
    expect(cost?.consumptionUnits30Days).toBe(30);
    expect(cost?.purchaseUnitsNeeded30Days).toBe(1);
    expect(cost?.cashPurchaseCostToman).toBe(3_600_000);
    expect(cost?.normalized30DayTreatmentCostToman).toBe(3_600_000);
    expect(cost?.leftoverConsumptionUnitsAfter30Days).toBe(0);
  });

  it("fails closed when the tablet strength cannot exactly deliver the selected per-administration dose", () => {
    const inventory = applyReviewedMashKnowledgeV2(baseInventory);
    const medication = inventory.knowledge[0]!;
    const input = patient(85);
    const selected = evaluateReviewedResmetiromProtocolV2(input, medication)!;
    const rule = buildReviewedMashDoseRulesV2(inventory).find((item) => item.id === selected.doseRuleId)!;
    const dose = resolveDosePlanV2(rule, input, state)!;

    expect(calculateProductMonthlyCostV2({
      product: product(100, 4_000_000),
      dose,
      insurancePolicies: [],
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    })).toBeUndefined();
  });
});
