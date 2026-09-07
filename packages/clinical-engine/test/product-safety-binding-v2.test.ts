import { describe, expect, it } from "vitest";
import {
  bindReviewedWegovySafetyScreenV2,
  bindReviewedWegovySafetyScreensV2,
  projectReviewedWegovySafetyForDecisionGraphV2,
} from "../src/decision-graph-v2/product-safety-binding.js";
import {
  buildReviewedProductSafetyRegistryV2,
} from "../src/decision-graph-v2/product-safety-registry.js";
import type { ProductSpecificSafetyScreenV2 } from "../src/decision-graph-v2/product-safety-screen.js";
import type {
  IranMarketProductV2,
  KnowledgeMedicationV2,
} from "../src/decision-graph-v2/types.js";

const masterDrugId = "MASTER-SEMAGLUTIDE-SC";

function medication(): KnowledgeMedicationV2 {
  return {
    masterDrugId,
    genericName: "Semaglutide injection",
    combination: false,
    therapeuticAreas: ["diabetes", "liver"],
    therapyGroup: "glp_1_receptor_agonist",
    primaryLanes: ["glycemic", "liver"],
    routeOptions: ["subcutaneous"],
    efficacyBand: "very_high",
    hypoglycemiaRisk: "minimal",
    weightDirection: "loss",
    effects: [],
    evidence: [],
    engineState: "approved",
  };
}

function product(patch: Partial<IranMarketProductV2> = {}): IranMarketProductV2 {
  return {
    productId: "NFI-WEGOVY-2_4",
    masterDrugId,
    nfiMatchState: "verified",
    genericName: "semaglutide",
    brandName: "WEGOVY",
    dosageFormGroup: "prefilled_pen",
    route: "subcutaneous",
    consumptionUnit: "pen",
    strengthComponents: [{ ingredientKey: masterDrugId, amount: 2.4, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 4,
    purchaseUnitLabel: "box",
    license: { everValid: true, currentValid: true, revoked: false },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-07",
    ...patch,
  };
}

function inventory(productPatch: Partial<IranMarketProductV2> = {}) {
  return {
    knowledge: [medication()],
    marketProducts: [product(productPatch)],
  };
}

function screen(
  states: Partial<Record<string, "present" | "absent" | "unknown">> = {},
  patch: Partial<ProductSpecificSafetyScreenV2> = {},
): ProductSpecificSafetyScreenV2 {
  const set = buildReviewedProductSafetyRegistryV2(inventory())[0]!;
  return {
    masterDrugId: set.masterDrugId,
    reviewSetId: set.reviewSetId,
    reviewSetVersion: set.reviewSetVersion,
    responses: set.criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      state: states[criterion.criterionId] ?? "absent",
    })),
    ...patch,
  };
}

describe("reviewed WEGOVY product-safety binding v2", () => {
  it("binds an exact complete all-absent review set to the existing WEGOVY safety context", () => {
    const result = bindReviewedWegovySafetyScreenV2({
      inventory: inventory(),
      screen: screen(),
    });

    expect(result.status).toBe("bound");
    expect(result.reviewSetId).toBe("WEGOVY-MASH-SAFETY");
    expect(result.reviewSetVersion).toBe("2026-06-18");
    expect(result.masterDrugId).toBe(masterDrugId);
    expect(result.medicationSafety).toEqual({
      personalOrFamilyHistoryMtc: false,
      men2: false,
      priorSeriousSemaglutideHypersensitivity: false,
      severeGastroparesis: false,
      suspectedAcutePancreatitis: false,
    });
  });

  it("maps each explicit present response to the exact existing protocol boolean without executing it", () => {
    const idsToFields = [
      ["wegovy.personal_or_family_mtc_history", "personalOrFamilyHistoryMtc"],
      ["wegovy.men2", "men2"],
      ["wegovy.serious_semaglutide_hypersensitivity", "priorSeriousSemaglutideHypersensitivity"],
      ["wegovy.severe_gastroparesis", "severeGastroparesis"],
      ["wegovy.suspected_acute_pancreatitis", "suspectedAcutePancreatitis"],
    ] as const;

    for (const [criterionId, field] of idsToFields) {
      const result = bindReviewedWegovySafetyScreenV2({
        inventory: inventory(),
        screen: screen({ [criterionId]: "present" }),
      });
      expect(result.status).toBe("bound");
      expect(result.validation?.riskCriterionIds).toEqual([criterionId]);
      expect(result.medicationSafety?.[field]).toBe(true);
    }
  });

  it("never binds missing, unknown, stale-version, or identity-mismatched responses", () => {
    expect(bindReviewedWegovySafetyScreenV2({ inventory: inventory() }).status).toBe("missing");

    const unknown = bindReviewedWegovySafetyScreenV2({
      inventory: inventory(),
      screen: screen({ "wegovy.men2": "unknown" }),
    });
    expect(unknown.status).toBe("incomplete");
    expect(unknown.medicationSafety).toBeUndefined();

    const stale = bindReviewedWegovySafetyScreenV2({
      inventory: inventory(),
      screen: screen({}, { reviewSetVersion: "2025" }),
    });
    expect(stale.status).toBe("version_mismatch");
    expect(stale.medicationSafety).toBeUndefined();

    const mismatched = bindReviewedWegovySafetyScreenV2({
      inventory: inventory(),
      screen: screen({}, { masterDrugId: "OTHER" }),
    });
    expect(mismatched.status).toBe("identity_mismatch");
    expect(mismatched.medicationSafety).toBeUndefined();
  });

  it("refuses to bind when the exact current verified WEGOVY registry is unavailable", () => {
    const ozempic = bindReviewedWegovySafetyScreenV2({
      inventory: inventory({ brandName: "Ozempic" }),
      screen: screen(),
    });
    expect(ozempic.status).toBe("registry_unavailable");
    expect(ozempic.medicationSafety).toBeUndefined();

    const revoked = bindReviewedWegovySafetyScreenV2({
      inventory: inventory({ license: { everValid: true, currentValid: false, revoked: true } }),
      screen: screen(),
    });
    expect(revoked.status).toBe("registry_unavailable");
    expect(revoked.medicationSafety).toBeUndefined();
  });

  it("does not mutate the submitted transport envelope", () => {
    const submitted = screen({ "wegovy.severe_gastroparesis": "present" });
    const before = structuredClone(submitted);
    bindReviewedWegovySafetyScreenV2({ inventory: inventory(), screen: submitted });
    expect(submitted).toEqual(before);
  });

  it("selects one exact WEGOVY screen from unrelated product screens and rejects ambiguous duplicates", () => {
    const unrelated: ProductSpecificSafetyScreenV2 = {
      masterDrugId: "OTHER-MASTER",
      reviewSetId: "OTHER-REVIEW-SET",
      reviewSetVersion: "v1",
      responses: [],
    };
    const exact = screen({ "wegovy.men2": "present" });

    const selected = bindReviewedWegovySafetyScreensV2({
      inventory: inventory(),
      screens: [unrelated, exact],
    });
    expect(selected.status).toBe("bound");
    expect(selected.medicationSafety?.men2).toBe(true);

    const duplicate = bindReviewedWegovySafetyScreensV2({
      inventory: inventory(),
      screens: [screen(), screen()],
    });
    expect(duplicate.status).toBe("duplicate_screen");
    expect(duplicate.medicationSafety).toBeUndefined();
  });

  it("keeps stale and wrong-master WEGOVY review-set claims fail-closed when selecting from an array", () => {
    const stale = bindReviewedWegovySafetyScreensV2({
      inventory: inventory(),
      screens: [screen({}, { reviewSetVersion: "2025" })],
    });
    expect(stale.status).toBe("version_mismatch");
    expect(stale.medicationSafety).toBeUndefined();

    const wrongMaster = bindReviewedWegovySafetyScreensV2({
      inventory: inventory(),
      screens: [screen({}, { masterDrugId: "OTHER-MASTER" })],
    });
    expect(wrongMaster.status).toBe("identity_mismatch");
    expect(wrongMaster.medicationSafety).toBeUndefined();
  });

  it("rebuilds WEGOVY safety only from the reviewed screen while preserving generic medication-safety facts", () => {
    const submitted = {
      glycemia: { currentHba1c: 7, targetHba1c: 7 },
      medicationSafety: {
        maoiUseOrRecentExposure: true,
        // This extra transport property must not become WEGOVY authority.
        personalOrFamilyHistoryMtc: true,
      },
      productSafetyScreens: [screen()],
    };
    const before = structuredClone(submitted);

    const projected = projectReviewedWegovySafetyForDecisionGraphV2({
      inventory: inventory(),
      patient: submitted,
    });

    expect(projected.binding.status).toBe("bound");
    expect(projected.patient.medicationSafety).toEqual({
      maoiUseOrRecentExposure: true,
      substantialAlcoholUse: undefined,
      knownPregabalinHypersensitivity: undefined,
      personalOrFamilyHistoryMtc: false,
      men2: false,
      priorSeriousSemaglutideHypersensitivity: false,
      severeGastroparesis: false,
      suspectedAcutePancreatitis: false,
    });
    expect("productSafetyScreens" in projected.patient).toBe(false);
    expect(submitted).toEqual(before);
  });

  it("does not project ad-hoc WEGOVY booleans when the submitted review set is stale", () => {
    const submitted = {
      glycemia: { currentHba1c: 7, targetHba1c: 7 },
      medicationSafety: {
        substantialAlcoholUse: false,
        personalOrFamilyHistoryMtc: false,
        men2: false,
        priorSeriousSemaglutideHypersensitivity: false,
        severeGastroparesis: false,
        suspectedAcutePancreatitis: false,
      },
      productSafetyScreens: [screen({}, { reviewSetVersion: "2025" })],
    };

    const projected = projectReviewedWegovySafetyForDecisionGraphV2({
      inventory: inventory(),
      patient: submitted,
    });

    expect(projected.binding.status).toBe("version_mismatch");
    expect(projected.patient.medicationSafety).toEqual({
      maoiUseOrRecentExposure: undefined,
      substantialAlcoholUse: false,
      knownPregabalinHypersensitivity: undefined,
    });
    expect("personalOrFamilyHistoryMtc" in (projected.patient.medicationSafety ?? {})).toBe(false);
  });
});
