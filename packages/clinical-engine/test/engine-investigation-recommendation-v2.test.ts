import { afterEach, describe, expect, it } from "vitest";
import type {
  GenericMedication,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  Type2ConsiderationRequest,
} from "@glymize/contracts";
import {
  activateApprovedClinicalRulePack,
  buildType2Assessment,
  clearType2DecisionGraphRuntimeCatalogForTests,
  configureType2DecisionGraphRuntimeCatalog,
  getActiveClinicalRulePack,
  resetClinicalRulePackForTests,
} from "../src/index-runtime.js";
import { resolveEngineInvestigationRecommendations } from "../src/investigation-recommendations.js";

const master: MasterDrugRegistryEntry = {
  id: "WD-INVESTIGATION-TEST-1",
  canonicalName: "Testformin",
  combination: false,
  therapeuticAreas: ["Diabetes"],
  drugClass: "Biguanide",
  primaryIndications: ["Type 2 diabetes"],
  guidelineRole: "Glucose lowering",
  diabetesOrPhenotype: "T2D",
  clinicalEffects: [
    {
      domain: "glycemic_control",
      direction: "benefit",
      evidenceStrength: "guideline_recommended",
    },
  ],
  sourceCodes: ["ADA9-2026"],
  sourceUrls: ["https://example.test/ada"],
  reviewState: "approved",
};

const medication: GenericMedication = {
  id: "generic-testformin",
  canonicalName: "Testformin",
  persianName: "تست‌فورمین",
  className: "Biguanide",
  therapyGroup: "oral_glucose_lowering",
  administrationRoute: "oral",
  masterRegistryId: master.id,
};

const marketProduct: IranMarketDrugProduct = {
  id: "nfi-investigation-test-1",
  masterDrugId: master.id,
  genericName: master.canonicalName,
  dosageForm: "Tablet",
  strengthPresentation: "500 mg",
  route: "oral",
  packagePresentation: "30 tablets",
  licenseStatus: "Active",
  price: { amountToman: 100_000, priceKind: "consumer_retail" },
  insuranceCoverages: [],
  sourceUrl: "https://example.test/nfi",
  sourceReference: "NFI investigation fixture",
  observedAt: "2026-09-01T00:00:00.000Z",
  matchConfidence: 100,
};

function ckdRequest(eGfr?: number): Type2ConsiderationRequest {
  return {
    currentHba1c: 7.8,
    targetHba1c: 7,
    factors: ["ckd"],
    eGfr,
    clinicalContext: {
      kidney: {
        ckd: true,
        eGfr,
      },
    },
  };
}

function activateTestInvestigationRule() {
  const pack = getActiveClinicalRulePack();
  pack.version = "2026.09.test-investigation";
  pack.approvedAt = "2026-09-07";
  pack.approvedBy = "GLYMIZE investigation integration regression fixture";
  pack.rules.push({
    id: "TEST-CKD-INVESTIGATION-001",
    domain: "ckd",
    descriptionFa: "قاعده تست برای اثبات مرز پیشنهاد بررسی داده مفقود.",
    descriptionEn: "Regression-only rule proving the missing-data investigation boundary.",
    sourceIds: ["ada-2026"],
    engineEffect: "missing_data:investigation_recommendation",
    missingDataActions: [
      {
        kind: "request_investigation",
        requiredDataKey: "kidney.eGfr",
        investigationKey: "renal_function_panel",
        reasonCode: "test_ckd_missing_egfr",
        timing: "now",
        priority: "priority",
        blocksDecision: true,
        requiresFactor: "ckd",
      },
    ],
  });
  activateApprovedClinicalRulePack(pack);
}

afterEach(() => {
  clearType2DecisionGraphRuntimeCatalogForTests();
  resetClinicalRulePackForTests();
});

describe("REQUEST_INVESTIGATION authority boundary", () => {
  it("keeps the bundled approved production rule pack clinically inert until an investigation action is explicitly approved", () => {
    expect(resolveEngineInvestigationRecommendations(ckdRequest())).toEqual([]);
    expect(buildType2Assessment([medication], ckdRequest()).investigationRecommendations).toEqual([]);
  });

  it("projects an explicit approved missing-data action as a recommendation, never as an order", () => {
    activateTestInvestigationRule();

    const result = buildType2Assessment([medication], ckdRequest());

    expect(result.investigationRecommendations).toEqual([
      {
        action: "REQUEST_INVESTIGATION",
        investigationKey: "renal_function_panel",
        requiredDataKey: "kidney.eGfr",
        reasonCode: "test_ckd_missing_egfr",
        timing: "now",
        priority: "priority",
        blocksDecision: true,
        ruleId: "TEST-CKD-INVESTIGATION-001",
        rulePackVersion: "2026.09.test-investigation",
        sourceIds: ["ada-2026"],
      },
    ]);
    expect(result.investigationRecommendations[0]).not.toHaveProperty("id");
    expect(result.investigationRecommendations[0]).not.toHaveProperty("status");
  });

  it("does not request an investigation when the required datum is already present", () => {
    activateTestInvestigationRule();

    expect(buildType2Assessment([medication], ckdRequest(52)).investigationRecommendations).toEqual([]);
  });

  it("does not request an investigation when the rule's explicit clinical factor is absent", () => {
    activateTestInvestigationRule();
    const request: Type2ConsiderationRequest = {
      currentHba1c: 7.8,
      targetHba1c: 7,
      factors: [],
    };

    expect(buildType2Assessment([medication], request).investigationRecommendations).toEqual([]);
  });

  it("keeps the same approved recommendation channel on the configured Decision Graph runtime", () => {
    activateTestInvestigationRule();
    configureType2DecisionGraphRuntimeCatalog({
      masterRegistry: [master],
      marketProducts: [marketProduct],
    });

    const result = buildType2Assessment([medication], ckdRequest());

    expect(result.investigationRecommendations).toHaveLength(1);
    expect(result.investigationRecommendations[0]).toMatchObject({
      action: "REQUEST_INVESTIGATION",
      ruleId: "TEST-CKD-INVESTIGATION-001",
      requiredDataKey: "kidney.eGfr",
    });
  });
});
