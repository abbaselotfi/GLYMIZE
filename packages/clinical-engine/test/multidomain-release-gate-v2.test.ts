import { describe, expect, it } from "vitest";
import type {
  ClinicalEffectDirection,
  ClinicalEffectDomain,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
} from "@glymize/contracts";
import {
  approvedDoseRulesForV2,
  buildDecisionGraphInventoryFromContractsV2,
  buildFactMapV2,
  resolveDosePlanV2,
  runDecisionGraphV2,
  type ClinicalStateV2,
  type DecisionGraphRequestV2,
  type DecisionLaneV2,
  type PatientContextV2,
} from "../src/decision-graph-v2/index.js";

const RANDOM_GRAPH_CASES = 20_000;
const METAMORPHIC_CASES = 20_000;
const ADVERSARIAL_CASES = 10_000;

class FailureCollector {
  private total = 0;
  private counts = new Map<string, number>();
  private examples: Array<{ code: string; index: number; detail: string }> = [];

  add(code: string, index: number, detail: unknown) {
    this.total += 1;
    this.counts.set(code, (this.counts.get(code) ?? 0) + 1);
    if (this.examples.length < 30) {
      let rendered = "";
      try {
        rendered = JSON.stringify(detail);
      } catch {
        rendered = String(detail);
      }
      this.examples.push({ code, index, detail: rendered.slice(0, 1200) });
    }
  }

  assertClean(label: string) {
    if (this.total === 0) {
      console.info(`[GLYMIZE] ${label}: PASS`);
      return;
    }
    const families = [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => `${code}: ${count}`)
      .join("\n");
    const examples = this.examples
      .map((item) => `[${item.code}] case=${item.index}\n${item.detail}`)
      .join("\n\n");
    throw new Error(
      `\nGLYMIZE ${label} FAILED\nTotal failures: ${this.total}\n\n${families}\n\n${examples}\n`,
    );
  }
}

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

function pick<T>(next: () => number, values: readonly T[]): T {
  return values[Math.min(values.length - 1, Math.floor(next() * values.length))]!;
}

function effect(
  domain: ClinicalEffectDomain,
  direction: ClinicalEffectDirection = "strong_benefit",
) {
  return {
    domain,
    direction,
    evidenceStrength: "guideline_recommended" as const,
    sourceCodes: ["PHASE4-TASK10"],
    sourceUrls: ["https://glymize.ir/architecture/phase4-task10"],
  };
}

function master(input: {
  id: string;
  name: string;
  drugClass: string;
  therapeuticAreas: string[];
  effects: ReturnType<typeof effect>[];
  guidelineRole?: string;
}): MasterDrugRegistryEntry {
  return {
    id: input.id,
    canonicalName: input.name,
    persianName: input.name,
    searchSynonyms: [input.name],
    combination: false,
    therapeuticAreas: input.therapeuticAreas,
    drugClass: input.drugClass,
    primaryIndications: input.therapeuticAreas,
    guidelineRole: input.guidelineRole ?? "Phase 4 Task 10 multidomain release-gate fixture",
    clinicalEffects: input.effects,
    sourceCodes: ["PHASE4-TASK10"],
    sourceUrls: ["https://glymize.ir/architecture/phase4-task10"],
    reviewState: "approved",
  };
}

function product(input: {
  id: string;
  masterDrugId: string;
  name: string;
  strengthMg: number;
  priceToman: number;
}): IranMarketDrugProduct {
  return {
    id: input.id,
    masterDrugId: input.masterDrugId,
    genericName: input.name,
    brandName: `${input.name} Task10 Brand`,
    genericRegistryCode: `G-${input.id}`,
    brandRegistryCode: `B-${input.id}`,
    dosageForm: "Tablet",
    strengthPresentation: `${input.strengthMg} mg`,
    packagePresentation: "30 tablets",
    route: "oral",
    licenseStatus: "Active",
    licenseValidUntilJalali: "1406/12/29",
    price: {
      amountToman: input.priceToman,
      priceKind: "consumer_retail",
      sourceUrl: `https://irc.fda.gov.ir/nfi/${input.id}`,
      sourceReference: input.id,
    },
    insuranceCoverages: [],
    sourceUrl: `https://irc.fda.gov.ir/nfi/${input.id}`,
    sourceReference: input.id,
    observedAt: "2026-09-01T00:00:00.000Z",
    matchConfidence: 99,
  };
}

const registry: MasterDrugRegistryEntry[] = [
  master({
    id: "WD-METFORMIN",
    name: "Metformin",
    drugClass: "Biguanide",
    therapeuticAreas: ["Type 2 diabetes"],
    effects: [effect("glycemic_control")],
    guidelineRole: "High efficacy glucose-lowering therapy for Phase 4 Task 10",
  }),
  master({
    id: "WD-ENALAPRIL",
    name: "Enalapril",
    drugClass: "ACE inhibitor",
    therapeuticAreas: ["Hypertension", "Cardiovascular"],
    effects: [effect("hypertension")],
  }),
  master({
    id: "WD-LOSARTAN",
    name: "Losartan",
    drugClass: "Angiotensin II receptor blocker (ARB)",
    therapeuticAreas: ["Hypertension", "CKD", "Cardiovascular"],
    effects: [effect("hypertension")],
  }),
  master({
    id: "WD-VALSARTAN",
    name: "Valsartan",
    drugClass: "Angiotensin II receptor blocker (ARB)",
    therapeuticAreas: ["Hypertension", "Heart failure", "Cardiovascular"],
    effects: [effect("hypertension", "benefit"), effect("heart_failure", "benefit")],
  }),
  master({
    id: "WD-ATORVASTATIN",
    name: "Atorvastatin",
    drugClass: "Statin lipid-lowering therapy",
    therapeuticAreas: ["Lipids", "Cardiovascular"],
    effects: [effect("lipids")],
  }),
  master({
    id: "WD-ROSUVASTATIN",
    name: "Rosuvastatin",
    drugClass: "Statin lipid-lowering therapy",
    therapeuticAreas: ["Lipids", "Cardiovascular"],
    effects: [effect("lipids")],
  }),
  master({
    id: "WD-FINERENONE",
    name: "Finerenone",
    drugClass: "Mineralocorticoid receptor antagonist",
    therapeuticAreas: ["CKD", "Kidney"],
    effects: [effect("ckd")],
  }),
  master({
    id: "WD-SPIRONOLACTONE",
    name: "Spironolactone",
    drugClass: "Mineralocorticoid receptor antagonist",
    therapeuticAreas: ["Heart failure", "Cardiovascular"],
    effects: [effect("heart_failure")],
  }),
];

const marketProducts: IranMarketDrugProduct[] = [
  product({ id: "MET-500", masterDrugId: "WD-METFORMIN", name: "Metformin", strengthMg: 500, priceToman: 40_000 }),
  product({ id: "ENA-2.5", masterDrugId: "WD-ENALAPRIL", name: "Enalapril", strengthMg: 2.5, priceToman: 55_000 }),
  product({ id: "ENA-5", masterDrugId: "WD-ENALAPRIL", name: "Enalapril", strengthMg: 5, priceToman: 60_000 }),
  product({ id: "LOS-50", masterDrugId: "WD-LOSARTAN", name: "Losartan", strengthMg: 50, priceToman: 80_000 }),
  product({ id: "VAL-80", masterDrugId: "WD-VALSARTAN", name: "Valsartan", strengthMg: 80, priceToman: 90_000 }),
  product({ id: "ATO-10", masterDrugId: "WD-ATORVASTATIN", name: "Atorvastatin", strengthMg: 10, priceToman: 100_000 }),
  product({ id: "ROS-5", masterDrugId: "WD-ROSUVASTATIN", name: "Rosuvastatin", strengthMg: 5, priceToman: 120_000 }),
  product({ id: "FIN-10", masterDrugId: "WD-FINERENONE", name: "Finerenone", strengthMg: 10, priceToman: 400_000 }),
  product({ id: "FIN-20", masterDrugId: "WD-FINERENONE", name: "Finerenone", strengthMg: 20, priceToman: 500_000 }),
  product({ id: "SPI-25", masterDrugId: "WD-SPIRONOLACTONE", name: "Spironolactone", strengthMg: 25, priceToman: 70_000 }),
];

const built = buildDecisionGraphInventoryFromContractsV2({
  masterRegistry: registry,
  marketProducts,
  policy: { asOf: new Date("2026-09-05T00:00:00.000Z") },
});
const inventory = built.inventory;
const idByName = new Map(inventory.knowledge.map((item) => [item.genericName, item.masterDrugId]));

function basePreferences() {
  return {
    routePreference: "oral_or_injectable" as const,
    costPreference: "no_constraint" as const,
  };
}

function currentLosartan() {
  return {
    masterDrugId: "WD-LOSARTAN",
    genericName: "Losartan",
    therapyGroup: "raas_blocker",
    dailyDose: [{ ingredientKey: "WD-LOSARTAN", amount: 50, unit: "mg" }],
    administrationsPerDay: 1,
    status: "active" as const,
  };
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function checkPlanEconomics(
  failures: FailureCollector,
  index: number,
  result: ReturnType<typeof runDecisionGraphV2>,
) {
  const components = result.treatmentPlan?.components ?? [];
  const ids = components.map((item) => item.masterDrugId);
  const groups = components.map((item) => item.therapyGroup);

  if (new Set(ids).size !== ids.length) {
    failures.add("DUPLICATE_MASTER_DRUG_IN_PLAN", index, { ids });
  }
  if (new Set(groups).size !== groups.length) {
    failures.add("DUPLICATE_THERAPY_GROUP_IN_PLAN", index, { groups, ids });
  }

  for (const component of components) {
    if (!component.dosePlan) {
      failures.add("EXECUTABLE_PLAN_COMPONENT_WITHOUT_DOSE", index, component);
      continue;
    }

    const doseComponents = component.dosePlan.dailyComponents ?? component.dosePlan.perAdministrationComponents ?? [];
    if (!doseComponents.length) {
      failures.add("DOSE_PLAN_WITHOUT_QUANTIFIED_COMPONENT", index, component.dosePlan);
    }
    for (const doseComponent of doseComponents) {
      if (!finiteNonNegative(doseComponent.amount) || doseComponent.amount <= 0) {
        failures.add("INVALID_DOSE_AMOUNT", index, { component: component.genericName, doseComponent });
      }
    }

    const administrations30 = component.dosePlan.administrationsPer30Days ??
      (component.dosePlan.administrationsPerDay !== undefined
        ? component.dosePlan.administrationsPerDay * 30
        : undefined);
    if (administrations30 !== undefined && (!finiteNonNegative(administrations30) || administrations30 <= 0)) {
      failures.add("INVALID_ADMINISTRATION_COUNT", index, { component: component.genericName, administrations30 });
    }

    const cost = component.selectedProductCost;
    const selected = component.selectedProduct;
    if (!cost || !selected) continue;

    const numericCostFields = [
      cost.consumptionUnitsPerDay,
      cost.consumptionUnits30Days,
      cost.purchaseUnitsNeeded30Days,
      cost.cashPurchaseCostToman,
      cost.normalized30DayTreatmentCostToman,
    ];
    if (numericCostFields.some((value) => !finiteNonNegative(value))) {
      failures.add("INVALID_PRODUCT_COST_NUMERIC", index, { component: component.genericName, cost });
    }

    if (
      selected.consumptionUnitsPerPurchaseUnit > 0 &&
      finiteNonNegative(cost.consumptionUnits30Days)
    ) {
      const expectedPurchases = Math.ceil(
        cost.consumptionUnits30Days / selected.consumptionUnitsPerPurchaseUnit - 1e-9,
      );
      if (cost.purchaseUnitsNeeded30Days !== expectedPurchases) {
        failures.add("PACKAGE_COUNT_MISMATCH", index, {
          component: component.genericName,
          expectedPurchases,
          actual: cost.purchaseUnitsNeeded30Days,
          units30: cost.consumptionUnits30Days,
          unitsPerPack: selected.consumptionUnitsPerPurchaseUnit,
        });
      }
      if (
        selected.priceToman !== undefined &&
        cost.cashPurchaseCostToman !== expectedPurchases * selected.priceToman
      ) {
        failures.add("CASH_COST_MISMATCH", index, {
          component: component.genericName,
          expected: expectedPurchases * selected.priceToman,
          actual: cost.cashPurchaseCostToman,
        });
      }
    }
  }
}

function protocolRules(
  genericName: string,
  patient: PatientContextV2,
  lane: DecisionLaneV2,
) {
  const masterDrugId = idByName.get(genericName);
  if (!masterDrugId) throw new Error(`Missing Task 10 fixture: ${genericName}`);
  return approvedDoseRulesForV2(
    masterDrugId,
    inventory.doseRules,
    buildFactMapV2(patient, false),
    "initiation",
    lane,
  );
}

const stableState: ClinicalStateV2 = {
  pathway: "maintain_and_monitor",
  insulinAction: "none",
  severeHyperglycemia: false,
  hba1cGap: 0,
  reasons: [],
  evidence: [],
};

function patientWith(
  kidney: PatientContextV2["kidney"] = {},
  cardiovascular: PatientContextV2["cardiovascular"] = {},
): PatientContextV2 {
  return {
    pregnancy: false,
    glycemia: { currentHba1c: 7, targetHba1c: 7 },
    kidney,
    cardiovascular,
  };
}

describe("Phase 4 Task 10 multidomain release gate", () => {
  it("passes a deterministic synthetic phenotype matrix with executable dose, quantity, and cost", () => {
    const bpLipid = runDecisionGraphV2({
      patient: {
        ageYears: 55,
        glycemia: { currentHba1c: 8, targetHba1c: 7 },
        kidney: { ckd: false, eGfr: 90, creatinineClearanceMlMin: 85, uacrMgG: 45, potassiumMmolL: 4.4, dialysis: false },
        cardiovascular: { systolicBloodPressure: 138, diastolicBloodPressure: 84 },
        currentMedications: [currentLosartan()],
      },
      preferences: basePreferences(),
      inventory,
    });
    expect(bpLipid.status).toBe("complete");
    expect(bpLipid.treatmentPlan?.coveredObjectives).toEqual(expect.arrayContaining([
      "glycemic_control",
      "blood_pressure_control",
      "lipid_risk_reduction",
    ]));
    expect(bpLipid.treatmentPlan?.components.map((item) => item.therapyGroup)).toEqual(
      expect.arrayContaining(["biguanide", "raas_blocker", "lipid_lowering"]),
    );

    const finerenone = runDecisionGraphV2({
      patient: {
        ageYears: 30,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
        kidney: { ckd: true, eGfr: 35, creatinineClearanceMlMin: 40, uacrMgG: 120, potassiumMmolL: 4.6, dialysis: false },
      },
      preferences: basePreferences(),
      inventory,
    });
    const finerenoneComponent = finerenone.treatmentPlan?.components.find((item) => item.genericName === "Finerenone");
    expect(finerenoneComponent?.servesObjectives).toContain("kidney_protection");
    expect(finerenoneComponent?.dosePlan?.dailyComponents?.[0]?.amount).toBe(10);
    expect(finerenoneComponent?.selectedProductCost?.purchaseUnitsNeeded30Days).toBeGreaterThan(0);

    const hfref = runDecisionGraphV2({
      patient: {
        ageYears: 30,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
        kidney: { ckd: false, eGfr: 45, creatinineClearanceMlMin: 50, uacrMgG: 10, potassiumMmolL: 4.5, dialysis: false },
        cardiovascular: { heartFailure: true, lvefPercent: 35 },
      },
      preferences: basePreferences(),
      inventory,
    });
    const spiro = hfref.treatmentPlan?.components.find((item) => item.genericName === "Spironolactone");
    expect(spiro?.servesObjectives).toContain("heart_failure_protection");
    expect(spiro?.dosePlan?.administrationsPer30Days).toBe(15);

    const pregnancy = runDecisionGraphV2({
      patient: {
        ageYears: 35,
        pregnancy: true,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
        kidney: { ckd: true, eGfr: 40, creatinineClearanceMlMin: 45, uacrMgG: 100, potassiumMmolL: 4.5, dialysis: false },
        cardiovascular: { heartFailure: true, lvefPercent: 35 },
      },
      preferences: basePreferences(),
      inventory,
    });
    const pregnancyNames = pregnancy.treatmentPlan?.components.map((item) => item.genericName) ?? [];
    for (const hardAvoid of ["Enalapril", "Losartan", "Valsartan", "Finerenone", "Spironolactone"]) {
      expect(pregnancyNames).not.toContain(hardAvoid);
    }
  });

  it(
    "runs 20,000 randomized multidomain graph cases without unsafe executable composition",
    () => {
      const next = prng(0x4d444731);
      const failures = new FailureCollector();

      for (let i = 0; i < RANDOM_GRAPH_CASES; i += 1) {
        try {
          const ageYears = randint(next, 18, 85);
          const pregnancy = next() < 0.04;
          const ckd = next() < 0.42;
          const eGfr = randint(next, 15, 105);
          const creatinineClearanceMlMin = next() < 0.82 ? randint(next, 10, 110) : undefined;
          const uacrMgG = next() < 0.82 ? randint(next, 0, 500) : undefined;
          const potassiumMmolL = next() < 0.88 ? 3.2 + randint(next, 0, 26) / 10 : undefined;
          const dialysis = ckd && eGfr < 20 && next() < 0.18;
          const heartFailure = next() < 0.24;
          const lvefPercent = heartFailure && next() < 0.90 ? randint(next, 20, 55) : undefined;
          const establishedHypertension = next() < 0.52;
          const systolicBloodPressure = randint(next, 105, 175);
          const diastolicBloodPressure = randint(next, 60, 105);
          const targetHba1c = 6.5 + randint(next, 0, 10) / 10;
          const currentHba1c = targetHba1c + randint(next, 0, 13) / 10;

          const request: DecisionGraphRequestV2 = {
            patient: {
              ageYears,
              pregnancy,
              glycemia: { currentHba1c, targetHba1c },
              anthropometrics: { bmi: randint(next, 20, 38) },
              kidney: {
                ckd,
                eGfr,
                creatinineClearanceMlMin,
                uacrMgG,
                potassiumMmolL,
                dialysis,
              },
              cardiovascular: {
                heartFailure,
                lvefPercent,
                systolicBloodPressure,
                diastolicBloodPressure,
                ascvd: false,
              },
              currentMedications: establishedHypertension ? [currentLosartan()] : [],
            },
            preferences: basePreferences(),
            inventory,
          };

          const result = runDecisionGraphV2(request);
          checkPlanEconomics(failures, i, result);

          const plan = result.treatmentPlan;
          const components = plan?.components ?? [];
          const names = components.map((item) => item.genericName);

          if (pregnancy) {
            for (const hardAvoid of ["Enalapril", "Losartan", "Valsartan", "Finerenone", "Spironolactone"]) {
              if (names.includes(hardAvoid)) {
                failures.add("PREGNANCY_HARD_AVOID_EXECUTED", i, { hardAvoid, names });
              }
            }
          }

          const finerenoneComponent = components.find((item) => item.genericName === "Finerenone");
          if (finerenoneComponent) {
            const valid =
              !pregnancy &&
              ckd &&
              uacrMgG !== undefined && uacrMgG >= 30 &&
              potassiumMmolL !== undefined && potassiumMmolL > 0 && potassiumMmolL <= 5 &&
              eGfr >= 25;
            if (!valid) {
              failures.add("FINERENONE_OUTSIDE_REVIEWED_PHENOTYPE", i, {
                ckd, uacrMgG, potassiumMmolL, eGfr, pregnancy,
              });
            }
          }

          const spironolactoneComponent = components.find((item) => item.genericName === "Spironolactone");
          if (spironolactoneComponent) {
            const valid =
              !pregnancy &&
              heartFailure &&
              lvefPercent !== undefined && lvefPercent <= 40 &&
              potassiumMmolL !== undefined && potassiumMmolL > 0 && potassiumMmolL <= 5 &&
              eGfr >= 30;
            if (!valid) {
              failures.add("SPIRONOLACTONE_OUTSIDE_REVIEWED_PHENOTYPE", i, {
                heartFailure, lvefPercent, potassiumMmolL, eGfr, pregnancy,
              });
            }
          }

          const rosuvastatinComponent = components.find((item) => item.genericName === "Rosuvastatin");
          if (rosuvastatinComponent) {
            if (
              pregnancy ||
              creatinineClearanceMlMin === undefined ||
              creatinineClearanceMlMin < 0 ||
              dialysis
            ) {
              failures.add("ROSUVASTATIN_WITHOUT_VALID_CRCL_BRANCH", i, {
                pregnancy, creatinineClearanceMlMin, dialysis,
              });
            }
            const ruleId = rosuvastatinComponent.dosePlan?.ruleId ?? "";
            if (creatinineClearanceMlMin !== undefined && creatinineClearanceMlMin < 30 && !ruleId.includes("CRCLLT30")) {
              failures.add("ROSUVASTATIN_SEVERE_RENAL_BRANCH_MISMATCH", i, { creatinineClearanceMlMin, ruleId });
            }
            if (creatinineClearanceMlMin !== undefined && creatinineClearanceMlMin >= 30 && !ruleId.includes("CRCL30PLUS")) {
              failures.add("ROSUVASTATIN_STANDARD_RENAL_BRANCH_MISMATCH", i, { creatinineClearanceMlMin, ruleId });
            }
          }

          const lipidMandatory = result.objectives.some(
            (objective) => objective.id === "lipid_risk_reduction" && objective.level === "mandatory",
          );
          if (lipidMandatory && !pregnancy && !plan?.coveredObjectives.includes("lipid_risk_reduction")) {
            failures.add("MANDATORY_LIPID_OBJECTIVE_UNCOVERED_WITH_EXECUTABLE_STATIN", i, {
              ageYears,
              status: result.status,
              unresolved: plan?.unresolvedObjectives,
            });
          }

          const bpMandatory = result.objectives.some(
            (objective) => objective.id === "blood_pressure_control" && objective.level === "mandatory",
          );
          if (bpMandatory && !plan?.coveredObjectives.includes("blood_pressure_control")) {
            failures.add("MANDATORY_BP_OBJECTIVE_UNCOVERED_WITH_CURRENT_RAAS", i, {
              establishedHypertension,
              systolicBloodPressure,
              diastolicBloodPressure,
              eGfr,
              uacrMgG,
              status: result.status,
            });
          }

          if (
            plan?.unresolvedObjectives.length === 0 &&
            result.status === "no_fully_eligible_regimen" &&
            !result.missingData.some((item) => item.blocksFinalDecision)
          ) {
            failures.add("COMPLETE_OBJECTIVE_SET_MARKED_NO_ELIGIBLE", i, {
              objectives: result.objectives,
              status: result.status,
            });
          }

          if (result.engine.scoreBased !== false) {
            failures.add("SCORE_AUTHORITY_REGRESSION", i, result.engine);
          }
        } catch (error) {
          failures.add("MULTIDOMAIN_GRAPH_THROW", i, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info(`[GLYMIZE] Task 10 randomized multidomain cases: ${RANDOM_GRAPH_CASES}`);
      failures.assertClean("20,000-case multidomain graph release gate");
    },
    180_000,
  );

  it(
    "runs 20,000 metamorphic protocol cases across CrCl, eGFR, potassium, and HFrEF boundaries",
    () => {
      const next = prng(0x4d455431);
      const failures = new FailureCollector();

      for (let i = 0; i < METAMORPHIC_CASES; i += 1) {
        try {
          const mode = i % 4;

          if (mode === 0) {
            const crcl = randint(next, 1, 100);
            const first = patientWith({ eGfr: randint(next, 5, 120), creatinineClearanceMlMin: crcl, dialysis: false });
            const second = patientWith({ eGfr: randint(next, 5, 120), creatinineClearanceMlMin: crcl, dialysis: false });
            const a = protocolRules("Enalapril", first, "hypertension");
            const b = protocolRules("Enalapril", second, "hypertension");
            if (a.length !== 1 || b.length !== 1 || a[0]?.id !== b[0]?.id) {
              failures.add("ENALAPRIL_EGFR_CHANGED_CRCL_BRANCH", i, { crcl, a: a.map((item) => item.id), b: b.map((item) => item.id) });
            } else {
              const dose = resolveDosePlanV2(a[0]!, first, stableState)?.dailyComponents?.[0]?.amount;
              const expected = crcl <= 30 ? 2.5 : 5;
              if (dose !== expected) failures.add("ENALAPRIL_CRCL_DOSE_MISMATCH", i, { crcl, dose, expected });
            }
          } else if (mode === 1) {
            const eGfr = randint(next, 25, 100);
            const valid = patientWith({ ckd: true, eGfr, uacrMgG: randint(next, 30, 500), potassiumMmolL: 3.5 + randint(next, 0, 15) / 10 });
            const rules = protocolRules("Finerenone", valid, "kidney");
            if (rules.length !== 1) {
              failures.add("FINERENONE_VALID_PHENOTYPE_NOT_EXECUTABLE", i, { eGfr, ids: rules.map((item) => item.id) });
            } else {
              const dose = resolveDosePlanV2(rules[0]!, valid, stableState)?.dailyComponents?.[0]?.amount;
              const expected = eGfr >= 60 ? 20 : 10;
              if (dose !== expected) failures.add("FINERENONE_EGFR_DOSE_MISMATCH", i, { eGfr, dose, expected });
            }
            const highK = patientWith({ ckd: true, eGfr, uacrMgG: 100, potassiumMmolL: 5.1 + randint(next, 0, 9) / 10 });
            if (protocolRules("Finerenone", highK, "kidney").length !== 0) {
              failures.add("FINERENONE_HIGH_K_NOT_FAIL_CLOSED", i, { eGfr, potassium: highK.kidney?.potassiumMmolL });
            }
          } else if (mode === 2) {
            const eGfr = randint(next, 30, 100);
            const valid = patientWith(
              { eGfr, potassiumMmolL: 3.5 + randint(next, 0, 15) / 10 },
              { heartFailure: true, lvefPercent: randint(next, 20, 40) },
            );
            const rules = protocolRules("Spironolactone", valid, "heart_failure");
            if (rules.length !== 1) {
              failures.add("SPIRONOLACTONE_VALID_HFREF_NOT_EXECUTABLE", i, { eGfr, ids: rules.map((item) => item.id) });
            } else if (eGfr <= 50 && rules[0]?.formula.kind !== "fixed_interval_components") {
              failures.add("SPIRONOLACTONE_RENAL_INTERVAL_BRANCH_MISMATCH", i, { eGfr, formula: rules[0]?.formula });
            } else if (eGfr > 50 && rules[0]?.formula.kind !== "fixed_daily_components") {
              failures.add("SPIRONOLACTONE_STANDARD_BRANCH_MISMATCH", i, { eGfr, formula: rules[0]?.formula });
            }
            const highK = patientWith(
              { eGfr, potassiumMmolL: 5.1 + randint(next, 0, 9) / 10 },
              { heartFailure: true, lvefPercent: 35 },
            );
            if (protocolRules("Spironolactone", highK, "heart_failure").length !== 0) {
              failures.add("SPIRONOLACTONE_HIGH_K_NOT_FAIL_CLOSED", i, { eGfr, potassium: highK.kidney?.potassiumMmolL });
            }
          } else {
            const crcl = randint(next, 1, 100);
            const first = patientWith({ eGfr: randint(next, 5, 120), creatinineClearanceMlMin: crcl, dialysis: false });
            const second = patientWith({ eGfr: randint(next, 5, 120), creatinineClearanceMlMin: crcl, dialysis: false });
            const a = protocolRules("Rosuvastatin", first, "lipids");
            const b = protocolRules("Rosuvastatin", second, "lipids");
            if (a.length !== 1 || b.length !== 1 || a[0]?.id !== b[0]?.id) {
              failures.add("ROSUVASTATIN_EGFR_CHANGED_CRCL_BRANCH", i, { crcl, a: a.map((item) => item.id), b: b.map((item) => item.id) });
            } else {
              const maxText = a[0]?.maximumDoseText ?? "";
              if (crcl < 30 && !maxText.includes("10 mg")) {
                failures.add("ROSUVASTATIN_SEVERE_RENAL_CAP_MISSING", i, { crcl, maxText });
              }
              if (crcl >= 30 && !maxText.includes("40 mg")) {
                failures.add("ROSUVASTATIN_STANDARD_CAP_MISSING", i, { crcl, maxText });
              }
            }
          }
        } catch (error) {
          failures.add("METAMORPHIC_PROTOCOL_THROW", i, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info(`[GLYMIZE] Task 10 metamorphic protocol cases: ${METAMORPHIC_CASES}`);
      failures.assertClean("20,000-case cardiometabolic metamorphic release gate");
    },
    120_000,
  );

  it(
    "runs 10,000 adversarial invalid-numeric cases and fails closed before dose execution",
    () => {
      const next = prng(0x41445631);
      const failures = new FailureCollector();
      const badNumbers = [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const;

      for (let i = 0; i < ADVERSARIAL_CASES; i += 1) {
        try {
          const badEgfr = pick(next, badNumbers);
          const badCrcl = pick(next, badNumbers);
          const badPotassium = pick(next, badNumbers);
          const badLvef = pick(next, [...badNumbers, 101, 150] as const);
          const badSbp = pick(next, [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const);

          const patient: PatientContextV2 = {
            ageYears: 55,
            pregnancy: false,
            glycemia: { currentHba1c: 7, targetHba1c: 7 },
            kidney: {
              ckd: true,
              eGfr: badEgfr,
              creatinineClearanceMlMin: badCrcl,
              uacrMgG: 100,
              potassiumMmolL: badPotassium,
              dialysis: false,
            },
            cardiovascular: {
              heartFailure: true,
              lvefPercent: badLvef,
              systolicBloodPressure: badSbp,
              diastolicBloodPressure: 90,
              ascvd: false,
            },
            currentMedications: [currentLosartan()],
          };

          const facts = buildFactMapV2(patient, false);
          if (facts["kidney.eGfr"] !== undefined) failures.add("INVALID_EGFR_REACHED_FACT_MAP", i, { badEgfr, fact: facts["kidney.eGfr"] });
          if (facts["kidney.creatinineClearanceMlMin"] !== undefined) failures.add("INVALID_CRCL_REACHED_FACT_MAP", i, { badCrcl, fact: facts["kidney.creatinineClearanceMlMin"] });
          if (facts["kidney.potassiumMmolL"] !== undefined) failures.add("INVALID_POTASSIUM_REACHED_FACT_MAP", i, { badPotassium, fact: facts["kidney.potassiumMmolL"] });
          if (facts["cardiovascular.lvefPercent"] !== undefined) failures.add("INVALID_LVEF_REACHED_FACT_MAP", i, { badLvef, fact: facts["cardiovascular.lvefPercent"] });

          if (protocolRules("Enalapril", patient, "hypertension").length !== 0) {
            failures.add("INVALID_CRCL_EXECUTED_ENALAPRIL_RULE", i, { badCrcl });
          }
          if (protocolRules("Rosuvastatin", patient, "lipids").length !== 0) {
            failures.add("INVALID_CRCL_EXECUTED_ROSUVASTATIN_RULE", i, { badCrcl });
          }
          if (protocolRules("Finerenone", patient, "kidney").length !== 0) {
            failures.add("INVALID_RENAL_FACT_EXECUTED_FINERENONE_RULE", i, { badEgfr, badPotassium });
          }
          if (protocolRules("Spironolactone", patient, "heart_failure").length !== 0) {
            failures.add("INVALID_HF_FACT_EXECUTED_SPIRONOLACTONE_RULE", i, { badEgfr, badPotassium, badLvef });
          }

          const result = runDecisionGraphV2({
            patient,
            preferences: basePreferences(),
            inventory,
          });
          const names = result.treatmentPlan?.components.map((item) => item.genericName) ?? [];
          if (names.includes("Finerenone") || names.includes("Spironolactone")) {
            failures.add("ADVERSARIAL_MRA_REACHED_EXECUTABLE_PLAN", i, { names, badEgfr, badPotassium, badLvef });
          }
          if (!result.missingData.some((item) => item.key === "kidney.eGfr" && item.blocksFinalDecision)) {
            failures.add("INVALID_EGFR_NOT_REPORTED_BLOCKING", i, { badEgfr, missingData: result.missingData });
          }
        } catch (error) {
          failures.add("ADVERSARIAL_MULTIDOMAIN_THROW", i, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info(`[GLYMIZE] Task 10 adversarial multidomain cases: ${ADVERSARIAL_CASES}`);
      failures.assertClean("10,000-case adversarial multidomain release gate");
    },
    120_000,
  );
});
