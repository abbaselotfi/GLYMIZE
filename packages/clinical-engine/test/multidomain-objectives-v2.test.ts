import { describe, expect, it } from "vitest";
import type { IranMarketDrugProduct, MasterDrugRegistryEntry } from "@glymize/contracts";
import {
  buildDecisionGraphInventoryFromContractsV2,
  runDecisionGraphV2,
} from "../src/index.js";

const sourceUrl =
  "https://diabetesjournals.org/care/article/49/Supplement_1/S216/163933/10-Cardiovascular-Disease-and-Risk-Management";

function master(input: {
  id: string;
  canonicalName: string;
  drugClass: string;
  therapeuticAreas: string[];
  effectDomain: "glycemic_control" | "hypertension" | "lipids";
  effectDirection?: "benefit" | "strong_benefit";
}): MasterDrugRegistryEntry {
  return {
    id: input.id,
    canonicalName: input.canonicalName,
    persianName: input.canonicalName,
    searchSynonyms: [input.canonicalName],
    combination: false,
    therapeuticAreas: input.therapeuticAreas,
    drugClass: input.drugClass,
    primaryIndications: input.therapeuticAreas,
    guidelineRole: "Phase 4 Task 7 objective fixture",
    clinicalEffects: [
      {
        domain: input.effectDomain,
        direction: input.effectDirection ?? "strong_benefit",
        evidenceStrength: "guideline_recommended",
        sourceCodes: ["ADA10-2026"],
        sourceUrls: [sourceUrl],
      },
    ],
    sourceCodes: ["ADA10-2026"],
    sourceUrls: [sourceUrl],
    reviewState: "approved",
  };
}

function marketProduct(input: {
  masterDrugId: string;
  genericName: string;
  index: number;
  strengthMg: number;
}): IranMarketDrugProduct {
  return {
    id: `nfi-phase4-${input.index}`,
    masterDrugId: input.masterDrugId,
    genericName: input.genericName,
    brandName: `${input.genericName} source brand`,
    genericRegistryCode: `G-${input.index}`,
    brandRegistryCode: `B-${input.index}`,
    dosageForm: "Tablet",
    strengthPresentation: `${input.strengthMg} mg`,
    packagePresentation: "30 tablets",
    route: "oral",
    licenseStatus: "Active",
    licenseValidUntilJalali: "1406/12/29",
    price: {
      amountToman: 100_000 + input.index * 10_000,
      priceKind: "consumer_retail",
      sourceUrl: `https://irc.fda.gov.ir/nfi/phase4-${input.index}`,
      sourceReference: `nfi-phase4-${input.index}`,
    },
    insuranceCoverages: [],
    sourceUrl: `https://irc.fda.gov.ir/nfi/phase4-${input.index}`,
    sourceReference: `nfi-phase4-${input.index}`,
    observedAt: "2026-09-01T00:00:00.000Z",
    matchConfidence: 99,
  };
}

const registry = [
  master({
    id: "WD-METFORMIN",
    canonicalName: "Metformin",
    drugClass: "Biguanide",
    therapeuticAreas: ["Type 2 diabetes"],
    effectDomain: "glycemic_control",
  }),
  master({
    id: "WD-LOSARTAN",
    canonicalName: "Losartan",
    drugClass: "Angiotensin II receptor blocker (ARB)",
    therapeuticAreas: ["Hypertension", "CKD", "Cardiovascular"],
    effectDomain: "hypertension",
  }),
  master({
    id: "WD-VALSARTAN",
    canonicalName: "Valsartan",
    drugClass: "Angiotensin II receptor blocker (ARB)",
    therapeuticAreas: ["Hypertension", "CKD", "Cardiovascular"],
    effectDomain: "hypertension",
  }),
  master({
    id: "WD-ATORVASTATIN",
    canonicalName: "Atorvastatin",
    drugClass: "Statin lipid-lowering therapy",
    therapeuticAreas: ["Lipids", "Cardiovascular"],
    effectDomain: "lipids",
  }),
  master({
    id: "WD-ROSUVASTATIN",
    canonicalName: "Rosuvastatin",
    drugClass: "Statin lipid-lowering therapy",
    therapeuticAreas: ["Lipids", "Cardiovascular"],
    effectDomain: "lipids",
  }),
];

const products = [
  marketProduct({ masterDrugId: "WD-METFORMIN", genericName: "Metformin", index: 1, strengthMg: 500 }),
  marketProduct({ masterDrugId: "WD-LOSARTAN", genericName: "Losartan", index: 2, strengthMg: 50 }),
  marketProduct({ masterDrugId: "WD-VALSARTAN", genericName: "Valsartan", index: 3, strengthMg: 80 }),
  marketProduct({ masterDrugId: "WD-ATORVASTATIN", genericName: "Atorvastatin", index: 4, strengthMg: 10 }),
  marketProduct({ masterDrugId: "WD-ROSUVASTATIN", genericName: "Rosuvastatin", index: 5, strengthMg: 5 }),
];

function inventory() {
  return buildDecisionGraphInventoryFromContractsV2({
    masterRegistry: registry,
    marketProducts: products,
    policy: { asOf: new Date("2026-09-05T00:00:00.000Z") },
  }).inventory;
}

function baseRequest() {
  return {
    preferences: {
      routePreference: "oral_or_injectable" as const,
      costPreference: "no_constraint" as const,
    },
    inventory: inventory(),
  };
}

function dailyDose(masterDrugId: string, amount: number) {
  return [{ ingredientKey: masterDrugId, amount, unit: "mg" }];
}

describe("Phase 4 Task 7 cardiovascular objectives after Task 8 protocols", () => {
  it("composes glycemic + one established RAAS + one statin support with executable doses and no duplicate therapy", () => {
    const result = runDecisionGraphV2({
      ...baseRequest(),
      patient: {
        ageYears: 55,
        glycemia: { currentHba1c: 8, targetHba1c: 7 },
        kidney: { ckd: false, eGfr: 90, uacrMgG: 45 },
        cardiovascular: {
          systolicBloodPressure: 138,
          diastolicBloodPressure: 84,
        },
        currentMedications: [
          {
            masterDrugId: "WD-LOSARTAN",
            genericName: "Losartan",
            therapyGroup: "raas_blocker",
            dailyDose: dailyDose("WD-LOSARTAN", 50),
            administrationsPerDay: 1,
            status: "active",
          },
        ],
      },
    });

    expect(result.objectives).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "blood_pressure_control", level: "mandatory" }),
      expect.objectContaining({ id: "lipid_risk_reduction", level: "mandatory" }),
    ]));

    expect(result.treatmentPlan).toBeDefined();
    expect(result.treatmentPlan?.coveredObjectives).toEqual(expect.arrayContaining([
      "glycemic_control",
      "blood_pressure_control",
      "lipid_risk_reduction",
    ]));
    expect(result.treatmentPlan?.unresolvedObjectives).toEqual([]);

    const components = result.treatmentPlan?.components ?? [];
    const therapyGroups = components.map((component) => component.therapyGroup);
    expect(therapyGroups.filter((group) => group === "biguanide")).toHaveLength(1);
    expect(therapyGroups.filter((group) => group === "raas_blocker")).toHaveLength(1);
    expect(therapyGroups.filter((group) => group === "lipid_lowering")).toHaveLength(1);
    expect(new Set(therapyGroups).size).toBe(therapyGroups.length);
    expect(result.treatmentPlan?.supportingRegimenIds).toHaveLength(2);

    const raas = components.find((component) => component.therapyGroup === "raas_blocker");
    const statin = components.find((component) => component.therapyGroup === "lipid_lowering");
    expect(raas?.dosePlan?.ruleId).toBe("CURRENT-DOCUMENTED:WD-LOSARTAN");
    expect(statin?.dosePlan?.ruleId).toMatch(/^LABEL-(ATORVASTATIN|ROSUVASTATIN)-LIPID-START:/);
    expect(statin?.dosePlan?.clinicianConfirmationRequired).toBe(true);
    expect(result.status).toBe("complete");
  });

  it("does not initiate RAAS support from one BP reading when established hypertension context is absent", () => {
    const result = runDecisionGraphV2({
      ...baseRequest(),
      patient: {
        ageYears: 30,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
        kidney: { ckd: false, eGfr: 90, uacrMgG: 45 },
        cardiovascular: {
          systolicBloodPressure: 142,
          diastolicBloodPressure: 92,
        },
      },
    });

    expect(result.objectives.some((objective) => objective.id === "blood_pressure_control")).toBe(false);
    expect(result.missingData.find(
      (item) => item.key === "cardiovascular.hypertensionConfirmation",
    )).toMatchObject({ priority: "recommended", blocksFinalDecision: false });
    expect(result.treatmentPlan).toBeUndefined();
  });

  it("activates mandatory statin risk reduction for ages 40-75 without requiring a baseline LDL trigger", () => {
    const result = runDecisionGraphV2({
      ...baseRequest(),
      patient: {
        ageYears: 50,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
      },
    });

    expect(result.objectives.find((objective) => objective.id === "lipid_risk_reduction"))
      .toMatchObject({ lane: "lipids", level: "mandatory" });
    expect(result.treatmentPlan?.components).toHaveLength(1);
    expect(result.treatmentPlan?.components[0]?.therapyGroup).toBe("lipid_lowering");
    expect(result.treatmentPlan?.components[0]?.dosePlan?.clinicianConfirmationRequired).toBe(true);
    expect(result.treatmentPlan?.coveredObjectives).toContain("lipid_risk_reduction");
  });

  it("keeps weaker initiation indications non-mandatory and excludes pregnancy from the general BP/lipid pathway", () => {
    const older = runDecisionGraphV2({
      ...baseRequest(),
      patient: {
        ageYears: 79,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
      },
    });
    expect(older.objectives.find((objective) => objective.id === "lipid_risk_reduction"))
      .toMatchObject({ level: "preference" });
    expect(older.treatmentPlan).toBeUndefined();

    const pregnant = runDecisionGraphV2({
      ...baseRequest(),
      patient: {
        ageYears: 45,
        pregnancy: true,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
        kidney: { ckd: false, eGfr: 80, uacrMgG: 100 },
        cardiovascular: {
          systolicBloodPressure: 140,
          diastolicBloodPressure: 90,
          ascvd: false,
        },
        currentMedications: [
          {
            masterDrugId: "WD-LOSARTAN",
            genericName: "Losartan",
            therapyGroup: "raas_blocker",
            dailyDose: dailyDose("WD-LOSARTAN", 50),
            administrationsPerDay: 1,
            status: "active",
          },
        ],
      },
    });
    expect(pregnant.objectives.some(
      (objective) => objective.id === "lipid_risk_reduction" || objective.id === "blood_pressure_control",
    )).toBe(false);
  });
});
