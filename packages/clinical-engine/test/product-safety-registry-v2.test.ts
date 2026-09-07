import { describe, expect, it } from "vitest";
import {
  buildReviewedProductSafetyRegistryV2,
  validateProductSafetyScreenV2,
} from "../src/decision-graph-v2/product-safety-registry.js";
import type {
  IranMarketProductV2,
  KnowledgeMedicationV2,
} from "../src/decision-graph-v2/types.js";
import type { ProductSpecificSafetyScreenV2 } from "../src/decision-graph-v2/product-safety-screen.js";

const masterDrugId = "MASTER-SEMAGLUTIDE-SC";

function medication(patch: Partial<KnowledgeMedicationV2> = {}): KnowledgeMedicationV2 {
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
    ...patch,
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

function registry() {
  const sets = buildReviewedProductSafetyRegistryV2({
    knowledge: [medication()],
    marketProducts: [product()],
  });
  expect(sets).toHaveLength(1);
  return sets[0]!;
}

function screen(
  patch: Partial<ProductSpecificSafetyScreenV2> = {},
): ProductSpecificSafetyScreenV2 {
  const set = registry();
  return {
    masterDrugId: set.masterDrugId,
    reviewSetId: set.reviewSetId,
    reviewSetVersion: set.reviewSetVersion,
    responses: set.criteria.map((criterion) => ({ criterionId: criterion.criterionId, state: "absent" as const })),
    ...patch,
  };
}

describe("reviewed product safety criterion registry v2", () => {
  it("publishes one exact WEGOVY MASH review set from the already-reviewed 2026 label facts", () => {
    const set = registry();

    expect(set.reviewSetId).toBe("WEGOVY-MASH-SAFETY");
    expect(set.reviewSetVersion).toBe("2026-06-18");
    expect(set.masterDrugId).toBe(masterDrugId);
    expect(set.productIdentity).toEqual({ brandName: "WEGOVY", route: "subcutaneous" });
    expect(set.reviewState).toBe("approved");
    expect(set.criteria.map((criterion) => criterion.criterionId)).toEqual([
      "wegovy.personal_or_family_mtc_history",
      "wegovy.men2",
      "wegovy.serious_semaglutide_hypersensitivity",
      "wegovy.severe_gastroparesis",
      "wegovy.suspected_acute_pancreatitis",
    ]);
    expect(set.criteria.map((criterion) => criterion.effect)).toEqual([
      "exclude_if_present",
      "exclude_if_present",
      "exclude_if_present",
      "block_execution_if_present",
      "block_execution_if_present",
    ]);
    for (const criterion of set.criteria) {
      expect(criterion.evidence.map((item) => item.sourceId)).toEqual(["US-LABEL-WEGOVY-2026-06"]);
    }
  });

  it("never assigns the WEGOVY review set to another brand or an unverified/non-current product", () => {
    const ozempic = buildReviewedProductSafetyRegistryV2({
      knowledge: [medication()],
      marketProducts: [product({ brandName: "Ozempic" })],
    });
    expect(ozempic).toEqual([]);

    const unverified = buildReviewedProductSafetyRegistryV2({
      knowledge: [medication()],
      marketProducts: [product({ nfiMatchState: "review_required" })],
    });
    expect(unverified).toEqual([]);

    const revoked = buildReviewedProductSafetyRegistryV2({
      knowledge: [medication()],
      marketProducts: [product({ license: { everValid: true, currentValid: false, revoked: true } })],
    });
    expect(revoked).toEqual([]);
  });

  it("fails closed for missing, identity-mismatched, and stale-version screens", () => {
    const set = registry();
    expect(validateProductSafetyScreenV2(set, undefined).status).toBe("missing");
    expect(validateProductSafetyScreenV2(set, screen({ masterDrugId: "OTHER" })).status).toBe("identity_mismatch");
    expect(validateProductSafetyScreenV2(set, screen({ reviewSetId: "OTHER-SET" })).status).toBe("identity_mismatch");
    expect(validateProductSafetyScreenV2(set, screen({ reviewSetVersion: "2025" })).status).toBe("version_mismatch");
  });

  it("rejects duplicate and unknown criterion identities", () => {
    const set = registry();
    const base = screen();
    const duplicate = base.responses[0]!;
    const withDuplicate = validateProductSafetyScreenV2(set, {
      ...base,
      responses: [...base.responses, duplicate],
    });
    expect(withDuplicate.status).toBe("invalid");
    expect(withDuplicate.duplicateCriterionIds).toEqual([duplicate.criterionId]);

    const withUnknown = validateProductSafetyScreenV2(set, {
      ...base,
      responses: [...base.responses, { criterionId: "wegovy.fabricated", state: "absent" }],
    });
    expect(withUnknown.status).toBe("invalid");
    expect(withUnknown.unknownCriterionIds).toEqual(["wegovy.fabricated"]);
  });

  it("treats missing or unknown reviewed answers as incomplete and never as absent", () => {
    const set = registry();
    const base = screen();
    const missingId = base.responses[0]!.criterionId;
    const missing = validateProductSafetyScreenV2(set, {
      ...base,
      responses: base.responses.slice(1),
    });
    expect(missing.status).toBe("incomplete");
    expect(missing.missingCriterionIds).toContain(missingId);

    const unresolvedId = base.responses[1]!.criterionId;
    const unresolved = validateProductSafetyScreenV2(set, {
      ...base,
      responses: base.responses.map((response) =>
        response.criterionId === unresolvedId ? { ...response, state: "unknown" } : response),
    });
    expect(unresolved.status).toBe("incomplete");
    expect(unresolved.missingCriterionIds).toContain(unresolvedId);
  });

  it("reports transport completeness and present risks without granting clearance or execution", () => {
    const set = registry();
    const allAbsent = validateProductSafetyScreenV2(set, screen());
    expect(allAbsent).toEqual({
      status: "complete",
      missingCriterionIds: [],
      unknownCriterionIds: [],
      duplicateCriterionIds: [],
      riskCriterionIds: [],
    });

    const base = screen();
    const presentId = base.responses[2]!.criterionId;
    const withRisk = validateProductSafetyScreenV2(set, {
      ...base,
      responses: base.responses.map((response) =>
        response.criterionId === presentId ? { ...response, state: "present" } : response),
    });
    expect(withRisk.status).toBe("complete");
    expect(withRisk.riskCriterionIds).toEqual([presentId]);
  });
});
