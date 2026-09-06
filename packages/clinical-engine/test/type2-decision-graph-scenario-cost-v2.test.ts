import { describe, expect, it } from "vitest";
import type {
  Type2AssessmentResult,
  Type2MedicationConsideration,
} from "@glymize/contracts";
import {
  buildType2TreatmentScenarios,
  decisionGraphMedication30DayCostV1,
  type Type2ScenarioBuildInput,
} from "../src/scenario-engine-safe.js";
import {
  TYPE2_DECISION_GRAPH_EXECUTION_PROJECTION_V1,
  TYPE2_DECISION_GRAPH_V2_AUTHORITY,
  type Type2DecisionGraphExecutionProjectionV1,
} from "../src/type2-decision-graph-compat.js";

const executionBase: Type2DecisionGraphExecutionProjectionV1 = {
  authority: TYPE2_DECISION_GRAPH_EXECUTION_PROJECTION_V1,
  action: "start",
  sourceRegimenIds: ["REGIMEN-1"],
  sourceLanes: ["glycemic"],
  servesObjectives: ["glycemic_control"],
  dosePlan: {
    ruleId: "DOSE-APPROVED-1",
    masterDrugId: "WD-TEST",
    dailyComponents: [{ ingredientKey: "WD-TEST", amount: 1000, unit: "mg" }],
    administrationsPerDay: 2,
    administrationsPer30Days: 60,
    displayStartDose: "500 mg twice daily",
    monitoring: [],
    evidence: [{
      sourceId: "LABEL-1",
      title: "Reviewed label",
      url: "https://example.invalid/label",
      strength: "regulatory_label",
    }],
    clinicianConfirmationRequired: true,
  },
  selectedProduct: {
    productId: "P1",
    masterDrugId: "WD-TEST",
    nfiMatchState: "verified",
    genericName: "TestDrug",
    brandName: "Brand A",
    dosageFormGroup: "tablet",
    route: "oral",
    consumptionUnit: "tablet",
    strengthComponents: [{ ingredientKey: "WD-TEST", amount: 500, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 30,
    purchaseUnitLabel: "box",
    priceToman: 100_000,
    license: { everValid: true, currentValid: true },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-01",
  },
  selectedProductCost: {
    productId: "P1",
    brandName: "Brand A",
    dosageFormGroup: "tablet",
    doseFit: "exact",
    consumptionUnitsPerDay: 2,
    consumptionUnits30Days: 60,
    purchaseUnitsNeeded30Days: 2,
    consumedDrugValueToman: 190_000,
    cashPurchaseCostToman: 200_000,
    normalized30DayTreatmentCostToman: 190_000,
    leftoverConsumptionUnitsAfter30Days: 3,
    carryoverInventoryValueToman: 10_000,
    insurance: [{
      provider: "social_security",
      eligibility: "eligible",
      rawCoveragePercent: 70,
      displayCoveragePercent: 70,
      coveredPurchaseUnits: 2,
      uncoveredPurchaseUnits: 0,
      patientCostIfEligibleToman: 60_000,
      insurerCostIfEligibleToman: 140_000,
      conditions: [],
    }],
  },
  normalized30DayPatientCostToman: 60_000,
  regimenInsuranceFit: "eligible",
  regimenMonthlyPatientCostToman: 60_000,
  reasons: ["graph-composed action"],
  clinicianConfirmationRequired: true,
};

type GraphMedication = Type2MedicationConsideration & {
  decisionGraphAuthority: true;
  decisionGraphRank: 1 | 2 | 3;
  decisionGraphComponentOrder: number;
  decisionGraphRegimenId: string;
  decisionGraphExecution?: Type2DecisionGraphExecutionProjectionV1;
};

function medication(execution?: Type2DecisionGraphExecutionProjectionV1): GraphMedication {
  return {
    genericMedicationId: "GEN-1",
    genericName: "TestDrug",
    persianName: "داروی تست",
    therapeuticClass: "Test class",
    therapyGroup: "oral_glucose_lowering",
    sourceUrl: "https://example.invalid/guideline",
    sourceReference: TYPE2_DECISION_GRAPH_V2_AUTHORITY,
    considerations: ["graph recommendation"],
    cautions: [],
    priorityScore: 0,
    priorityTier: "recommended",
    relativeCost: "medium",
    rankingReasons: ["passed hard gates"],
    risks: [],
    insuranceCoverages: [{ provider: "social_security", percent: 5 }],
    therapyAction: "consider_initiation",
    currentMedication: false,
    price: {
      amountToman: 999_999,
      priceKind: "consumer_retail",
    },
    outputStatus: "information_only",
    decisionGraphAuthority: true,
    decisionGraphRank: 1,
    decisionGraphComponentOrder: 0,
    decisionGraphRegimenId: "REGIMEN-1",
    ...(execution ? { decisionGraphExecution: execution } : {}),
  };
}

function input(med: GraphMedication): Type2ScenarioBuildInput {
  const assessment: Type2AssessmentResult = {
    recommendation: {
      priority: "single_or_stepwise_therapy",
      title: "Decision Graph recommendation",
      rationale: ["graph rationale"],
      hba1cGap: 1,
      urgentReview: false,
      sourceUrl: "https://example.invalid/guideline",
      sourceReference: TYPE2_DECISION_GRAPH_V2_AUTHORITY,
    },
    medications: [med],
  };
  return {
    assessment,
    request: {
      currentHba1c: 8,
      targetHba1c: 7,
      factors: [],
    },
    insuranceProvider: "social_security",
    costingPlansByMedicationId: {
      "GEN-1": {
        dailyUnits: 99,
        unitsPerPackage: 1,
        marketPackageVerified: true,
      },
    },
  };
}

describe("Decision Graph cost authority in Type 2 scenarios", () => {
  it("uses graph-resolved dose/package/insurance cost instead of recomputing from legacy manual inputs", () => {
    const scenarioInput = input(medication(executionBase));
    const scenarios = buildType2TreatmentScenarios(scenarioInput);
    const estimate = scenarios[0]?.cost30Days[0];

    expect(estimate).toBeDefined();
    expect(estimate!.status).toBe("calculated");
    expect(estimate!.retailPerPackageToman).toBe(100_000);
    expect(estimate!.packagesFor30Days).toBe(2);
    expect(estimate!.retail30DaysToman).toBe(200_000);
    expect(estimate!.patient30DaysToman).toBe(60_000);
    expect(estimate!.insurer30DaysToman).toBe(140_000);
    expect(estimate!.coveragePercent).toBe(70);
    expect(estimate!.calculationBasis).toContain("Decision Graph v2");
    expect(estimate!.calculationBasis).toContain("190000");
    expect(estimate!.calculationBasis).toContain("10000");
    expect(estimate!.retail30DaysToman).not.toBe(99 * 30 * 999_999);
  });

  it("does not present conditional insurance if-eligible amounts as definitive patient/insurer shares", () => {
    const conditional: Type2DecisionGraphExecutionProjectionV1 = {
      ...executionBase,
      selectedProductCost: {
        ...executionBase.selectedProductCost!,
        insurance: [{
          provider: "social_security",
          eligibility: "conditional",
          rawCoveragePercent: 70,
          displayCoveragePercent: 70,
          coveredPurchaseUnits: 2,
          uncoveredPurchaseUnits: 0,
          patientCostIfEligibleToman: 60_000,
          insurerCostIfEligibleToman: 140_000,
          conditions: ["نیازمند تأیید قبلی بیمه"],
        }],
      },
    };
    const estimate = decisionGraphMedication30DayCostV1(medication(conditional), input(medication(conditional)));

    expect(estimate).toBeDefined();
    expect(estimate!.status).toBe("retail_only");
    expect(estimate!.retail30DaysToman).toBe(200_000);
    expect(estimate!.patient30DaysToman).toBeUndefined();
    expect(estimate!.insurer30DaysToman).toBeUndefined();
    expect(estimate!.calculationBasis).toContain("conditional");
    expect(estimate!.calculationBasis).toContain("نیازمند تأیید قبلی بیمه");
  });

  it("falls back to the existing cost calculator only when Decision Graph has no resolved product cost", () => {
    const noGraphCost = medication();
    const scenarios = buildType2TreatmentScenarios(input(noGraphCost));
    const estimate = scenarios[0]?.cost30Days[0];

    expect(estimate).toBeDefined();
    expect(estimate!.calculationBasis).not.toContain("Decision Graph v2");
    expect(estimate!.packagesFor30Days).toBe(2970);
  });
});
