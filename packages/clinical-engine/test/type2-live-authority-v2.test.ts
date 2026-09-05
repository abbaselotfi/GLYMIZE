import { afterEach, describe, expect, it } from "vitest";
import type { GenericMedication, IranMarketDrugProduct, MasterDrugRegistryEntry } from "@glymize/contracts";
import {
  TYPE2_DECISION_GRAPH_V2_AUTHORITY,
  buildType2Assessment,
  clearType2DecisionGraphRuntimeCatalogForTests,
  configureType2DecisionGraphRuntimeCatalog,
} from "../src/index-runtime.js";
import { buildType2TreatmentScenarios } from "../src/scenario-engine-safe.js";

const master: MasterDrugRegistryEntry = {
  id: "WD-LIVE-1",
  canonicalName: "Testformin",
  persianName: "تست‌فورمین",
  combination: false,
  therapeuticAreas: ["Diabetes"],
  drugClass: "Biguanide",
  primaryIndications: ["Type 2 diabetes"],
  guidelineRole: "High efficacy glucose lowering",
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
  id: "nfi-live-1",
  masterDrugId: master.id,
  genericName: master.canonicalName,
  dosageForm: "Tablet",
  strengthPresentation: "500 mg",
  route: "oral",
  packagePresentation: "30 tablets",
  licenseStatus: "Active",
  licenseValidUntilJalali: "1405/12/29",
  price: { amountToman: 100_000, priceKind: "consumer_retail" },
  insuranceCoverages: [],
  sourceUrl: "https://example.test/nfi",
  sourceReference: "NFI test fixture",
  observedAt: "2026-09-01T00:00:00.000Z",
  matchConfidence: 100,
};

afterEach(() => clearType2DecisionGraphRuntimeCatalogForTests());

describe("live Type 2 authority", () => {
  it("uses Decision Graph v2 when the browser runtime catalogue is configured", () => {
    configureType2DecisionGraphRuntimeCatalog({ masterRegistry: [master], marketProducts: [marketProduct] });
    const result = buildType2Assessment([medication], {
      currentHba1c: 8.4,
      targetHba1c: 7,
      factors: [],
      costPreference: "no_constraint",
      routePreference: "oral_and_injectable",
    });

    expect(result.recommendation.sourceReference).toContain(TYPE2_DECISION_GRAPH_V2_AUTHORITY);
    expect(result.medications.every((item) => item.priorityScore === 0)).toBe(true);
    expect(result.medications.every((item) => item.sourceReference.includes(TYPE2_DECISION_GRAPH_V2_AUTHORITY))).toBe(true);
  });

  it("preserves graph rank in the scenario adapter instead of invoking legacy aggregate-score ordering", () => {
    configureType2DecisionGraphRuntimeCatalog({ masterRegistry: [master], marketProducts: [marketProduct] });
    const request = {
      currentHba1c: 8.4,
      targetHba1c: 7,
      factors: [] as const,
      costPreference: "no_constraint" as const,
      routePreference: "oral_and_injectable" as const,
    };
    const assessment = buildType2Assessment([medication], request);
    const scenarios = buildType2TreatmentScenarios({ assessment, request });

    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios[0]?.rationaleEn.join(" ")).toContain(TYPE2_DECISION_GRAPH_V2_AUTHORITY);
  });

  it("keeps the retired builder only as an explicit unconfigured compatibility fallback", () => {
    clearType2DecisionGraphRuntimeCatalogForTests();
    const result = buildType2Assessment([medication], {
      currentHba1c: 8.4,
      targetHba1c: 7,
      factors: [],
    });
    expect(result.recommendation.sourceReference).not.toContain(TYPE2_DECISION_GRAPH_V2_AUTHORITY);
  });
});
