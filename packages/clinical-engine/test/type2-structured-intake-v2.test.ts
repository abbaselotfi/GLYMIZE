import { describe, expect, it } from "vitest";
import {
  resolveDiabeticFootPathwayV2,
  resolveNutritionSupportBoundaryV2,
  resolvePregnancyDiabetesPathwayV2,
  resolveRetinopathySpecialistEscalationV2,
} from "../src/decision-graph-v2/index.js";
import {
  resolveType2ParallelSafetyProjectionV2,
  type2StructuredIntakeToDecisionGraphV2,
  type Type2StructuredConsiderationRequestV2,
} from "../src/type2-intake-v2.js";

const inventory = {
  knowledge: [],
  marketProducts: [],
  doseRules: [],
  insurancePolicies: [],
};

function request(
  patch: Partial<Type2StructuredConsiderationRequestV2> = {},
): Type2StructuredConsiderationRequestV2 {
  return {
    currentHba1c: 7.4,
    targetHba1c: 7,
    factors: [],
    routePreference: "oral_and_injectable",
    costPreference: "moderate",
    ...patch,
  };
}

describe("Type 2 structured intake v2", () => {
  it("maps core patient facts and presentation preferences without changing their meaning", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      factors: ["ckd", "hypoglycemia_risk"],
      clinicalContext: {
        ageYears: 64,
        sexAtBirth: "female",
        kidney: { ckd: true, eGfr: 42, creatinineClearanceMlMin: 37, uacrMgG: 220 },
        anthropometrics: { weightKg: 78, heightCm: 165, bmi: 28.7 },
        glycemia: { fastingPlasmaGlucoseMgDl: 132, twoHourPostprandialGlucoseMgDl: 181 },
      },
    }), inventory);

    expect(mapped.patient).toMatchObject({
      ageYears: 64,
      sexAtBirth: "female",
      hypoglycemiaRisk: "high",
      kidney: { ckd: true, eGfr: 42, creatinineClearanceMlMin: 37, uacrMgG: 220 },
      anthropometrics: { weightKg: 78, heightCm: 165, bmi: 28.7 },
      glycemia: {
        currentHba1c: 7.4,
        targetHba1c: 7,
        fastingPlasmaGlucoseMgDl: 132,
        twoHourPostprandialGlucoseMgDl: 181,
      },
    });
    expect(mapped.preferences).toEqual({ routePreference: "oral_or_injectable", costPreference: "moderate" });
  });

  it("does not convert the legacy diabetic-foot factor into an ulcer or infection phenotype", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({ factors: ["diabetic_foot"] }), inventory);
    expect(mapped.patient.diabeticFoot).toBeUndefined();
    expect(resolveDiabeticFootPathwayV2(mapped).state).toBe("no_foot_ulcer_context");
  });

  it("passes explicit diabetic-foot phenotype and preserves the uninfected-ulcer no-antibiotic invariant", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      factors: ["diabetic_foot"],
      clinicalContext: {
        diabeticFoot: { footUlcerPresent: true, clinicalInfectionPresent: false },
      },
    }), inventory);
    const result = resolveDiabeticFootPathwayV2(mapped);
    expect(result.state).toBe("uninfected_ulcer");
    expect(result.antibioticExecution).toBe(false);
    expect(result.antibioticBoundary).toBe("not_indicated_for_uninfected_ulcer");
  });

  it("passes explicit retinopathy grading without deriving it from a WorldDrug/domain selection", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      clinicalContext: {
        retinopathy: {
          diabeticRetinopathyPresent: true,
          severity: "moderate_npdr",
          diabeticMacularEdema: false,
        },
      },
    }), inventory);
    const result = resolveRetinopathySpecialistEscalationV2(mapped);
    expect(result.escalations).toEqual(expect.arrayContaining([
      expect.objectContaining({ lane: "retinopathy", specialty: "ophthalmology", urgency: "prompt" }),
    ]));
  });

  it("passes nutrition indication while keeping prescription execution disabled", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      clinicalContext: {
        nutritionSupport: { intent: "glycemic_benefit" },
      },
    }), inventory);
    const result = resolveNutritionSupportBoundaryV2(mapped);
    expect(result.state).toBe("glycemic_supplement_not_recommended");
    expect(result.supplementOrNutritionPrescriptionExecution).toBe(false);
  });

  it("allows a pregnancy checkbox to mark pregnancy but never invents diabetes type", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({ factors: ["pregnancy"] }), inventory);
    expect(mapped.patient.pregnancy).toBe(true);
    expect(mapped.patient.pregnancyCare).toBeUndefined();
    const result = resolvePregnancyDiabetesPathwayV2(mapped);
    expect(result.state).toBe("needs_diabetes_type");
    expect(result.autonomousInsulinDoseExecution).toBe(false);
  });

  it("passes explicit pregnancy type and pregnancy glucose targets into the dedicated lane", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      clinicalContext: {
        pregnancy: true,
        glycemia: { fastingPlasmaGlucoseMgDl: 99 },
        pregnancyCare: { diabetesType: "gdm", gestationalAgeWeeks: 28 },
      },
    }), inventory);
    const result = resolvePregnancyDiabetesPathwayV2(mapped);
    expect(result.state).toBe("gdm_lifestyle_then_insulin_if_needed");
    expect(result.glucoseAbovePregnancyTarget).toBe(true);
    expect(result.insulinPreferredOrRequired).toBe(true);
    expect(result.autonomousInsulinDoseExecution).toBe(false);
  });

  it("copies the clinician-confirmed painful-DPN phenotype without inferring diagnosis from neuropathy visibility", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      clinicalContext: {
        neuropathy: {
          diabeticPeripheralNeuropathyConfirmed: true,
          painfulSymptoms: true,
          atypicalFeaturesPresent: false,
        },
      },
    }), inventory);
    expect(mapped.patient.neuropathy).toEqual({
      diabeticPeripheralNeuropathyConfirmed: true,
      painfulSymptoms: true,
      atypicalFeaturesPresent: false,
    });
  });

  it("preserves current medication names for pregnancy medication reconciliation without fabricating dose identity", () => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({
      currentMedications: [{ genericName: "Metformin", status: "active", totalDailyDose: 1000, totalDailyDoseUnit: "mg" }],
      clinicalContext: { pregnancy: true, pregnancyCare: { diabetesType: "type2" } },
    }), inventory);
    expect(mapped.patient.currentMedications).toEqual([
      expect.objectContaining({ genericName: "Metformin", status: "active" }),
    ]);
    expect(mapped.patient.currentMedications?.[0]).not.toHaveProperty("dailyDose");
    const pregnancy = resolvePregnancyDiabetesPathwayV2(mapped);
    expect(pregnancy.medicationReviews.some((item) => item.medication === "Metformin")).toBe(true);
  });

  it.each([
    ["oral_only", "oral_only"],
    ["oral_and_injectable", "oral_or_injectable"],
  ] as const)("maps route preference %s to %s", (input, expected) => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({ routePreference: input }), inventory);
    expect(mapped.preferences.routePreference).toBe(expected);
  });

  it.each([
    ["no_constraint", "no_constraint"],
    ["moderate", "moderate"],
    ["low_cost_only", "low_cost"],
    ["insured_only", "insured_only"],
  ] as const)("maps cost preference %s to %s", (input, expected) => {
    const mapped = type2StructuredIntakeToDecisionGraphV2(request({ costPreference: input }), inventory);
    expect(mapped.preferences.costPreference).toBe(expected);
  });
});

describe("Type 2 parallel safety projection", () => {
  it("resolves all explicit specialist/safety contexts without medication ranking", () => {
    const projection = resolveType2ParallelSafetyProjectionV2(request({
      factors: ["pregnancy", "diabetic_foot"],
      clinicalContext: {
        pregnancy: true,
        glycemia: { fastingPlasmaGlucoseMgDl: 99 },
        pregnancyCare: { diabetesType: "type2", gestationalAgeWeeks: 20 },
        diabeticFoot: { footUlcerPresent: true, clinicalInfectionPresent: false },
        retinopathy: {
          diabeticRetinopathyPresent: true,
          severity: "moderate_npdr",
          diabeticMacularEdema: false,
        },
        nutritionSupport: { intent: "glycemic_benefit" },
      },
    }));

    expect(projection.retinopathy.escalations).toEqual(expect.arrayContaining([
      expect.objectContaining({ specialty: "ophthalmology", urgency: "prompt" }),
    ]));
    expect(projection.diabeticFoot).toMatchObject({
      state: "uninfected_ulcer",
      antibioticExecution: false,
      antibioticBoundary: "not_indicated_for_uninfected_ulcer",
    });
    expect(projection.nutritionSupport).toMatchObject({
      state: "glycemic_supplement_not_recommended",
      supplementOrNutritionPrescriptionExecution: false,
    });
    expect(projection.pregnancy).toMatchObject({
      state: "type2_insulin_preferred",
      insulinPreferredOrRequired: true,
      autonomousInsulinDoseExecution: false,
    });
    expect(projection).not.toHaveProperty("medications");
    expect(projection).not.toHaveProperty("candidates");
    expect(projection).not.toHaveProperty("ranking");
  });

  it("keeps broad legacy flags fail-closed when specialist phenotype is absent", () => {
    const projection = resolveType2ParallelSafetyProjectionV2(request({
      factors: ["pregnancy", "diabetic_foot"],
    }));
    expect(projection.diabeticFoot.state).toBe("no_foot_ulcer_context");
    expect(projection.diabeticFoot.antibioticExecution).toBe(false);
    expect(projection.pregnancy.state).toBe("needs_diabetes_type");
    expect(projection.pregnancy.autonomousInsulinDoseExecution).toBe(false);
    expect(projection.retinopathy.escalations).toHaveLength(0);
  });
});
