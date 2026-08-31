import { describe, expect, it } from "vitest";

import {
  buildType2MedicationConsiderations,
  buildType2PathwayRecommendation,
} from "../src/index.js";
import {
  calculateProductMonthlyCostV2,
  defaultDecisionGraphPolicyV2,
  runDecisionGraphV2,
  type DecisionGraphRequestV2,
  type DoseRuleV2,
  type IranMarketProductV2,
  type KnowledgeMedicationV2,
} from "../src/decision-graph-v2/index.js";

const CLINICAL_RANDOMIZED_CASES = 10_000;
const FINANCIAL_RANDOMIZED_CASES = 10_000;

const ada = defaultDecisionGraphPolicyV2.evidence.pharmacologic;

function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randint(next: () => number, min: number, max: number) {
  return Math.floor(next() * (max - min + 1)) + min;
}

function medication(overrides: Partial<KnowledgeMedicationV2> = {}): KnowledgeMedicationV2 {
  return {
    masterDrugId: "WD-TEST",
    genericName: "TestDrug",
    persianName: "داروی تست",
    combination: false,
    therapeuticAreas: ["Type 2 diabetes"],
    therapyGroup: "oral_glucose_lowering",
    primaryLanes: ["glycemic"],
    routeOptions: ["oral"],
    efficacyBand: "high",
    hypoglycemiaRisk: "low",
    weightDirection: "neutral",
    effects: [{ objective: "glycemic_control", direction: "benefit", evidence: [ada] }],
    evidence: [ada],
    engineState: "approved",
    ...overrides,
  };
}

function product(overrides: Partial<IranMarketProductV2> = {}): IranMarketProductV2 {
  return {
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
    observedAt: "2026-08-08",
    ...overrides,
  };
}

const fixedDoseRule: DoseRuleV2 = {
  id: "DOSE-TEST",
  masterDrugId: "WD-TEST",
  indication: "type2",
  formula: {
    kind: "fixed_daily_components",
    dailyComponents: [{ ingredientKey: "WD-TEST", amount: 1000, unit: "mg" }],
    administrationsPerDay: 2,
  },
  evidence: [ada],
  reviewState: "approved",
};

function graphRequest(overrides: Partial<DecisionGraphRequestV2> = {}): DecisionGraphRequestV2 {
  return {
    patient: {
      glycemia: { currentHba1c: 8, targetHba1c: 7, fastingPlasmaGlucoseMgDl: 150 },
      anthropometrics: { weightKg: 80, bmi: 29 },
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [medication()],
      marketProducts: [product()],
      doseRules: [fixedDoseRule],
      insurancePolicies: [],
    },
    ...overrides,
  };
}

describe("GLYMIZE deterministic randomized release gate", () => {
  it(
    "preserves clinical need, urgency, insurance integrity and uniqueness across 10,000 randomized clinical cases",
    () => {
      const next = prng(0x1310ac);

      const legacyMedications: any[] = [
        {
          id: "metformin",
          canonicalName: "Metformin",
          persianName: "متفورمین",
          className: "Biguanide",
          therapyGroup: "oral_glucose_lowering",
          administrationRoute: "oral",
        },
        {
          id: "empagliflozin",
          canonicalName: "Empagliflozin",
          persianName: "امپاگلیفلوزین",
          className: "SGLT2 inhibitor",
          therapyGroup: "oral_glucose_lowering",
          administrationRoute: "oral",
        },
        {
          id: "glargine",
          canonicalName: "Insulin glargine",
          persianName: "انسولین گلارژین",
          className: "Basal insulin",
          therapyGroup: "basal_insulin_analog",
          administrationRoute: "subcutaneous",
        },
      ];

      const factors = [
        "ascvd",
        "heart_failure",
        "ckd",
        "weight_priority",
        "hypoglycemia_risk",
      ];

      for (let i = 0; i < CLINICAL_RANDOMIZED_CASES; i += 1) {
        const urgent = i % 13 === 0;
        const currentHba1c = urgent
          ? 10.6 + next() * 1.9
          : 7.05 + next() * 2.3;

        const selectedFactors = factors.filter(() => next() > 0.72);

        // Legacy compatibility path:
        // clinical need is evaluated independently from medication filtering.
        const legacyRequest: any = {
          currentHba1c,
          targetHba1c: 7,
          workflow: "intensification",
          routePreference: "oral_or_injectable",
          costPreference: "insured_only",
          insuranceCoverageByMedicationId: {},
          factors: selectedFactors as any,
          hyperglycemiaSymptoms: urgent && i % 2 === 0,
          catabolicFeatures: urgent,
        };

        const legacyRecommendation = buildType2PathwayRecommendation(legacyRequest);
        const legacyConsiderations = buildType2MedicationConsiderations(
          legacyMedications,
          legacyRequest,
        );

        expect(
          legacyRecommendation.priority,
          `legacy clinical case ${i}: active need became maintenance`,
        ).not.toBe("maintain_and_monitor");

        if (urgent) {
          expect(
            legacyRecommendation.urgentReview,
            `legacy clinical case ${i}: urgent flag was lost`,
          ).toBe(true);
          expect(
            legacyRecommendation.priority,
            `legacy clinical case ${i}: urgent case did not preserve insulin pathway`,
          ).toBe("consider_insulin");
        }

        expect(
          legacyConsiderations.length,
          `legacy clinical case ${i}: uninsured medication passed insured_only`,
        ).toBe(0);

        const legacyIds = legacyConsiderations.map((item) => item.genericMedicationId);
        expect(
          new Set(legacyIds).size,
          `legacy clinical case ${i}: duplicate medication`,
        ).toBe(legacyIds.length);

        // Current Decision Graph v2: unknown insurance is not verified coverage.
        const base = graphRequest();
        const current: DecisionGraphRequestV2 = {
          ...base,
          patient: {
            ...base.patient,
            glycemia: {
              ...base.patient.glycemia,
              currentHba1c,
              targetHba1c: 7,
              fastingPlasmaGlucoseMgDl: urgent ? 320 : randint(next, 125, 210),
              randomGlucoseMgDl: urgent ? 330 : undefined,
              ketonesKnownPositive: urgent,
              catabolicFeatures: urgent,
            },
            anthropometrics: {
              ...base.patient.anthropometrics,
              weightKg: 80,
            },
          },
          preferences: {
            ...base.preferences,
            routePreference: "oral_or_injectable",
            costPreference: "insured_only",
            insuranceProviders: ["health_insurance"],
          },
          inventory: {
            ...base.inventory,
            insurancePolicies: [],
          },
        };

        const result = runDecisionGraphV2(current);

        expect(
          result.clinicalState.pathway,
          `Decision Graph case ${i}: active need became maintenance`,
        ).not.toBe("maintain_and_monitor");

        if (urgent) {
          expect(
            result.status,
            `Decision Graph case ${i}: urgent state was lost`,
          ).toBe("urgent_clinician_review");
          expect(
            result.insulinSubgraph.status,
            `Decision Graph case ${i}: urgent insulin subgraph was lost`,
          ).toBe("urgent_review");
        } else {
          expect(
            ["no_fully_eligible_regimen", "needs_data"].includes(result.status),
            `Decision Graph case ${i}: insured_only with unknown coverage was treated as complete`,
          ).toBe(true);
        }

        const recommendations = [
          result.primary,
          ...result.alternatives,
          ...result.comorbidityRecommendations,
        ].filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (!urgent) {
          for (const recommendation of recommendations) {
            expect(
              ["eligible", "conditional"].includes(recommendation.insuranceFit),
              `Decision Graph case ${i}: ${recommendation.insuranceFit} recommendation passed insured_only`,
            ).toBe(true);
          }
        }

        const regimenIds = recommendations.map((item) => item.regimenId);
        expect(
          new Set(regimenIds).size,
          `Decision Graph case ${i}: duplicate regimen`,
        ).toBe(regimenIds.length);

        const planMedicationIds = (result.treatmentPlan?.components ?? [])
          .map((item) => item.masterDrugId)
          .filter((item): item is string => Boolean(item));

        expect(
          new Set(planMedicationIds).size,
          `Decision Graph case ${i}: duplicate treatment-plan medication`,
        ).toBe(planMedicationIds.length);
      }

      console.info(
        `[GLYMIZE] randomized clinical validation cases passed: ${CLINICAL_RANDOMIZED_CASES}`,
      );
    },
    180_000,
  );

  it(
    "bounds package, retail, reference-price and insurance calculations across 10,000 randomized financial cases",
    () => {
      const next = prng(0x20260814);

      for (let i = 0; i < FINANCIAL_RANDOMIZED_CASES; i += 1) {
        const retail = randint(next, 1_000, 2_000_000);
        const unitsPerPack = randint(next, 1, 120);
        const unitsPerDay = randint(next, 1, 8);
        const coverage = randint(next, -25, 125);
        const reference = randint(next, 0, retail * 3);
        const maxCovered = randint(next, -3, 10);

        const mode = i % 4;
        const policy: any = {
          id: `I-${i}`,
          provider: "health_insurance",
          productId: `P-${i}`,
          coveragePercent: coverage,
          referencePriceTomanPerPurchaseUnit: reference,
          maxCoveredPurchaseUnitsPer30Days: maxCovered,
        };

        if (mode === 1) {
          policy.patientShareTomanPerPurchaseUnit = randint(next, -retail, retail * 2);
          delete policy.coveragePercent;
        } else if (mode === 2) {
          policy.insurerShareTomanPerPurchaseUnit = randint(next, -retail, retail * 2);
          delete policy.coveragePercent;
        } else if (mode === 3) {
          policy.patientShareTomanPerPurchaseUnit = randint(next, -retail, retail * 2);
          policy.insurerShareTomanPerPurchaseUnit = randint(next, -retail, retail * 2);
          delete policy.coveragePercent;
        }

        const marketProduct: IranMarketProductV2 = product({
          productId: `P-${i}`,
          priceToman: retail,
          consumptionUnitsPerPurchaseUnit: unitsPerPack,
          strengthComponents: [{ ingredientKey: "WD-TEST", amount: 1, unit: "mg" }],
        });

        const dose: any = {
          ruleId: `R-${i}`,
          masterDrugId: "WD-TEST",
          dosageFormGroup: "tablet",
          administrationsPerDay: 1,
          presentationUnitsPerDay: unitsPerDay,
          displayStartDose: `${unitsPerDay} tablet/day`,
          monitoring: [],
          evidence: [],
          clinicianConfirmationRequired: true,
        };

        const result = calculateProductMonthlyCostV2({
          product: marketProduct,
          dose,
          insurancePolicies: [policy],
          preferences: {
            routePreference: "oral_or_injectable",
            costPreference: "insured_only",
            insuranceProviders: ["health_insurance"],
          },
        });

        expect(result, `financial case ${i}: cost result unexpectedly missing`).toBeDefined();
        if (!result) continue;

        const expectedPurchases = Math.ceil((unitsPerDay * 30) / unitsPerPack - 1e-9);
        const expectedCash = expectedPurchases * retail;
        const expectedNormalized = Math.round(unitsPerDay * 30 * (retail / unitsPerPack));

        expect(
          result.purchaseUnitsNeeded30Days,
          `financial case ${i}: package count mismatch`,
        ).toBe(expectedPurchases);

        expect(
          result.cashPurchaseCostToman,
          `financial case ${i}: cash purchase mismatch`,
        ).toBe(expectedCash);

        expect(
          result.normalized30DayTreatmentCostToman,
          `financial case ${i}: normalized 30-day cost mismatch`,
        ).toBe(expectedNormalized);

        expect(
          result.leftoverConsumptionUnitsAfter30Days,
          `financial case ${i}: negative carryover`,
        ).toBeGreaterThanOrEqual(0);

        const insurance = result.insurance[0];
        expect(insurance, `financial case ${i}: insurer result missing`).toBeDefined();
        if (!insurance) continue;

        expect(
          insurance.coveredPurchaseUnits,
          `financial case ${i}: negative covered units`,
        ).toBeGreaterThanOrEqual(0);

        expect(
          insurance.uncoveredPurchaseUnits,
          `financial case ${i}: negative uncovered units`,
        ).toBeGreaterThanOrEqual(0);

        expect(
          insurance.coveredPurchaseUnits + insurance.uncoveredPurchaseUnits,
          `financial case ${i}: covered+uncovered package invariant failed`,
        ).toBe(expectedPurchases);

        expect(
          insurance.patientCostIfEligibleToman,
          `financial case ${i}: negative patient cost`,
        ).toBeGreaterThanOrEqual(0);

        expect(
          insurance.insurerCostIfEligibleToman,
          `financial case ${i}: negative insurer cost`,
        ).toBeGreaterThanOrEqual(0);

        expect(
          insurance.patientCostIfEligibleToman,
          `financial case ${i}: patient cost exceeds cash retail`,
        ).toBeLessThanOrEqual(expectedCash);

        expect(
          insurance.insurerCostIfEligibleToman,
          `financial case ${i}: insurer cost exceeds cash retail`,
        ).toBeLessThanOrEqual(expectedCash);

        expect(
          insurance.patientCostIfEligibleToman + insurance.insurerCostIfEligibleToman,
          `financial case ${i}: patient+insurer exceeds cash retail`,
        ).toBeLessThanOrEqual(expectedCash);

        if (insurance.displayCoveragePercent !== undefined) {
          expect(
            insurance.displayCoveragePercent,
            `financial case ${i}: coverage below 0`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            insurance.displayCoveragePercent,
            `financial case ${i}: coverage above 100`,
          ).toBeLessThanOrEqual(100);
        }
      }

      console.info(
        `[GLYMIZE] randomized insurance/financial validation cases passed: ${FINANCIAL_RANDOMIZED_CASES}`,
      );
    },
    120_000,
  );
});