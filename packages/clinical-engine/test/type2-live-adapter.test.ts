import { describe, expect, it } from "vitest";
import type {
  GenericMedication,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  Type2ConsiderationRequest,
} from "@glymize/contracts";
import {
  buildType2AssessmentFromDecisionGraph,
  buildType2DecisionGraphRequest,
  mapDecisionGraphResultToType2Assessment,
  runDecisionGraphV2,
} from "../src/index.js";

const masterRegistry: MasterDrugRegistryEntry[] = [
  {
    id: "WD-METF",
    canonicalName: "Metformin",
    persianName: "متفورمین",
    combination: false,
    therapeuticAreas: ["Type 2 diabetes"],
    drugClass: "Biguanide",
    primaryIndications: ["Type 2 diabetes"],
    guidelineRole: "High-efficacy first-line agent",
    diabetesOrPhenotype: "T2D",
    clinicalEffects: [
      { domain: "glycemic_control", direction: "benefit", evidenceStrength: "guideline_recommended" },
    ],
    safetyMonitoring: "Renal function monitoring",
    sourceCodes: ["ADA-2026"],
    sourceUrls: ["https://diabetes.test/ada-2026"],
    reviewState: "approved",
  },
  {
    id: "WD-EMPA",
    canonicalName: "Empagliflozin",
    persianName: "امپاگلیفلوزین",
    combination: false,
    therapeuticAreas: ["Type 2 diabetes"],
    drugClass: "SGLT2 inhibitor",
    primaryIndications: ["Type 2 diabetes"],
    guidelineRole: "High-efficacy agent with organ protection",
    diabetesOrPhenotype: "T2D",
    clinicalEffects: [
      { domain: "glycemic_control", direction: "benefit", evidenceStrength: "guideline_recommended" },
      { domain: "heart_failure", direction: "strong_benefit", evidenceStrength: "outcome_evidence" },
      { domain: "ckd", direction: "benefit", evidenceStrength: "outcome_evidence" },
    ],
    sourceCodes: ["ADA-2026"],
    sourceUrls: ["https://diabetes.test/ada-2026"],
    reviewState: "approved",
  },
];

const marketProducts: IranMarketDrugProduct[] = [
  {
    id: "P-METF",
    masterDrugId: "WD-METF",
    genericName: "Metformin",
    dosageForm: "tablet",
    strengthPresentation: "500 mg",
    route: "oral",
    licenseStatus: "valid",
    insuranceCoverages: [],
    sourceUrl: "https://nfi.test/metformin",
    sourceReference: "NFI",
    observedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "P-EMPA",
    masterDrugId: "WD-EMPA",
    genericName: "Empagliflozin",
    dosageForm: "tablet",
    strengthPresentation: "10 mg",
    route: "oral",
    licenseStatus: "valid",
    insuranceCoverages: [{ provider: "health_insurance", percent: 90 }],
    sourceUrl: "https://nfi.test/empagliflozin",
    sourceReference: "NFI",
    observedAt: "2026-09-01T00:00:00.000Z",
  },
];

const medications: GenericMedication[] = [
  {
    id: "met-g",
    canonicalName: "Metformin",
    persianName: "متفورمین",
    className: "Biguanide",
    therapyGroup: "oral_glucose_lowering",
    administrationRoute: "oral",
    masterRegistryId: "WD-METF",
  },
  {
    id: "empa-g",
    canonicalName: "Empagliflozin",
    persianName: "امپاگلیفلوزین",
    className: "SGLT2 inhibitor",
    therapyGroup: "oral_glucose_lowering",
    administrationRoute: "oral",
    masterRegistryId: "WD-EMPA",
  },
];

function request(overrides: Partial<Type2ConsiderationRequest> = {}): Type2ConsiderationRequest {
  return {
    currentHba1c: 9,
    targetHba1c: 7,
    workflow: "intensification",
    costPreference: "no_constraint",
    factors: [],
    ...overrides,
  };
}

describe("type2 live adapter (Phase 3 / Task 2)", () => {
  it("maps the live request onto the decision-graph request contract", () => {
    const graphRequest = buildType2DecisionGraphRequest({
      request: request({
        eGfr: 55,
        routePreference: "oral_and_injectable",
        costPreference: "low_cost_only",
        factors: ["heart_failure", "hypoglycemia_risk"],
      }),
      masterRegistry,
      marketProducts,
    });

    expect(graphRequest.patient.glycemia).toMatchObject({ currentHba1c: 9, targetHba1c: 7 });
    expect(graphRequest.patient.kidney?.eGfr).toBe(55);
    expect(graphRequest.patient.cardiovascular?.heartFailure).toBe(true);
    expect(graphRequest.patient.hypoglycemiaRisk).toBe("high");
    expect(graphRequest.preferences.routePreference).toBe("oral_or_injectable");
    expect(graphRequest.preferences.costPreference).toBe("low_cost");
    expect(graphRequest.inventory.knowledge.length).toBeGreaterThanOrEqual(2);
    expect(graphRequest.inventory.knowledge.every((entry) => entry.engineState === "approved")).toBe(true);
    expect(graphRequest.inventory.marketProducts.length).toBe(2);
  });

  it("produces the live response contract from the validated graph engine", () => {
    const assessment = buildType2AssessmentFromDecisionGraph({
      request: request(),
      medications,
      masterRegistry,
      marketProducts,
    });

    expect(assessment.recommendation.hba1cGap).toBeCloseTo(2, 5);
    expect(assessment.recommendation.urgentReview).toBe(false);
    expect(assessment.medications.length).toBeGreaterThan(0);
    const metformin = assessment.medications.find((item) => item.genericMedicationId === "met-g");
    expect(metformin).toBeDefined();
    expect(metformin?.priorityTier === "recommended" || metformin?.priorityTier === "preferred").toBe(true);
  });

  it("keeps the maintain pathway and urgent review semantics", () => {
    const maintained = buildType2AssessmentFromDecisionGraph({
      request: request({ currentHba1c: 7.2, targetHba1c: 7 }),
      medications,
      masterRegistry,
      marketProducts,
    });
    expect(maintained.recommendation.priority).toBe("maintain_and_monitor");

    const urgent = buildType2AssessmentFromDecisionGraph({
      request: request({ currentHba1c: 13, targetHba1c: 7, catabolicFeatures: true, hyperglycemiaSymptoms: true }),
      medications,
      masterRegistry,
      marketProducts,
    });
    expect(urgent.recommendation.urgentReview).toBe(true);
  });

  it("serves exactly one engine path: the adapter equals the direct graph mapping", () => {
    const liveRequest = request();
    const graphRequest = buildType2DecisionGraphRequest({
      request: liveRequest,
      masterRegistry,
      marketProducts,
    });
    const direct = mapDecisionGraphResultToType2Assessment({
      result: runDecisionGraphV2(graphRequest),
      medications,
      request: liveRequest,
    });
    const viaLiveEntry = buildType2AssessmentFromDecisionGraph({
      request: liveRequest,
      medications,
      masterRegistry,
      marketProducts,
    });
    expect(viaLiveEntry).toEqual(direct);
  });
});
