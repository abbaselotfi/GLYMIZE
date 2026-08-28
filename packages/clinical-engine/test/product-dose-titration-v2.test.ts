import { describe, expect, it } from "vitest";
import {
  approvedDoseRulesForV2,
  buildFactMapV2,
  buildReviewedProductDoseRulesV2,
  buildReviewedTitrationProtocolsV2,
  calculateProductMonthlyCostV2,
  chooseGenericCostBenchmarkV2,
  resolveDosePlanV2,
  resolveTitrationRecommendationV2,
} from "../src/index.js";
import type {
  ClinicalStateV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
  ProductMonthlyCostV2,
} from "../src/index.js";

const evidence = [{ sourceId: "test", title: "test", url: "https://example.test" }];
const state: ClinicalStateV2 = { pathway: "modest_intensification", insulinAction: "none", severeHyperglycemia: false, hba1cGap: 1, reasons: [], evidence: [] };

function medication(id: string, name: string, therapyGroup: string, route = "oral"): KnowledgeMedicationV2 {
  return { masterDrugId: id, genericName: name, combination: false, therapeuticAreas: ["Diabetes"], therapyGroup, primaryLanes: ["glycemic"], routeOptions: [route], efficacyBand: "high", hypoglycemiaRisk: "low", weightDirection: "neutral", effects: [], evidence, engineState: "approved" };
}

function product(overrides: Partial<IranMarketProductV2>): IranMarketProductV2 {
  return {
    productId: "P", masterDrugId: "M", nfiMatchState: "verified", genericName: "Drug", dosageFormGroup: "tablet", route: "oral", consumptionUnit: "tablet",
    strengthComponents: [{ ingredientKey: "M", amount: 1, unit: "mg" }], consumptionUnitsPerPurchaseUnit: 30, purchaseUnitLabel: "30 tablets", priceToman: 100000,
    license: { everValid: true, currentValid: true }, marketPresence: "recently_observed", observedAt: "2026-08-08T00:00:00.000Z", ...overrides,
  };
}

describe("V2.6 product-specific dose knowledge", () => {
  it("selects sitagliptin renal doses without a score", () => {
    const sita = medication("SITA", "Sitagliptin", "dpp4_inhibitor");
    const rules = buildReviewedProductDoseRulesV2({ knowledge: [sita] });
    const resolveAt = (egfr: number) => {
      const patient = { glycemia: { currentHba1c: 8, targetHba1c: 7 }, kidney: { eGfr: egfr } };
      const facts = buildFactMapV2(patient, false);
      const eligible = approvedDoseRulesForV2("SITA", rules, facts, "initiation", "glycemic");
      expect(eligible).toHaveLength(1);
      return resolveDosePlanV2(eligible[0]!, patient, state)!;
    };
    expect(resolveAt(80).dailyComponents?.[0]?.amount).toBe(100);
    expect(resolveAt(35).dailyComponents?.[0]?.amount).toBe(50);
    expect(resolveAt(20).dailyComponents?.[0]?.amount).toBe(25);
  });

  it("keeps dapagliflozin dose indication/lane aware", () => {
    const dapa = medication("DAPA", "Dapagliflozin", "sglt2_inhibitor");
    dapa.primaryLanes = ["glycemic", "kidney", "heart_failure"];
    const rules = buildReviewedProductDoseRulesV2({ knowledge: [dapa] });
    const patient = { glycemia: { currentHba1c: 8, targetHba1c: 7 } };
    const facts = buildFactMapV2(patient, false);
    const gly = approvedDoseRulesForV2("DAPA", rules, facts, "initiation", "glycemic");
    const kidney = approvedDoseRulesForV2("DAPA", rules, facts, "initiation", "kidney");
    expect(resolveDosePlanV2(gly[0]!, patient, state)?.dailyComponents?.[0]?.amount).toBe(5);
    expect(resolveDosePlanV2(kidney[0]!, patient, state)?.dailyComponents?.[0]?.amount).toBe(10);
  });

  it("represents once-weekly semaglutide as an interval dose rather than fake daily injections", () => {
    const sema = medication("SEMA", "Semaglutide, subcutaneous", "glp_1_receptor_agonist", "subcutaneous");
    const rules = buildReviewedProductDoseRulesV2({ knowledge: [sema] });
    const patient = { glycemia: { currentHba1c: 8, targetHba1c: 7 } };
    const plan = resolveDosePlanV2(rules[0]!, patient, state)!;
    expect(plan.perAdministrationComponents?.[0]?.amount).toBe(0.25);
    expect(plan.scheduleText).toBe("once weekly");
    expect(plan.administrationsPer30Days).toBeCloseTo(30 / 7, 6);
  });
});

describe("V2.6 structured titration", () => {
  it("blocks semaglutide escalation before four weeks and advances only when control still needs improvement", () => {
    const sema = medication("SEMA", "Semaglutide, subcutaneous", "glp_1_receptor_agonist", "subcutaneous");
    const protocols = buildReviewedTitrationProtocolsV2({ knowledge: [sema] });
    const early = resolveTitrationRecommendationV2({ masterDrugId: "SEMA", currentDose: [{ ingredientKey: "SEMA", amount: 0.25, unit: "mg" }], daysOnCurrentDose: 14, tolerability: "good", additionalGlycemicControlNeeded: true }, protocols);
    expect(early.action).toBe("hold");
    const ready = resolveTitrationRecommendationV2({ masterDrugId: "SEMA", currentDose: [{ ingredientKey: "SEMA", amount: 0.25, unit: "mg" }], daysOnCurrentDose: 28, tolerability: "good", additionalGlycemicControlNeeded: true }, protocols);
    expect(ready.action).toBe("increase");
    expect(ready.nextDose?.[0]?.amount).toBe(0.5);
  });

  it("blocks sulfonylurea up-titration when hypoglycemia is present", () => {
    const glim = medication("GLIM", "Glimepiride", "sulfonylurea");
    const protocols = buildReviewedTitrationProtocolsV2({ knowledge: [glim] });
    const result = resolveTitrationRecommendationV2({ masterDrugId: "GLIM", currentDose: [{ ingredientKey: "GLIM", amount: 1, unit: "mg" }], daysOnCurrentDose: 14, tolerability: "good", additionalGlycemicControlNeeded: true, glucoseBelow70MgDl: true }, protocols);
    expect(result.action).toBe("stop_and_review");
  });
});

describe("V2.6 30-day normalized treatment economics", () => {
  it("separates zero-inventory cash outlay from steady-state 30-day treatment cost", () => {
    const med = medication("M", "Test", "other");
    const dose = {
      ruleId: "R", masterDrugId: "M", dosageFormGroup: "tablet", dailyComponents: [{ ingredientKey: "M", amount: 1, unit: "mg" }], perAdministrationComponents: [{ ingredientKey: "M", amount: 1, unit: "mg" }], administrationsPerDay: 1,
      displayStartDose: "1 mg/day", monitoring: [], evidence, clinicianConfirmationRequired: true as const,
    };
    const p = product({ productId: "P28", masterDrugId: "M", consumptionUnitsPerPurchaseUnit: 28, purchaseUnitLabel: "28 tablets", priceToman: 280000 });
    const cost = calculateProductMonthlyCostV2({ product: p, dose, insurancePolicies: [], preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" } })!;
    expect(cost.purchaseUnitsNeeded30Days).toBe(2);
    expect(cost.cashPurchaseCostToman).toBe(560000);
    expect(cost.normalized30DayTreatmentCostToman).toBe(300000);
    expect(cost.carryoverInventoryValueToman).toBe(260000);
    void med;
  });

  it("uses normalized 30-day costs for the new benchmark while preserving cash-outlay fields", () => {
    const products = [
      product({ productId: "A", masterDrugId: "M", brandName: "A" }),
      product({ productId: "B", masterDrugId: "M", brandName: "B" }),
      product({ productId: "C", masterDrugId: "M", brandName: "C" }),
    ];
    const costs: ProductMonthlyCostV2[] = [
      { productId: "A", brandName: "A", dosageFormGroup: "tablet", doseFit: "exact", consumptionUnitsPerDay: 1, consumptionUnits30Days: 30, purchaseUnitsNeeded30Days: 2, consumedDrugValueToman: 120000, cashPurchaseCostToman: 200000, normalized30DayTreatmentCostToman: 120000, leftoverConsumptionUnitsAfter30Days: 20, carryoverInventoryValueToman: 80000, insurance: [] },
      { productId: "B", brandName: "B", dosageFormGroup: "tablet", doseFit: "exact", consumptionUnitsPerDay: 1, consumptionUnits30Days: 30, purchaseUnitsNeeded30Days: 1, consumedDrugValueToman: 150000, cashPurchaseCostToman: 150000, normalized30DayTreatmentCostToman: 150000, leftoverConsumptionUnitsAfter30Days: 0, carryoverInventoryValueToman: 0, insurance: [] },
      { productId: "C", brandName: "C", dosageFormGroup: "tablet", doseFit: "exact", consumptionUnitsPerDay: 1, consumptionUnits30Days: 30, purchaseUnitsNeeded30Days: 1, consumedDrugValueToman: 300000, cashPurchaseCostToman: 300000, normalized30DayTreatmentCostToman: 300000, leftoverConsumptionUnitsAfter30Days: 0, carryoverInventoryValueToman: 0, insurance: [] },
    ];
    const benchmark = chooseGenericCostBenchmarkV2({ masterDrugId: "M", productCosts: costs, products, preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" } })!;
    expect(benchmark.medianNormalized30DayCostToman).toBe(150000);
    expect(benchmark.referenceNormalized30DayCostToman).toBe(150000);
    expect(benchmark.referenceProductId).toBe("B");
  });
});
