import { describe, expect, it } from "vitest";
import {
  buildAutoFrcProtocolBindingsV2,
  buildReviewedFrcDoseRulesV2,
  buildReviewedInsulinConversionRulesV2,
  calculateInsulinConversionV2,
  calculateProductMonthlyCostV2,
  chooseGenericCostBenchmarkV2,
  resolveDosePlanV2,
  resolveExactCurrentRegimenFdcPlansV2,
} from "../src/index.js";
import type {
  ClinicalStateV2,
  DecisionGraphInventoryV2,
  DecisionGraphRequestV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
  ResolvedDosePlanV2,
} from "../src/index.js";

const evidence = [{ sourceId: "test", title: "test", url: "https://example.test" }];

function medication(overrides: Partial<KnowledgeMedicationV2>): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-X",
    genericName: "Test",
    combination: false,
    therapeuticAreas: ["Diabetes"],
    therapyGroup: "other",
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightDirection: "neutral",
    effects: [],
    tags: [],
    evidence,
    engineState: "approved",
    ...overrides,
  };
}

function currentProduct(overrides: Partial<IranMarketProductV2>): IranMarketProductV2 {
  return {
    productId: "P-X",
    masterDrugId: "WD-X",
    nfiMatchState: "verified",
    genericName: "Test",
    dosageFormGroup: "tablet",
    route: "oral",
    consumptionUnit: "tablet",
    strengthComponents: [{ ingredientKey: "WD-X", amount: 500, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 30,
    purchaseUnitLabel: "30 tablets",
    priceToman: 100000,
    license: { everValid: true, currentValid: true },
    marketPresence: "recently_observed",
    observedAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
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

describe("dose-first, formulation-aware 30-day cost", () => {
  const dose: ResolvedDosePlanV2 = {
    ruleId: "MET-500-BID",
    masterDrugId: "WD-MET",
    dosageFormGroup: "tablet",
    dailyComponents: [{ ingredientKey: "WD-MET", amount: 1000, unit: "mg" }],
    perAdministrationComponents: [{ ingredientKey: "WD-MET", amount: 500, unit: "mg" }],
    administrationsPerDay: 2,
    displayStartDose: "500 mg BID",
    monitoring: [],
    evidence,
    clinicianConfirmationRequired: true,
  };

  it("uses the exact per-administration strength and rejects fractional tablet assumptions", () => {
    const p500 = currentProduct({ productId: "P500", masterDrugId: "WD-MET", strengthComponents: [{ ingredientKey: "WD-MET", amount: 500, unit: "mg" }] });
    const p1000 = currentProduct({ productId: "P1000", masterDrugId: "WD-MET", strengthComponents: [{ ingredientKey: "WD-MET", amount: 1000, unit: "mg" }] });
    const a = calculateProductMonthlyCostV2({ product: p500, dose, insurancePolicies: [], preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" } });
    const b = calculateProductMonthlyCostV2({ product: p1000, dose, insurancePolicies: [], preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" } });
    expect(a?.consumptionUnits30Days).toBe(60);
    expect(a?.purchaseUnitsNeeded30Days).toBe(2);
    expect(a?.cashPurchaseCostToman).toBe(200000);
    expect(b).toBeUndefined();
  });

  it("separates 30-day consumed value from whole-package cash outlay and carryover inventory", () => {
    const insulinDose: ResolvedDosePlanV2 = {
      ruleId: "DEG-10",
      masterDrugId: "WD-DEG",
      dosageFormGroup: "injection_pen",
      dailyComponents: [{ ingredientKey: "WD-DEG", amount: 10, unit: "U" }],
      perAdministrationComponents: [{ ingredientKey: "WD-DEG", amount: 10, unit: "U" }],
      administrationsPerDay: 1,
      displayStartDose: "10 U/day",
      monitoring: [], evidence, clinicianConfirmationRequired: true,
    };
    const box = currentProduct({
      productId: "DEG-BOX", masterDrugId: "WD-DEG", dosageFormGroup: "injection_pen", route: "subcutaneous",
      consumptionUnit: "mL", strengthComponents: [{ ingredientKey: "WD-DEG", amount: 100, unit: "U" }],
      consumptionUnitsPerPurchaseUnit: 15, consumptionUnitsPerContainer: 3, containersPerPurchaseUnit: 5,
      purchaseUnitLabel: "5 x 3 mL pens", priceToman: 1500000,
    });
    const cost = calculateProductMonthlyCostV2({ product: box, dose: insulinDose, insurancePolicies: [], preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" } })!;
    expect(cost.consumptionUnits30Days).toBe(3);
    expect(cost.containersNeeded30Days).toBe(1);
    expect(cost.purchaseUnitsNeeded30Days).toBe(1);
    expect(cost.consumedDrugValueToman).toBe(300000);
    expect(cost.cashPurchaseCostToman).toBe(1500000);
    expect(cost.leftoverConsumptionUnitsAfter30Days).toBe(12);
    expect(cost.carryoverInventoryValueToman).toBe(1200000);
  });
});

describe("label-first insulin conversion registry", () => {
  const knowledge = [
    medication({ masterDrugId: "G100", genericName: "Insulin glargine U-100", therapyGroup: "basal_insulin_analog", routeOptions: ["subcutaneous"] }),
    medication({ masterDrugId: "G300", genericName: "Insulin glargine U-300", therapyGroup: "basal_insulin_analog", routeOptions: ["subcutaneous"] }),
    medication({ masterDrugId: "NPH", genericName: "Human insulin, NPH", therapyGroup: "human_insulin", routeOptions: ["subcutaneous"] }),
    medication({ masterDrugId: "DEG", genericName: "Insulin degludec U-100/U-200", therapyGroup: "basal_insulin_analog", routeOptions: ["subcutaneous"] }),
    medication({ masterDrugId: "ASP", genericName: "Insulin aspart", therapyGroup: "prandial_insulin_analog", routeOptions: ["subcutaneous"] }),
  ];
  const rules = buildReviewedInsulinConversionRulesV2(knowledge);

  it("uses the LANTUS label 80% conversion from U-300 glargine", () => {
    const result = calculateInsulinConversionV2({ sourceMasterDrugId: "G300", targetMasterDrugId: "G100", sourceTotalDailyUnits: 40, sourceFrequencyPerDay: 1 }, rules);
    expect(result.status).toBe("executable");
    expect(result.targetStartingTotalDailyUnits).toBe(32);
    expect(result.factor).toBe(0.8);
  });

  it("uses 80% of twice-daily NPH TDD when switching to once-daily glargine U-100", () => {
    const result = calculateInsulinConversionV2({ sourceMasterDrugId: "NPH", targetMasterDrugId: "G100", sourceTotalDailyUnits: 50, sourceFrequencyPerDay: 2 }, rules);
    expect(result.status).toBe("executable");
    expect(result.targetStartingTotalDailyUnits).toBe(40);
  });

  it("does not invent basal-to-prandial conversion edges", () => {
    const result = calculateInsulinConversionV2({ sourceMasterDrugId: "G100", targetMasterDrugId: "ASP", sourceTotalDailyUnits: 30, sourceFrequencyPerDay: 1 }, rules);
    expect(result.status).toBe("unsupported");
  });
});

describe("FRC protocol binding and exact-dose FDC simplification", () => {
  const glargine = medication({ masterDrugId: "G100", genericName: "Insulin glargine U-100", therapyGroup: "basal_insulin_analog", routeOptions: ["subcutaneous"] });
  const lixisenatide = medication({ masterDrugId: "LIX", genericName: "Lixisenatide", therapyGroup: "glp_1_receptor_agonist", routeOptions: ["subcutaneous"] });
  const frc = medication({ masterDrugId: "FRC", genericName: "Insulin glargine/lixisenatide", combination: true, componentMasterDrugIds: ["G100", "LIX"], therapyGroup: "fixed_ratio_combination", routeOptions: ["subcutaneous"] });
  const soliqua = currentProduct({
    productId: "SOL", masterDrugId: "FRC", genericName: "Insulin glargine/lixisenatide", brandName: "Soliqua",
    dosageFormGroup: "injection_pen", route: "subcutaneous", consumptionUnit: "mL", consumptionUnitsPerPurchaseUnit: 3,
    strengthComponents: [{ ingredientKey: "G100", amount: 100, unit: "U" }, { ingredientKey: "LIX", amount: 33, unit: "mcg" }],
  });

  it("binds exact SOLIQUA composition to the U.S. label and resolves 15 vs 30 starting units", () => {
    const binding = buildAutoFrcProtocolBindingsV2({ knowledge: [glargine, lixisenatide, frc], marketProducts: [soliqua] });
    expect(binding.bindings[0]?.protocol).toBe("soliqua_us_100_33");
    const rules = buildReviewedFrcDoseRulesV2({ knowledge: [glargine, lixisenatide, frc], frcProtocolBindings: binding.bindings });
    expect(rules).toHaveLength(1);
    const low = resolveDosePlanV2(rules[0]!, { glycemia: { currentHba1c: 9, targetHba1c: 7 }, currentMedications: [{ masterDrugId: "G100", genericName: "Insulin glargine U-100", therapyGroup: "basal_insulin_analog", basalInsulinUnitsPerDay: 20, administrationsPerDay: 1 }] }, state)!;
    expect(low.dailyComponents).toEqual([{ ingredientKey: "G100", amount: 15, unit: "U" }, { ingredientKey: "LIX", amount: 5, unit: "mcg" }]);
    const high = resolveDosePlanV2(rules[0]!, { glycemia: { currentHba1c: 9, targetHba1c: 7 }, currentMedications: [{ masterDrugId: "G100", genericName: "Insulin glargine U-100", therapyGroup: "basal_insulin_analog", basalInsulinUnitsPerDay: 40, administrationsPerDay: 1 }] }, state)!;
    expect(high.dailyComponents).toEqual([{ ingredientKey: "G100", amount: 30, unit: "U" }, { ingredientKey: "LIX", amount: 10, unit: "mcg" }]);
  });

  it("creates an FDC simplification only when the current component doses exactly fit a current market presentation", () => {
    const met = medication({ masterDrugId: "MET", genericName: "Metformin", therapyGroup: "biguanide" });
    const empa = medication({ masterDrugId: "EMPA", genericName: "Empagliflozin", therapyGroup: "sglt2_inhibitor" });
    const combo = medication({ masterDrugId: "FDC", genericName: "Metformin/empagliflozin", combination: true, componentMasterDrugIds: ["MET", "EMPA"], therapyGroup: "fixed_dose_combination" });
    const fdcProduct = currentProduct({ productId: "FDC-P", masterDrugId: "FDC", dosageFormGroup: "tablet", strengthComponents: [{ ingredientKey: "MET", amount: 500, unit: "mg" }, { ingredientKey: "EMPA", amount: 5, unit: "mg" }] });
    const inventory: DecisionGraphInventoryV2 = { knowledge: [met, empa, combo], marketProducts: [fdcProduct], doseRules: [], insurancePolicies: [] };
    const request: DecisionGraphRequestV2 = {
      patient: { glycemia: { currentHba1c: 8, targetHba1c: 7 }, currentMedications: [
        { masterDrugId: "MET", genericName: "Metformin", dailyDose: [{ ingredientKey: "MET", amount: 1000, unit: "mg" }], administrationsPerDay: 2 },
        { masterDrugId: "EMPA", genericName: "Empagliflozin", dailyDose: [{ ingredientKey: "EMPA", amount: 10, unit: "mg" }], administrationsPerDay: 2 },
      ] },
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint", adherencePriority: "simplify_regimen" },
      inventory,
    };
    const plans = resolveExactCurrentRegimenFdcPlansV2(request, combo);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.presentationUnitsPerDay).toBe(2);
    expect(plans[0]?.productId).toBe("FDC-P");
  });
});


describe("generic market benchmark and insurance caps", () => {
  it("uses median 30-day treatment cost rather than the cheapest current brand", () => {
    const products = [
      currentProduct({ productId: "A", masterDrugId: "WD-MED", brandName: "A", priceToman: 100000 }),
      currentProduct({ productId: "B", masterDrugId: "WD-MED", brandName: "B", priceToman: 200000 }),
      currentProduct({ productId: "C", masterDrugId: "WD-MED", brandName: "C", priceToman: 1000000 }),
    ];
    const productCosts = products.map((product) => ({
      productId: product.productId,
      brandName: product.brandName,
      dosageFormGroup: "tablet",
      doseFit: "exact" as const,
      consumptionUnitsPerDay: 1,
      consumptionUnits30Days: 30,
      purchaseUnitsNeeded30Days: 1,
      consumedDrugValueToman: product.priceToman!,
      cashPurchaseCostToman: product.priceToman!,
      normalized30DayTreatmentCostToman: product.priceToman!,
      leftoverConsumptionUnitsAfter30Days: 0,
      carryoverInventoryValueToman: 0,
      insurance: [],
    }));
    const benchmark = chooseGenericCostBenchmarkV2({
      masterDrugId: "WD-MED",
      productCosts,
      products,
      preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    })!;
    expect(benchmark.basis).toBe("median_current_market");
    expect(benchmark.referenceMonthlyCashCostToman).toBe(200000);
    expect(benchmark.lowestMonthlyCashCostToman).toBe(100000);
    expect(benchmark.highestMonthlyCashCostToman).toBe(1000000);
  });

  it("applies insurance only up to the allowed 30-day package cap", () => {
    const dose: ResolvedDosePlanV2 = {
      ruleId: "CAP", masterDrugId: "WD-CAP", dosageFormGroup: "tablet",
      dailyComponents: [{ ingredientKey: "WD-CAP", amount: 1000, unit: "mg" }],
      perAdministrationComponents: [{ ingredientKey: "WD-CAP", amount: 500, unit: "mg" }],
      administrationsPerDay: 2, displayStartDose: "500 mg BID", monitoring: [], evidence, clinicianConfirmationRequired: true,
    };
    const product = currentProduct({ productId: "CAP-P", masterDrugId: "WD-CAP", priceToman: 100000, strengthComponents: [{ ingredientKey: "WD-CAP", amount: 500, unit: "mg" }] });
    const result = calculateProductMonthlyCostV2({
      product, dose,
      insurancePolicies: [{ id: "I", provider: "health_insurance", productId: "CAP-P", coveragePercent: 50, maxCoveredPurchaseUnitsPer30Days: 1 }],
      preferences: { routePreference: "oral_or_injectable", costPreference: "insured_only", insuranceProviders: ["health_insurance"] },
    })!;
    expect(result.purchaseUnitsNeeded30Days).toBe(2);
    expect(result.insurance[0]?.displayCoveragePercent).toBe(50);
    expect(result.insurance[0]?.coveredPurchaseUnits).toBe(1);
    expect(result.insurance[0]?.uncoveredPurchaseUnits).toBe(1);
    expect(result.insurance[0]?.patientCostIfEligibleToman).toBe(150000);
  });
});
