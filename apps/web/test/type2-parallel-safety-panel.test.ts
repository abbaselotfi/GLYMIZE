import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Type2ParallelSafetyProjectionV2 } from "@glymize/clinical-engine/type2-intake-v2";
import { activeParallelSafetyCards } from "../app/type-2/type2-parallel-safety-panel";

function baseProjection(): Type2ParallelSafetyProjectionV2 {
  return {
    retinopathy: { escalations: [], missingData: [] },
    diabeticFoot: {
      state: "no_foot_ulcer_context",
      antibioticExecution: false,
      antibioticBoundary: "not_assessed",
      actions: [],
      escalations: [],
      missingData: [],
      evidence: [],
    },
    nutritionSupport: {
      state: "not_requested",
      supplementOrNutritionPrescriptionExecution: false,
      actions: [],
      missingData: [],
      evidence: [],
    },
    pregnancy: {
      state: "not_pregnant",
      insulinPreferredOrRequired: false,
      autonomousInsulinDoseExecution: false,
      targets: null,
      glucoseAbovePregnancyTarget: null,
      medicationReviews: [],
      actions: [],
      missingData: [],
      evidence: [],
    },
  };
}

describe("Type 2 parallel safety panel", () => {
  it("stays hidden when every parallel pathway is inactive", () => {
    expect(activeParallelSafetyCards(baseProjection(), "en")).toEqual([]);
  });

  it("renders prompt ophthalmology escalation outside medication ranking", () => {
    const projection = baseProjection();
    projection.retinopathy.escalations.push({
      id: "RETINOPATHY-ADA2026-PROMPT-OPHTHALMOLOGY",
      lane: "retinopathy",
      specialty: "ophthalmology",
      urgency: "prompt",
      triggers: ["moderate_npdr"],
      reason: "prompt ophthalmology referral",
      treatmentEvidenceNotes: [],
      evidence: [],
      clinicianActionRequired: true,
      autonomousMedicationExecution: false,
    });
    const cards = activeParallelSafetyCards(projection, "en");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "retinopathy", tone: "prompt", badge: "Prompt referral" });
    expect(cards[0]?.bullets).toContain("moderate NPDR");
  });

  it("preserves the no-antibiotic boundary for an uninfected ulcer", () => {
    const projection = baseProjection();
    projection.diabeticFoot.state = "uninfected_ulcer";
    projection.diabeticFoot.antibioticBoundary = "not_indicated_for_uninfected_ulcer";
    const card = activeParallelSafetyCards(projection, "en")[0];
    expect(card?.id).toBe("diabetic-foot");
    expect(card?.bullets.join(" ")).toContain("Do not use antibiotics solely");
  });

  it("shows pregnancy missing-data gating without inventing insulin execution", () => {
    const projection = baseProjection();
    projection.pregnancy.state = "needs_diabetes_type";
    projection.pregnancy.targets = {
      fastingMgDlUpperExclusive: 95,
      oneHourPostprandialMgDlUpperExclusive: 140,
      twoHourPostprandialMgDlUpperExclusive: 120,
      idealA1cPercentUpperExclusive: 6,
      relaxedA1cPercentUpperExclusiveWhenNeededToPreventSignificantHypoglycemia: 7,
    };
    projection.pregnancy.missingData.push({
      key: "pregnancyCare.diabetesType",
      priority: "required",
      blocksFinalDecision: true,
      reason: "required",
      evidence: [],
    });
    const card = activeParallelSafetyCards(projection, "en")[0];
    expect(card).toMatchObject({ id: "pregnancy", tone: "review", badge: "Needs data" });
    expect(card?.missingKeys).toContain("pregnancyCare.diabetesType");
  });

  it("keeps the component free of scenario ranking and dose-selection code", () => {
    const source = readFileSync(fileURLToPath(new URL("../app/type-2/type2-parallel-safety-panel.tsx", import.meta.url)), "utf8");
    expect(source).not.toContain("priorityScore");
    expect(source).not.toContain("scenario.rank");
    expect(source).not.toContain("buildType2TreatmentScenarios");
    expect(source).toContain('data-parallel-safety="true"');
  });

  it("wires the API projection above the treatment scenario stack", () => {
    const source = readFileSync(fileURLToPath(new URL("../app/type-2/type2-scenarios-client.tsx", import.meta.url)), "utf8");
    const panel = source.indexOf("<Type2ParallelSafetyPanel projection={assessment.parallelSafety} locale={locale} />");
    const stack = source.indexOf("<div className={styles.scenarioStack}>");
    expect(source).toContain("Type2AssessmentWithParallelSafety");
    expect(source).toContain("as Type2AssessmentWithParallelSafety");
    expect(panel).toBeGreaterThan(-1);
    expect(stack).toBeGreaterThan(panel);
  });
});
