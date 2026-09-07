import { describe, expect, it } from "vitest";
import { projectReviewedWegovySafetyForDecisionGraphV2 } from "../src/decision-graph-v2/product-safety-binding.js";
import { buildReviewedProductSafetyRegistryV2 } from "../src/decision-graph-v2/product-safety-registry.js";
import type { ProductSpecificSafetyScreenV2 } from "../src/decision-graph-v2/product-safety-screen.js";
import type {
  DecisionGraphInventoryV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
} from "../src/decision-graph-v2/types.js";
import {
  buildType2DecisionGraphLiveRequestV2,
  type BuildType2DecisionGraphAssessmentInput,
} from "../src/type2-decision-graph-compat.js";

const masterDrugId = "LIVE-SEMAGLUTIDE-SC";

const knowledge: KnowledgeMedicationV2 = {
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

const wegovy: IranMarketProductV2 = {
  productId: "LIVE-WEGOVY-2_4",
  masterDrugId,
  nfiMatchState: "verified",
  genericName: "Semaglutide",
  brandName: "WEGOVY",
  dosageFormGroup: "injection_pen",
  route: "subcutaneous",
  consumptionUnit: "pen",
  strengthComponents: [{ ingredientKey: masterDrugId, amount: 2.4, unit: "mg" }],
  consumptionUnitsPerPurchaseUnit: 4,
  purchaseUnitLabel: "box",
  license: { everValid: true, currentValid: true, revoked: false },
  marketPresence: "confirmed_active",
  observedAt: "2026-09-07",
};

const inventory: DecisionGraphInventoryV2 = {
  knowledge: [knowledge],
  marketProducts: [wegovy],
  doseRules: [],
  insurancePolicies: [],
};

function screen(patch: Partial<ProductSpecificSafetyScreenV2> = {}): ProductSpecificSafetyScreenV2 {
  const reviewSet = buildReviewedProductSafetyRegistryV2(inventory)[0]!;
  return {
    masterDrugId: reviewSet.masterDrugId,
    reviewSetId: reviewSet.reviewSetId,
    reviewSetVersion: reviewSet.reviewSetVersion,
    responses: reviewSet.criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      state: "absent" as const,
    })),
    ...patch,
  };
}

function input(productSafetyScreens?: ProductSpecificSafetyScreenV2[]): BuildType2DecisionGraphAssessmentInput {
  return {
    medications: [],
    masterRegistry: [],
    marketProducts: [],
    request: {
      currentHba1c: 7,
      targetHba1c: 7,
      factors: ["masld_mash"],
      clinicalContext: {
        medicationSafety: {
          maoiUseOrRecentExposure: true,
          substantialAlcoholUse: false,
        },
        productSafetyScreens,
        liver: {
          masldMash: true,
          fibrosisStage: "F3",
          cirrhosis: false,
          decompensatedCirrhosis: false,
        },
      },
    },
  };
}

describe("live Type 2 product-safety convergence", () => {
  it("preserves generic medication safety and the exact versioned product-safety envelope at the live compat boundary", () => {
    const submitted = screen();
    const graphRequest = buildType2DecisionGraphLiveRequestV2(input([submitted]), inventory);

    expect(graphRequest.patient.medicationSafety).toEqual({
      maoiUseOrRecentExposure: true,
      substantialAlcoholUse: false,
    });
    expect(graphRequest.patient.productSafetyScreens).toEqual([submitted]);

    const projected = projectReviewedWegovySafetyForDecisionGraphV2({
      inventory,
      patient: graphRequest.patient,
    });

    expect(projected.binding.status).toBe("bound");
    expect(projected.patient.medicationSafety).toMatchObject({
      maoiUseOrRecentExposure: true,
      substantialAlcoholUse: false,
      personalOrFamilyHistoryMtc: false,
      men2: false,
      priorSeriousSemaglutideHypersensitivity: false,
      severeGastroparesis: false,
      suspectedAcutePancreatitis: false,
    });
    expect("productSafetyScreens" in projected.patient).toBe(false);
  });

  it("keeps a stale live envelope fail-closed instead of converting request presence into WEGOVY clearance", () => {
    const stale = screen({ reviewSetVersion: "2025" });
    const graphRequest = buildType2DecisionGraphLiveRequestV2(input([stale]), inventory);
    const projected = projectReviewedWegovySafetyForDecisionGraphV2({
      inventory,
      patient: graphRequest.patient,
    });

    expect(projected.binding.status).toBe("version_mismatch");
    expect(projected.patient.medicationSafety?.maoiUseOrRecentExposure).toBe(true);
    expect((projected.patient.medicationSafety as { personalOrFamilyHistoryMtc?: boolean })?.personalOrFamilyHistoryMtc).toBeUndefined();
  });
});
