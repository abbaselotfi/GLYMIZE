import { describe, it } from "vitest";

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

const CLINICAL_CASES = 100_000;
const FINANCIAL_CASES = 100_000;
const METAMORPHIC_CASES = 50_000;
const ADVERSARIAL_CASES = 25_000;

const ada = defaultDecisionGraphPolicyV2.evidence.pharmacologic;

type FailureExample = {
  code: string;
  index: number;
  seed: string;
  detail: string;
};

class FailureCollector {
  private counts = new Map<string, number>();
  private examples: FailureExample[] = [];
  private total = 0;

  add(code: string, index: number, seed: number, detail: unknown) {
    this.total += 1;
    this.counts.set(code, (this.counts.get(code) ?? 0) + 1);
    if (this.examples.length < 40) {
      let rendered = "";
      try {
        rendered = JSON.stringify(detail);
      } catch {
        rendered = String(detail);
      }
      this.examples.push({
        code,
        index,
        seed: `0x${seed.toString(16)}`,
        detail: rendered.slice(0, 1200),
      });
    }
  }

  assertClean(label: string) {
    if (this.total === 0) {
      console.info(`[GLYMIZE] ${label}: PASS`);
      return;
    }

    const counts = [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => `${code}: ${count}`)
      .join("\n");

    const examples = this.examples
      .map((item) => `[${item.code}] case=${item.index} seed=${item.seed}\n${item.detail}`)
      .join("\n\n");

    throw new Error(
      `\nGLYMIZE ${label} FAILED\n` +
      `Total invariant failures: ${this.total}\n\n` +
      `Failure families:\n${counts}\n\n` +
      `First ${this.examples.length} examples:\n${examples}\n`,
    );
  }
}

function prng(seed: number) {
  let state = seed >>> 0;
  return {
    next: () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    state: () => state >>> 0,
  };
}

function randint(next: () => number, min: number, max: number) {
  return Math.floor(next() * (max - min + 1)) + min;
}

function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(next() * items.length))]!;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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

function insulinMedication(): KnowledgeMedicationV2 {
  return medication({
    masterDrugId: "INS-BASAL",
    genericName: "Basal insulin",
    persianName: "انسولین بازال",
    therapyGroup: "basal_insulin",
    routeOptions: ["subcutaneous"],
    efficacyBand: "very_high",
    effects: [
      { objective: "glycemic_control", direction: "strong_benefit", evidence: [ada] },
      { objective: "insulin_replacement", direction: "strong_benefit", evidence: [ada] },
    ],
  });
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

function insulinProduct(overrides: Partial<IranMarketProductV2> = {}): IranMarketProductV2 {
  return product({
    productId: "IP1",
    masterDrugId: "INS-BASAL",
    genericName: "Basal insulin",
    route: "subcutaneous",
    dosageFormGroup: "pen",
    consumptionUnit: "U",
    strengthComponents: [{ ingredientKey: "INS-BASAL", amount: 1, unit: "U" }],
    consumptionUnitsPerPurchaseUnit: 1500,
    purchaseUnitLabel: "pen pack",
    priceToman: 550_000,
    ...overrides,
  });
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

const insulinDoseRule: DoseRuleV2 = {
  id: "BASAL-START",
  masterDrugId: "INS-BASAL",
  indication: "type2-severe",
  formula: {
    kind: "weight_based_daily",
    ingredientKey: "INS-BASAL",
    unit: "U",
    minPerKg: 0.1,
    maxPerKg: 0.2,
    administrationsPerDay: 1,
    selection: "by_glycemic_severity",
  },
  evidence: [ada],
  reviewState: "approved",
};

function graphRequest(overrides: Partial<DecisionGraphRequestV2> = {}): DecisionGraphRequestV2 {
  return {
    patient: {
      glycemia: {
        currentHba1c: 8,
        targetHba1c: 7,
        fastingPlasmaGlucoseMgDl: 150,
      },
      anthropometrics: { weightKg: 80, bmi: 29 },
    },
    preferences: {
      routePreference: "oral_or_injectable",
      costPreference: "no_constraint",
    },
    inventory: {
      knowledge: [medication(), insulinMedication()],
      marketProducts: [product(), insulinProduct()],
      doseRules: [fixedDoseRule, insulinDoseRule],
      insurancePolicies: [],
    },
    ...overrides,
  };
}

describe("GLYMIZE synthetic real-world stress campaign v4", () => {
  it(
    "runs 100,000 heterogeneous clinical scenarios and aggregates every invariant failure",
    () => {
      const SEED = 0x6c796d34;
      const rng = prng(SEED);
      const next = rng.next;
      const failures = new FailureCollector();

      const legacyMeds: any[] = [
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

      const factorPool = [
        "ascvd",
        "heart_failure",
        "ckd",
        "weight_priority",
        "hypoglycemia_risk",
      ];

      for (let i = 0; i < CLINICAL_CASES; i += 1) {
        const caseSeed = rng.state();

        try {
          const target = 6.5 + randint(next, 0, 15) / 10;
          const urgent = next() < 0.07;
          const gap = urgent
            ? 3.5 + next() * 3.0
            : 0.2 + next() * 3.2;
          const currentHba1c = target + gap;
          const routePreference = pick(next, [
            "oral_only",
            "prefer_oral",
            "oral_or_injectable",
          ] as const);
          const costPreference = next() < 0.45 ? "insured_only" : "no_constraint";
          const hasVerifiedOralInsurance = costPreference === "insured_only" && next() < 0.50;
          const oralCoverage = randint(next, 10, 100);
          const weightKnown = !(urgent && next() < 0.18);

          const selectedFactors = factorPool.filter(() => next() < 0.28);

          const legacyRequest: any = {
            currentHba1c,
            targetHba1c: target,
            workflow: "intensification",
            routePreference,
            costPreference,
            insuranceCoverageByMedicationId: hasVerifiedOralInsurance
              ? {
                  metformin: [{ provider: "health_insurance", percent: oralCoverage }],
                  empagliflozin: [{ provider: "health_insurance", percent: oralCoverage }],
                }
              : {},
            factors: selectedFactors,
            hyperglycemiaSymptoms: urgent && next() < 0.6,
            catabolicFeatures: urgent,
          };

          const legacyRecommendation = buildType2PathwayRecommendation(legacyRequest);
          const legacyConsiderations = buildType2MedicationConsiderations(
            legacyMeds,
            legacyRequest,
          );

          if (legacyRecommendation.priority === "maintain_and_monitor") {
            failures.add("LEGACY_ACTIVE_NEED_BECAME_MAINTENANCE", i, caseSeed, {
              target,
              currentHba1c,
              urgent,
              routePreference,
              costPreference,
            });
          }

          if (urgent && !legacyRecommendation.urgentReview) {
            failures.add("LEGACY_URGENT_FLAG_LOST", i, caseSeed, {
              currentHba1c,
              target,
            });
          }

          if (urgent && legacyRecommendation.priority !== "consider_insulin") {
            failures.add("LEGACY_URGENT_DID_NOT_PRIORITIZE_INSULIN", i, caseSeed, {
              priority: legacyRecommendation.priority,
              currentHba1c,
              target,
            });
          }

          if (costPreference === "insured_only" && !hasVerifiedOralInsurance) {
            if (legacyConsiderations.length !== 0) {
              failures.add("LEGACY_UNINSURED_PASSED_INSURED_ONLY", i, caseSeed, {
                ids: legacyConsiderations.map((item) => item.genericMedicationId),
              });
            }
          }

          const legacyIds = legacyConsiderations.map((item) => item.genericMedicationId);
          if (new Set(legacyIds).size !== legacyIds.length) {
            failures.add("LEGACY_DUPLICATE_MEDICATION", i, caseSeed, { legacyIds });
          }

          const oralProduct = product({
            priceToman: randint(next, 10_000, 2_000_000),
          });
          const basalProduct = insulinProduct({
            priceToman: randint(next, 100_000, 3_000_000),
          });

          const policies: any[] = [];
          if (hasVerifiedOralInsurance) {
            policies.push({
              id: `oral-${i}`,
              provider: "health_insurance",
              productId: oralProduct.productId,
              coveragePercent: oralCoverage,
            });
          }

          const base = graphRequest();
          const graphInput: DecisionGraphRequestV2 = {
            ...base,
            patient: {
              ...base.patient,
              glycemia: {
                ...base.patient.glycemia,
                currentHba1c,
                targetHba1c: target,
                fastingPlasmaGlucoseMgDl: urgent
                  ? randint(next, 260, 420)
                  : randint(next, 90, 240),
                randomGlucoseMgDl: urgent ? randint(next, 300, 500) : undefined,
                ketonesKnownPositive: urgent && next() < 0.65,
                catabolicFeatures: urgent,
              },
              anthropometrics: weightKnown
                ? {
                    weightKg: randint(next, 45, 180),
                    bmi: 18 + randint(next, 0, 300) / 10,
                  }
                : {},
            },
            preferences: {
              ...base.preferences,
              routePreference,
              costPreference,
              insuranceProviders:
                costPreference === "insured_only" ? ["health_insurance"] : undefined,
            },
            inventory: {
              ...base.inventory,
              marketProducts: [oralProduct, basalProduct],
              insurancePolicies: policies,
            },
          };

          const result = runDecisionGraphV2(graphInput);

          if (result.clinicalState.pathway === "maintain_and_monitor") {
            failures.add("GRAPH_ACTIVE_NEED_BECAME_MAINTENANCE", i, caseSeed, {
              currentHba1c,
              target,
              urgent,
              status: result.status,
            });
          }

          const graphUrgent =
            Boolean(graphInput.patient.glycemia.ketonesKnownPositive) ||
            Boolean(
              result.clinicalState.severeHyperglycemia &&
              graphInput.patient.glycemia.catabolicFeatures,
            );

          if (graphUrgent && result.status !== "urgent_clinician_review") {
            failures.add("GRAPH_URGENT_STATUS_LOST", i, caseSeed, {
              status: result.status,
              clinicalState: result.clinicalState,
            });
          }

          if (graphUrgent && result.insulinSubgraph.status !== "urgent_review") {
            failures.add("GRAPH_URGENT_INSULIN_SUBGRAPH_LOST", i, caseSeed, {
              insulinSubgraph: result.insulinSubgraph.status,
            });
          }

          const recommendations = [
            result.primary,
            ...result.alternatives,
            ...result.comorbidityRecommendations,
          ].filter((item): item is NonNullable<typeof item> => Boolean(item));

          if (
            costPreference === "insured_only" &&
            !graphUrgent
          ) {
            for (const recommendation of recommendations) {
              const verifiedInsurance =
                recommendation.insuranceFit === "eligible" ||
                recommendation.insuranceFit === "conditional";

              if (verifiedInsurance) continue;

              const mandatoryInsulinOverride =
                recommendation.components.some((component) =>
                  /insulin/.test(component.therapyGroup),
                ) &&
                recommendation.preferenceConflicts.some((item) =>
                  item.includes("الزام بالینی"),
                ) &&
                recommendation.preferenceConflicts.some((item) =>
                  item.includes("بیمه"),
                );

              if (!mandatoryInsulinOverride) {
                failures.add("GRAPH_UNVERIFIED_INSURANCE_PASSED_INSURED_ONLY", i, caseSeed, {
                  regimenId: recommendation.regimenId,
                  insuranceFit: recommendation.insuranceFit,
                  conflicts: recommendation.preferenceConflicts,
                });
                continue;
              }

              if (result.status !== "no_fully_eligible_regimen") {
                failures.add("GRAPH_MANDATORY_INSULIN_ACCESS_CONFLICT_MARKED_COMPLETE", i, caseSeed, {
                  regimenId: recommendation.regimenId,
                  insuranceFit: recommendation.insuranceFit,
                  status: result.status,
                  conflicts: recommendation.preferenceConflicts,
                });
              }
            }
          }

          const regimenIds = recommendations.map((item) => item.regimenId);
          if (new Set(regimenIds).size !== regimenIds.length) {
            failures.add("GRAPH_DUPLICATE_REGIMEN", i, caseSeed, { regimenIds });
          }

          const planIds = (result.treatmentPlan?.components ?? [])
            .map((item) => item.masterDrugId)
            .filter((item): item is string => Boolean(item));

          if (new Set(planIds).size !== planIds.length) {
            failures.add("GRAPH_DUPLICATE_PLAN_MEDICATION", i, caseSeed, { planIds });
          }

          for (const recommendation of recommendations) {
            if (
              recommendation.monthlyPatientCostToman !== undefined &&
              !finiteNonNegative(recommendation.monthlyPatientCostToman)
            ) {
              failures.add("GRAPH_INVALID_PATIENT_COST", i, caseSeed, {
                regimenId: recommendation.regimenId,
                monthlyPatientCostToman: recommendation.monthlyPatientCostToman,
              });
            }
          }

          if (result.engine.scoreBased !== false) {
            failures.add("GRAPH_SCORE_BASED_REGRESSION", i, caseSeed, result.engine);
          }
        } catch (error) {
          failures.add("CLINICAL_ENGINE_THROW", i, caseSeed, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info(
        `[GLYMIZE] clinical stress completed: ${CLINICAL_CASES} cases; seed=0x${SEED.toString(16)}`,
      );
      failures.assertClean("100,000-case clinical stress");
    },
    300_000,
  );

  it(
    "runs 100,000 financial scenarios including malformed insurer data and aggregates failures",
    () => {
      const SEED = 0xc0572026;
      const rng = prng(SEED);
      const next = rng.next;
      const failures = new FailureCollector();

      for (let i = 0; i < FINANCIAL_CASES; i += 1) {
        const caseSeed = rng.state();

        try {
          const retail = randint(next, 1_000, 5_000_000);
          const unitsPerPack = randint(next, 1, 180);
          const unitsPerDay = randint(next, 1, 10);
          const coverage = randint(next, -100, 250);
          const reference = randint(next, -retail, retail * 5);
          const maxCovered = randint(next, -5, 20);

          const mode = i % 5;
          const policy: any = {
            id: `I-${i}`,
            provider: "health_insurance",
            productId: `P-${i}`,
            coveragePercent: coverage,
            referencePriceTomanPerPurchaseUnit: reference,
            maxCoveredPurchaseUnitsPer30Days: maxCovered,
          };

          if (mode === 1) {
            policy.patientShareTomanPerPurchaseUnit =
              randint(next, -retail * 2, retail * 3);
            delete policy.coveragePercent;
          } else if (mode === 2) {
            policy.insurerShareTomanPerPurchaseUnit =
              randint(next, -retail * 2, retail * 3);
            delete policy.coveragePercent;
          } else if (mode === 3) {
            policy.patientShareTomanPerPurchaseUnit =
              randint(next, -retail * 2, retail * 3);
            policy.insurerShareTomanPerPurchaseUnit =
              randint(next, -retail * 2, retail * 3);
            delete policy.coveragePercent;
          } else if (mode === 4) {
            policy.coveragePercent = i % 2 ? Number.NaN : Number.POSITIVE_INFINITY;
            policy.referencePriceTomanPerPurchaseUnit =
              i % 3 ? Number.POSITIVE_INFINITY : Number.NaN;
          }

          const p = product({
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
            product: p,
            dose,
            insurancePolicies: [policy],
            preferences: {
              routePreference: "oral_or_injectable",
              costPreference: "insured_only",
              insuranceProviders: ["health_insurance"],
            },
          });

          if (!result) {
            failures.add("FINANCIAL_RESULT_MISSING_FOR_VALID_PRODUCT", i, caseSeed, {
              retail,
              unitsPerPack,
              unitsPerDay,
            });
            continue;
          }

          const expectedPurchases = Math.ceil((unitsPerDay * 30) / unitsPerPack - 1e-9);
          const expectedCash = expectedPurchases * retail;

          const numericOutputs = {
            consumptionUnitsPerDay: result.consumptionUnitsPerDay,
            consumptionUnits30Days: result.consumptionUnits30Days,
            purchaseUnitsNeeded30Days: result.purchaseUnitsNeeded30Days,
            consumedDrugValueToman: result.consumedDrugValueToman,
            cashPurchaseCostToman: result.cashPurchaseCostToman,
            normalized30DayTreatmentCostToman: result.normalized30DayTreatmentCostToman,
            leftoverConsumptionUnitsAfter30Days: result.leftoverConsumptionUnitsAfter30Days,
            carryoverInventoryValueToman: result.carryoverInventoryValueToman,
          };

          for (const [name, value] of Object.entries(numericOutputs)) {
            if (!finiteNonNegative(value)) {
              failures.add("FINANCIAL_NONFINITE_OR_NEGATIVE_OUTPUT", i, caseSeed, {
                name,
                value,
                inputs: { retail, unitsPerPack, unitsPerDay, policy },
              });
            }
          }

          if (result.purchaseUnitsNeeded30Days !== expectedPurchases) {
            failures.add("FINANCIAL_PACKAGE_COUNT_MISMATCH", i, caseSeed, {
              expectedPurchases,
              actual: result.purchaseUnitsNeeded30Days,
              retail,
              unitsPerPack,
              unitsPerDay,
            });
          }

          if (result.cashPurchaseCostToman !== expectedCash) {
            failures.add("FINANCIAL_CASH_COST_MISMATCH", i, caseSeed, {
              expectedCash,
              actual: result.cashPurchaseCostToman,
            });
          }

          const estimate = result.insurance[0];
          if (!estimate) {
            failures.add("FINANCIAL_INSURANCE_ESTIMATE_MISSING", i, caseSeed, { policy });
            continue;
          }

          if (
            estimate.coveredPurchaseUnits < 0 ||
            estimate.uncoveredPurchaseUnits < 0
          ) {
            failures.add("FINANCIAL_NEGATIVE_PACKAGE_PARTITION", i, caseSeed, estimate);
          }

          if (
            estimate.coveredPurchaseUnits + estimate.uncoveredPurchaseUnits !==
            expectedPurchases
          ) {
            failures.add("FINANCIAL_PACKAGE_PARTITION_NOT_CONSERVED", i, caseSeed, {
              expectedPurchases,
              covered: estimate.coveredPurchaseUnits,
              uncovered: estimate.uncoveredPurchaseUnits,
            });
          }

          if (
            !finiteNonNegative(estimate.patientCostIfEligibleToman) ||
            !finiteNonNegative(estimate.insurerCostIfEligibleToman)
          ) {
            failures.add("FINANCIAL_INVALID_INSURANCE_COST", i, caseSeed, estimate);
          }

          if (
            estimate.patientCostIfEligibleToman +
              estimate.insurerCostIfEligibleToman >
            expectedCash
          ) {
            failures.add("FINANCIAL_MONEY_CREATED_AFTER_ROUNDING", i, caseSeed, {
              expectedCash,
              patient: estimate.patientCostIfEligibleToman,
              insurer: estimate.insurerCostIfEligibleToman,
              policy,
            });
          }

          if (
            estimate.displayCoveragePercent !== undefined &&
            (
              !Number.isFinite(estimate.displayCoveragePercent) ||
              estimate.displayCoveragePercent < 0 ||
              estimate.displayCoveragePercent > 100
            )
          ) {
            failures.add("FINANCIAL_DISPLAY_COVERAGE_OUT_OF_RANGE", i, caseSeed, estimate);
          }
        } catch (error) {
          failures.add("FINANCIAL_ENGINE_THROW", i, caseSeed, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info(
        `[GLYMIZE] financial stress completed: ${FINANCIAL_CASES} cases; seed=0x${SEED.toString(16)}`,
      );
      failures.assertClean("100,000-case financial stress");
    },
    300_000,
  );

  it(
    "runs 50,000 metamorphic pairs to detect non-monotonic insurance and price behavior",
    () => {
      const SEED = 0x4d455441;
      const rng = prng(SEED);
      const next = rng.next;
      const failures = new FailureCollector();

      for (let i = 0; i < METAMORPHIC_CASES; i += 1) {
        const caseSeed = rng.state();

        try {
          const retail1 = randint(next, 5_000, 2_000_000);
          const retail2 = retail1 + randint(next, 0, 1_000_000);
          const unitsPerPack = randint(next, 1, 120);
          const unitsPerDay = randint(next, 1, 8);
          const coverage1 = randint(next, 0, 95);
          const coverage2 = randint(next, coverage1, 100);
          const reference1 = randint(next, 0, retail1);
          const reference2 = randint(next, reference1, retail1);
          const maxCovered1 = randint(next, 0, 5);
          const maxCovered2 = randint(next, maxCovered1, 10);

          const dose: any = {
            ruleId: `META-${i}`,
            masterDrugId: "WD-TEST",
            dosageFormGroup: "tablet",
            administrationsPerDay: 1,
            presentationUnitsPerDay: unitsPerDay,
            displayStartDose: `${unitsPerDay} tablet/day`,
            monitoring: [],
            evidence: [],
            clinicianConfirmationRequired: true,
          };

          const baseProduct = product({
            productId: `META-${i}`,
            priceToman: retail1,
            consumptionUnitsPerPurchaseUnit: unitsPerPack,
            strengthComponents: [{ ingredientKey: "WD-TEST", amount: 1, unit: "mg" }],
          });

          const basePolicy: any = {
            id: `META-I-${i}`,
            provider: "health_insurance",
            productId: baseProduct.productId,
            coveragePercent: coverage1,
            referencePriceTomanPerPurchaseUnit: reference1,
            maxCoveredPurchaseUnitsPer30Days: maxCovered1,
          };

          const calc = (p: IranMarketProductV2, policy: any) =>
            calculateProductMonthlyCostV2({
              product: p,
              dose,
              insurancePolicies: [policy],
              preferences: {
                routePreference: "oral_or_injectable",
                costPreference: "insured_only",
                insuranceProviders: ["health_insurance"],
              },
            });

          const base = calc(baseProduct, basePolicy);
          if (!base?.insurance[0]) {
            failures.add("META_BASE_RESULT_MISSING", i, caseSeed, { basePolicy });
            continue;
          }

          const higherCoverage = calc(baseProduct, {
            ...basePolicy,
            coveragePercent: coverage2,
          });

          if (
            higherCoverage?.insurance[0] &&
            higherCoverage.insurance[0].patientCostIfEligibleToman >
              base.insurance[0].patientCostIfEligibleToman
          ) {
            failures.add("META_HIGHER_COVERAGE_INCREASED_PATIENT_COST", i, caseSeed, {
              coverage1,
              coverage2,
              before: base.insurance[0].patientCostIfEligibleToman,
              after: higherCoverage.insurance[0].patientCostIfEligibleToman,
            });
          }

          const higherReference = calc(baseProduct, {
            ...basePolicy,
            referencePriceTomanPerPurchaseUnit: reference2,
          });

          if (
            higherReference?.insurance[0] &&
            higherReference.insurance[0].patientCostIfEligibleToman >
              base.insurance[0].patientCostIfEligibleToman
          ) {
            failures.add("META_HIGHER_REFERENCE_INCREASED_PATIENT_COST", i, caseSeed, {
              reference1,
              reference2,
              before: base.insurance[0].patientCostIfEligibleToman,
              after: higherReference.insurance[0].patientCostIfEligibleToman,
            });
          }

          const moreCoveredPackages = calc(baseProduct, {
            ...basePolicy,
            maxCoveredPurchaseUnitsPer30Days: maxCovered2,
          });

          if (
            moreCoveredPackages?.insurance[0] &&
            moreCoveredPackages.insurance[0].patientCostIfEligibleToman >
              base.insurance[0].patientCostIfEligibleToman
          ) {
            failures.add("META_MORE_COVERED_PACKAGES_INCREASED_PATIENT_COST", i, caseSeed, {
              maxCovered1,
              maxCovered2,
              before: base.insurance[0].patientCostIfEligibleToman,
              after: moreCoveredPackages.insurance[0].patientCostIfEligibleToman,
            });
          }

          const higherRetailProduct = {
            ...baseProduct,
            priceToman: retail2,
          };

          const higherRetail = calc(higherRetailProduct, {
            ...basePolicy,
            referencePriceTomanPerPurchaseUnit: Math.min(reference1, retail2),
          });

          if (
            higherRetail &&
            higherRetail.cashPurchaseCostToman < base.cashPurchaseCostToman
          ) {
            failures.add("META_HIGHER_RETAIL_REDUCED_CASH_COST", i, caseSeed, {
              retail1,
              retail2,
              before: base.cashPurchaseCostToman,
              after: higherRetail.cashPurchaseCostToman,
            });
          }
        } catch (error) {
          failures.add("METAMORPHIC_ENGINE_THROW", i, caseSeed, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info(
        `[GLYMIZE] metamorphic stress completed: ${METAMORPHIC_CASES} pairs; seed=0x${SEED.toString(16)}`,
      );
      failures.assertClean("50,000-case metamorphic stress");
    },
    300_000,
  );

  it(
    "runs 25,000 adversarial numeric-input cases and requires fail-closed costing behavior",
    () => {
      const SEED = 0xbad1d47a;
      const rng = prng(SEED);
      const next = rng.next;
      const failures = new FailureCollector();

      const badNumbers = [
        -1,
        -1000,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ];

      for (let i = 0; i < ADVERSARIAL_CASES; i += 1) {
        const caseSeed = rng.state();

        try {
          const badPrice = pick(next, badNumbers);
          const badPack = pick(next, badNumbers);
          const badPerDay = pick(next, badNumbers);
          const dimension = i % 3;

          const p = product({
            productId: `BAD-${i}`,
            priceToman: dimension === 0 ? badPrice : randint(next, 1_000, 500_000),
            consumptionUnitsPerPurchaseUnit:
              dimension === 1 ? badPack : randint(next, 1, 60),
            strengthComponents: [{ ingredientKey: "WD-TEST", amount: 1, unit: "mg" }],
          });

          const dose: any = {
            ruleId: `BAD-R-${i}`,
            masterDrugId: "WD-TEST",
            dosageFormGroup: "tablet",
            administrationsPerDay: 1,
            presentationUnitsPerDay:
              dimension === 2 ? badPerDay : randint(next, 1, 5),
            displayStartDose: "adversarial",
            monitoring: [],
            evidence: [],
            clinicianConfirmationRequired: true,
          };

          const result = calculateProductMonthlyCostV2({
            product: p,
            dose,
            insurancePolicies: [],
            preferences: {
              routePreference: "oral_or_injectable",
              costPreference: "no_constraint",
            },
          });

          if (result !== undefined) {
            failures.add("ADVERSARIAL_INVALID_NUMERIC_INPUT_NOT_REJECTED", i, caseSeed, {
              dimension,
              priceToman: p.priceToman,
              consumptionUnitsPerPurchaseUnit: p.consumptionUnitsPerPurchaseUnit,
              presentationUnitsPerDay: dose.presentationUnitsPerDay,
              result: {
                purchaseUnitsNeeded30Days: result.purchaseUnitsNeeded30Days,
                cashPurchaseCostToman: result.cashPurchaseCostToman,
                normalized30DayTreatmentCostToman: result.normalized30DayTreatmentCostToman,
              },
            });
          }
        } catch (error) {
          failures.add("ADVERSARIAL_ENGINE_THROW_INSTEAD_OF_FAIL_CLOSED", i, caseSeed, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info(
        `[GLYMIZE] adversarial numeric stress completed: ${ADVERSARIAL_CASES} cases; seed=0x${SEED.toString(16)}`,
      );
      failures.assertClean("25,000-case adversarial numeric stress");
    },
    180_000,
  );
});