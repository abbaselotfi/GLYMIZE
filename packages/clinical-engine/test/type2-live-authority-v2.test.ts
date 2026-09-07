import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { GenericMedication, IranMarketDrugProduct, MasterDrugRegistryEntry } from "@glymize/contracts";
import {
  TYPE2_DECISION_GRAPH_V2_AUTHORITY,
  buildType2Assessment,
  clearType2DecisionGraphRuntimeCatalogForTests,
  configureType2DecisionGraphRuntimeCatalog,
} from "../src/index-runtime.js";
import { buildType2TreatmentScenarios } from "../src/scenario-engine-safe.js";
import { WORLD_DRUG_CONTEXT_REVIEW_V1 } from "../src/type2-worlddrug-recommendation-compat.js";

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
  it("keeps Decision Graph as executable authority while allowing unranked WorldDrug review options", () => {
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

    const executable = result.medications.filter((item) => item.outputStatus !== "requires_approved_protocol");
    const reviewOnly = result.medications.filter((item) => item.outputStatus === "requires_approved_protocol");
    expect(executable.every((item) => item.sourceReference.includes(TYPE2_DECISION_GRAPH_V2_AUTHORITY))).toBe(true);
    expect(reviewOnly.length).toBeGreaterThan(0);
    expect(reviewOnly.every((item) => item.sourceReference.includes(WORLD_DRUG_CONTEXT_REVIEW_V1))).toBe(true);
    expect(reviewOnly.every((item) => (item as { decisionGraphRank?: number }).decisionGraphRank === undefined)).toBe(true);
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

  it("keeps direct legacy medication scoring outside physician-facing assessment routes", () => {
    const runtimeSource = readFileSync(new URL("../src/type2-decision-graph-runtime.ts", import.meta.url), "utf8");
    const webApiSource = readFileSync(new URL("../../../apps/web/lib/api-client.ts", import.meta.url), "utf8");
    const nestCatalogSource = readFileSync(new URL("../../../apps/api/src/catalog/catalog.service.ts", import.meta.url), "utf8");

    expect(runtimeSource.match(/buildLegacyType2Assessment\(/g)).toHaveLength(1);
    const runtimeFallback = runtimeSource.indexOf("if (!runtimeCatalog?.masterRegistry.length)");
    const legacyAssessment = runtimeSource.indexOf("buildLegacyType2Assessment(", runtimeFallback);
    const configuredGraphPath = runtimeSource.indexOf("buildType2AssessmentWithWorldDrugCoverageV2(", runtimeFallback);
    expect(runtimeFallback).toBeGreaterThanOrEqual(0);
    expect(legacyAssessment).toBeGreaterThan(runtimeFallback);
    expect(configuredGraphPath).toBeGreaterThan(legacyAssessment);
    expect(runtimeSource.slice(runtimeFallback, configuredGraphPath)).toContain("filterHardExcludedLegacyType2Assessment(");

    const browserPreview = webApiSource.indexOf('pathname === "/v1/admin/preview/type-2-considerations"');
    const browserDirectLegacy = webApiSource.indexOf("buildType2MedicationConsiderations(", browserPreview);
    const browserPhysicianPost = webApiSource.indexOf('pathname === "/v1/catalog/type-2/considerations"');
    expect(browserPreview).toBeGreaterThanOrEqual(0);
    expect(browserDirectLegacy).toBeGreaterThan(browserPreview);
    expect(browserDirectLegacy).toBeLessThan(browserPhysicianPost);
    expect(webApiSource.slice(browserPhysicianPost, browserPhysicianPost + 250)).toContain("type2Assessment(");
    expect(webApiSource.slice(browserPhysicianPost, browserPhysicianPost + 250)).not.toContain("buildType2MedicationConsiderations(");

    const nestMainAssessment = nestCatalogSource.indexOf("listType2MedicationConsiderations(");
    const nestPreview = nestCatalogSource.indexOf("listType2PreviewConsiderations(");
    expect(nestMainAssessment).toBeGreaterThanOrEqual(0);
    expect(nestPreview).toBeGreaterThan(nestMainAssessment);
    expect(nestCatalogSource.slice(nestMainAssessment, nestPreview)).toContain("buildType2Assessment(");
    expect(nestCatalogSource.slice(nestMainAssessment, nestPreview)).not.toContain("buildType2MedicationConsiderations(");
    expect(nestCatalogSource.slice(nestPreview, nestPreview + 300)).toContain("buildType2MedicationConsiderations(");
  });
});