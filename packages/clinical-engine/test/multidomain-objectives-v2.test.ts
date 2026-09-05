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

function marketProduct(
  masterDrugId: string,
  genericName: string,
  index: number,
): IranMarketDrugProduct {
  return {
    id: `nfi-phase4-${index}`,
    masterDrugId,
    genericName,
    brandName: `${genericName} source brand`,
    genericRegistryCode: `G-${index}`,
    brandRegistryCode: `B-${index}`,
    dosageForm: "Tablet",
    strengthPresentation: "50 mg",
    packagePresentation: "30 tablets",
    route: "oral",
    licenseStatus: "Active",
    licenseValidUntilJalali: "1406/12/29",
    price: {
      amountToman: 100_000 + index * 10_000,
      priceKind: "consumer_retail",
      sourceUrl: `https://irc.fda.gov.ir/nfi/phase4-${index}`,
      sourceReference: `nfi-phase4-${index}`,
    },
    insuranceCoverages: [],
    sourceUrl: `https://irc.fda.gov.ir/nfi/phase4-${index}`,
    sourceReference: `nfi-phase4-${index}`,
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

const products = registry.map((entry, index) =>
  marketProduct(entry.id, entry.canonicalName, index + 1),
);

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

describe("Phase 4 Task 7 cardiovascular objectives", () => {
  it("composes glycemic + one RAAS + one statin support without duplicate therapy", () => {
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
            status: "active",
          },
        ],
      },
    });

    expect(
      result.objectives.some(
        (objective) =>
          objective.id === "blood_pressure_control" && objective.level === "mandatory",
      ),
    ).toBe(true);
    expect(
      result.objectives.some(
        (objective) =>
          objective.id === "lipid_risk_reduction" && objective.level === "mandatory",
      ),
    ).toBe(true);

    expect(result.treatmentPlan).toBeDefined();
    expect(result.treatmentPlan?.coveredObjectives).toEqual(
      expect.arrayContaining([
        "glycemic_control",
        "blood_pressure_control",
        "lipid_risk_reduction",
      ]),
    );
    expect(result.treatmentPlan?.unresolvedObjectives).toEqual([]);

    const therapyGroups = result.treatmentPlan?.components.map(
      (component) => component.therapyGroup,
    ) ?? [];
    expect(therapyGroups.filter((group) => group === "biguanide")).toHaveLength(1);
    expect(therapyGroups.filter((group) => group === "raas_blocker")).toHaveLength(1);
    expect(therapyGroups.filter((group) => group === "lipid_lowering")).toHaveLength(1);
    expect(new Set(therapyGroups).size).toBe(therapyGroups.length);
    expect(result.treatmentPlan?.supportingRegimenIds).toHaveLength(2);
    expect(result.status).toBe("complete");
  });

  it("does not initiate RAAS support from a single BP context when hypertension is not established", () => {
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

    expect(
      result.objectives.some((objective) => objective.id === "blood_pressure_control"),
    ).toBe(false);
    expect(
      result.missingData.find(
        (item) => item.key === "cardiovascular.hypertensionConfirmation",
      ),
    ).toMatchObject({ priority: "recommended", blocksFinalDecision: false });
    expect(result.treatmentPlan).toBeUndefined();
  });

  it("activates mandatory statin risk reduction for ages 40-75 independently of baseline LDL", () => {
    const result = runDecisionGraphV2({
      ...baseRequest(),
      patient: {
        ageYears: 50,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
      },
    });

    expect(
      result.objectives.find((objective) => objective.id === "lipid_risk_reduction"),
    ).toMatchObject({ lane: "lipids", level: "mandatory" });
    expect(result.treatmentPlan?.components).toHaveLength(1);
    expect(result.treatmentPlan?.components[0]?.therapyGroup).toBe("lipid_lowering");
    expect(result.treatmentPlan?.coveredObjectives).toContain("lipid_risk_reduction");
  });

  it("keeps weaker statin initiation indications non-executable and excludes pregnancy from this general pathway", () => {
    const older = runDecisionGraphV2({
      ...baseRequest(),
      patient: {
        ageYears: 79,
        glycemia: { currentHba1c: 7, targetHba1c: 7 },
      },
    });
    expect(
      older.objectives.find((objective) => objective.id === "lipid_risk_reduction"),
    ).toMatchObject({ level: "preference" });
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
            status: "active",
          },
        ],
      },
    });
    expect(
      pregnant.objectives.some(
        (objective) =>
          objective.id === "lipid_risk_reduction" || objective.id === "blood_pressure_control",
      ),
    ).toBe(false);
  });
});
