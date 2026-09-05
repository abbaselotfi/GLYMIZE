import { describe, expect, it } from "vitest";
import type {
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  MedicationClinicalEffect,
  Type2ConsiderationRequest,
} from "@glymize/contracts";
import { buildType2TreatmentScenarios } from "../src/scenario-engine-worlddrug-safe.js";
import {
  buildType2AssessmentWithWorldDrugCoverageV2,
  WORLD_DRUG_CONTEXT_REVIEW_V1,
} from "../src/type2-worlddrug-recommendation-compat.js";

const sourceUrl = "https://example.test/worlddrug";

function effect(domain: MedicationClinicalEffect["domain"]): MedicationClinicalEffect {
  return {
    domain,
    direction: "benefit",
    evidenceStrength: "guideline_recommended",
    sourceCodes: [`WD-${domain}`],
    sourceUrls: [sourceUrl],
  };
}

function master(input: {
  id: string;
  name: string;
  areas: string[];
  drugClass?: string;
  effects?: MedicationClinicalEffect[];
}): MasterDrugRegistryEntry {
  return {
    id: input.id,
    canonicalName: input.name,
    persianName: input.name,
    searchSynonyms: [input.name],
    combination: false,
    therapeuticAreas: input.areas,
    drugClass: input.drugClass,
    primaryIndications: input.areas,
    guidelineRole: `Reviewed WorldDrug role for ${input.areas.join(", ")}`,
    clinicalEffects: input.effects ?? [],
    sourceCodes: [`WORLD-DRUG:${input.id}`],
    sourceUrls: [sourceUrl],
    sourceObservedAt: "2026-09-01T00:00:00.000Z",
    reviewState: "approved",
  };
}

function product(entry: MasterDrugRegistryEntry, index: number, overrides: Partial<IranMarketDrugProduct> = {}): IranMarketDrugProduct {
  return {
    id: `nfi-worlddrug-${index}`,
    masterDrugId: entry.id,
    genericName: entry.canonicalName,
    brandName: `${entry.canonicalName} Iran brand`,
    genericRegistryCode: `G-${index}`,
    brandRegistryCode: `B-${index}`,
    dosageForm: "Tablet",
    strengthPresentation: "10 mg",
    packagePresentation: "30 tablets",
    route: "oral",
    licenseStatus: "Active",
    licenseValidUntilJalali: "1406/12/29",
    price: {
      amountToman: 100_000 + index * 10_000,
      priceKind: "consumer_retail",
      sourceUrl: `https://irc.fda.gov.ir/nfi/worlddrug-${index}`,
      sourceReference: `NFI-${index}`,
    },
    insuranceCoverages: [],
    sourceUrl: `https://irc.fda.gov.ir/nfi/worlddrug-${index}`,
    sourceReference: `NFI-${index}`,
    observedAt: "2026-09-01T00:00:00.000Z",
    matchConfidence: 99,
    ...overrides,
  };
}

const registry = [
  master({
    id: "WD-METFORMIN",
    name: "Metformin",
    areas: ["Type 2 diabetes"],
    drugClass: "Biguanide",
    effects: [effect("glycemic_control")],
  }),
  master({
    id: "WD-LOSARTAN",
    name: "Losartan",
    areas: ["Hypertension", "CKD", "Cardiovascular"],
    drugClass: "Angiotensin II receptor blocker (ARB)",
    effects: [effect("ckd"), effect("hypertension")],
  }),
  master({
    id: "WD-CARVEDILOL",
    name: "Carvedilol",
    areas: ["Heart failure", "Cardiovascular"],
    drugClass: "Beta blocker heart failure therapy",
    effects: [effect("heart_failure")],
  }),
  master({
    id: "WD-RESMETIROM",
    name: "Resmetirom",
    areas: ["MASH", "Liver"],
    drugClass: "THR-beta agonist liver-directed therapy",
    effects: [effect("masld_mash")],
  }),
  master({
    id: "WD-PREGABALIN",
    name: "Pregabalin",
    areas: ["Diabetic neuropathy", "Neuropathy"],
    drugClass: "Neuropathic pain therapy",
    effects: [effect("neuropathy")],
  }),
  master({
    id: "WD-RANIBIZUMAB",
    name: "Ranibizumab",
    areas: ["Diabetic retinopathy", "Macular edema"],
    drugClass: "Anti-VEGF ophthalmic therapy",
    effects: [effect("retinopathy")],
  }),
  master({
    id: "WD-AMOXICILLIN",
    name: "Amoxicillin",
    areas: ["Infectious disease"],
    drugClass: "Penicillin antibiotic",
  }),
];

const products = registry.map((entry, index) => product(entry, index + 1));

function request(overrides: Partial<Type2ConsiderationRequest> = {}) {
  const base: Type2ConsiderationRequest & {
    activeClinicalDomains?: string[];
    activeTherapeuticAreas?: string[];
  } = {
    currentHba1c: 7,
    targetHba1c: 7,
    factors: ["ckd", "heart_failure", "masld_mash"],
    routePreference: "oral_and_injectable",
    costPreference: "no_constraint",
    clinicalContext: {
      kidney: { ckd: true, eGfr: 65, uacrMgG: 100 },
      cardiovascular: { heartFailure: true },
      liver: { masldMash: true, fibrosisStage: "F2", cirrhosis: false },
    },
    activeTherapeuticAreas: ["Neuropathy", "Retinopathy"],
  };
  return { ...base, ...overrides } as Type2ConsiderationRequest;
}

function assessment(customRequest: Type2ConsiderationRequest = request()) {
  return buildType2AssessmentWithWorldDrugCoverageV2({
    medications: [],
    request: customRequest,
    masterRegistry: registry,
    marketProducts: products,
  });
}

describe("Phase 4 WorldDrug multidomain recommendation coverage", () => {
  it("projects current-market WorldDrug options for active renal, cardiac, hepatic, neuropathy and retinopathy contexts without ranking them", () => {
    const result = assessment();
    const review = result.medications.filter((item) => item.outputStatus === "requires_approved_protocol");
    const names = new Set(review.map((item) => item.genericName));

    expect(names).toEqual(expect.objectContaining ? names : names);
    expect(names.has("Losartan")).toBe(true);
    expect(names.has("Carvedilol")).toBe(true);
    expect(names.has("Resmetirom")).toBe(true);
    expect(names.has("Pregabalin")).toBe(true);
    expect(names.has("Ranibizumab")).toBe(true);
    expect(names.has("Amoxicillin")).toBe(false);

    for (const item of review) {
      expect(item.priorityScore).toBe(0);
      expect(item.priorityTier).toBe("consider");
      expect(item.outputStatus).toBe("requires_approved_protocol");
      expect(item.sourceReference).toContain(WORLD_DRUG_CONTEXT_REVIEW_V1);
      expect((item as { decisionGraphRank?: number }).decisionGraphRank).toBeUndefined();
    }

    expect(result.worldDrugCoverage.activeDomains).toEqual(
      expect.arrayContaining(["diabetes", "kidney", "cardiovascular", "heart_failure", "liver", "masld_mash"]),
    );
    expect(result.worldDrugCoverage.activeTherapeuticAreas).toEqual(["Neuropathy", "Retinopathy"]);
    expect(result.worldDrugCoverage.projectedReviewOptions).toBe(review.length);
  });

  it("requires verified current Iran-market presence before a WorldDrug entry is displayed", () => {
    const historicalProducts = products.map((item) =>
      item.masterDrugId === "WD-PREGABALIN"
        ? { ...item, licenseStatus: "Expired", licenseValidUntilJalali: "1402/01/01", observedAt: "2023-04-01T00:00:00.000Z" }
        : item,
    );
    const result = buildType2AssessmentWithWorldDrugCoverageV2({
      medications: [],
      request: request(),
      masterRegistry: registry,
      marketProducts: historicalProducts,
    });

    expect(result.medications.some((item) => item.genericName === "Pregabalin")).toBe(false);
  });

  it("keeps structural hard exclusions out of WorldDrug review projection", () => {
    const result = assessment(request({
      factors: ["ckd"],
      clinicalContext: { kidney: { ckd: true, eGfr: 20, uacrMgG: 100 } },
    }));
    expect(result.medications.some((item) => item.genericName === "Metformin" && item.outputStatus === "requires_approved_protocol")).toBe(false);
  });

  it("does not surface resmetirom unless the existing non-cirrhotic MASH F2-F3 hard eligibility criteria are satisfied", () => {
    const result = assessment(request({
      factors: ["masld_mash"],
      clinicalContext: {
        liver: { masldMash: true, fibrosisStage: "F4", cirrhosis: true },
      },
    }));
    expect(result.medications.some((item) => item.genericName === "Resmetirom")).toBe(false);
  });

  it("appends WorldDrug review options as a separate informational card and leaves Decision Graph top ranks untouched", () => {
    const result = assessment();
    const scenarios = buildType2TreatmentScenarios({
      assessment: result,
      request: request(),
      maxScenarios: 3,
    });
    const reviewCard = scenarios.find((scenario) => scenario.kind === "worlddrug_review");

    expect(reviewCard).toBeDefined();
    expect(reviewCard?.id).toBe("worlddrug-review-options");
    expect(reviewCard?.medications.length).toBeGreaterThan(0);
    expect(reviewCard?.medications.every((item) => item.outputStatus === "requires_approved_protocol")).toBe(true);
    expect(reviewCard?.summaryFa).toContain("پیشنهاد نسخه اجرایی محسوب نمی‌شوند");

    const clinicalCards = scenarios.filter((scenario) => scenario.kind !== "worlddrug_review");
    expect(clinicalCards.length).toBeLessThanOrEqual(3);
    expect(clinicalCards.flatMap((scenario) => scenario.medications).some((item) => item.outputStatus === "requires_approved_protocol")).toBe(false);
  });
});
