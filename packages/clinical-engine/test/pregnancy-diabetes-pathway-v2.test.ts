import { describe, expect, it } from "vitest";
import {
  resolvePregnancyDiabetesPathwayV2,
  runDecisionGraphV2WithSpecialistEscalations,
  type DecisionGraphRequestWithSpecialistContextsV2,
  type PregnancyDiabetesContextV2,
} from "../src/decision-graph-v2/index.js";

function request(
  pregnancy: boolean,
  pregnancyCare?: PregnancyDiabetesContextV2,
  overrides: Partial<DecisionGraphRequestWithSpecialistContextsV2["patient"]> = {},
): DecisionGraphRequestWithSpecialistContextsV2 {
  return {
    patient: {
      ageYears: 32,
      sexAtBirth: "female",
      pregnancy,
      glycemia: { currentHba1c: 6.4, targetHba1c: 7 },
      pregnancyCare,
      ...overrides,
    },
    preferences: { routePreference: "oral_or_injectable", costPreference: "no_constraint" },
    inventory: {
      knowledge: [],
      marketProducts: [],
      doseRules: [],
      insurancePolicies: [],
    },
  };
}

describe("ADA 2026 pregnancy diabetes safety pathway", () => {
  it("stays inactive outside pregnancy", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(false, { diabetesType: "type2" }));
    expect(result.state).toBe("not_pregnant");
    expect(result.targets).toBeNull();
    expect(result.autonomousInsulinDoseExecution).toBe(false);
  });

  it("requires explicit diabetes type before pregnancy treatment selection", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(true, { diabetesType: "unknown" }));
    expect(result.state).toBe("needs_diabetes_type");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "pregnancyCare.diabetesType",
        priority: "required",
        blocksFinalDecision: true,
      }),
    ]));
    expect(result.autonomousInsulinDoseExecution).toBe(false);
  });

  it("uses pregnancy-specific glycemic targets", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(true, { diabetesType: "type2" }));
    expect(result.targets).toEqual({
      fastingMgDlUpperExclusive: 95,
      oneHourPostprandialMgDlUpperExclusive: 140,
      twoHourPostprandialMgDlUpperExclusive: 120,
      idealA1cPercentUpperExclusive: 6,
      relaxedA1cPercentUpperExclusiveWhenNeededToPreventSignificantHypoglycemia: 7,
    });
  });

  it("marks insulin required for type 1 pregnancy without generating a dose", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(true, { diabetesType: "type1" }));
    expect(result.state).toBe("type1_insulin_required");
    expect(result.insulinPreferredOrRequired).toBe(true);
    expect(result.autonomousInsulinDoseExecution).toBe(false);
  });

  it("marks insulin preferred for type 2 pregnancy without reusing generic Type 2 ranking authority", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(true, { diabetesType: "type2" }));
    expect(result.state).toBe("type2_insulin_preferred");
    expect(result.insulinPreferredOrRequired).toBe(true);
    expect(result.actions.join(" ")).toContain("ordinary Type 2 noninsulin ranking");
    expect(result.autonomousInsulinDoseExecution).toBe(false);
  });

  it("allows GDM lifestyle-first when represented glucose values are within target", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(
      true,
      { diabetesType: "gdm" },
      { glycemia: { currentHba1c: 5.7, targetHba1c: 6, fastingPlasmaGlucoseMgDl: 90, twoHourPostprandialGlucoseMgDl: 115 } },
    ));
    expect(result.state).toBe("gdm_lifestyle_then_insulin_if_needed");
    expect(result.glucoseAbovePregnancyTarget).toBe(false);
    expect(result.insulinPreferredOrRequired).toBe(false);
  });

  it("escalates GDM to insulin review when represented glucose is above pregnancy target", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(
      true,
      { diabetesType: "gdm" },
      { glycemia: { currentHba1c: 6.1, targetHba1c: 6, fastingPlasmaGlucoseMgDl: 96 } },
    ));
    expect(result.glucoseAbovePregnancyTarget).toBe(true);
    expect(result.insulinPreferredOrRequired).toBe(true);
    expect(result.autonomousInsulinDoseExecution).toBe(false);
  });

  it("flags active metformin and glyburide as non-first-line without issuing automatic stop orders", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(
      true,
      { diabetesType: "type2" },
      {
        currentMedications: [
          { genericName: "metformin", therapyGroup: "biguanide", status: "active" },
          { genericName: "glyburide", therapyGroup: "sulfonylurea", status: "active" },
        ],
      },
    ));
    expect(result.medicationReviews).toHaveLength(2);
    expect(result.medicationReviews.every((item) => item.category === "metformin_or_glyburide_not_first_line")).toBe(true);
    expect(result.medicationReviews.every((item) => item.automaticStopOrder === false)).toBe(true);
  });

  it("flags other active noninsulin glucose-lowering therapy as not recommended in pregnancy", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(
      true,
      { diabetesType: "type2" },
      { currentMedications: [{ genericName: "empagliflozin", therapyGroup: "sglt2_inhibitor", status: "active" }] },
    ));
    expect(result.medicationReviews).toEqual(expect.arrayContaining([
      expect.objectContaining({
        medication: "empagliflozin",
        category: "other_noninsulin_glucose_lowering_not_recommended",
        automaticStopOrder: false,
      }),
    ]));
  });

  it("surfaces the PCOS metformin first-trimester discontinuation boundary without an automatic order", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(true, {
      diabetesType: "gdm",
      metforminForPcosOvulation: true,
    }));
    expect(result.medicationReviews).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "pcos_metformin_stop_by_end_first_trimester",
        automaticStopOrder: false,
      }),
    ]));
  });

  it("relaxes A1C counseling only when significant hypoglycemia prevents the tighter target", () => {
    const result = resolvePregnancyDiabetesPathwayV2(request(true, {
      diabetesType: "type1",
      significantHypoglycemiaPreventingTightTarget: true,
    }));
    expect(result.actions.join(" ")).toContain("<7%");
    expect(result.actions.join(" ")).toContain("<6%");
  });

  it("projects pregnancy care through a named parallel trace without becoming dose authority", () => {
    const result = runDecisionGraphV2WithSpecialistEscalations(request(true, { diabetesType: "type2" }));
    expect(result.pregnancyDiabetesPathway.state).toBe("type2_insulin_preferred");
    expect(result.pregnancyDiabetesPathway.autonomousInsulinDoseExecution).toBe(false);
    const pregnancyTrace = result.trace.find((item) => item.nodeId === "pregnancy-diabetes-safety-pathway");
    expect(pregnancyTrace).toBeDefined();
    expect(pregnancyTrace?.summary).toContain("autonomousInsulinDoseExecution=false");
  });
});
