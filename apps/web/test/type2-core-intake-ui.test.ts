import { describe, expect, it } from "vitest";
import {
  emptyType2CoreContextDraft,
  type2BmiFromCoreDraft,
  type2ClinicalContextFromActiveIntake,
} from "../app/type-2/type2-core-intake-ui";
import { emptyType2StructuredIntakeDraft } from "../app/type-2/type2-structured-intake-ui";

function context(patch: Partial<typeof emptyType2CoreContextDraft> = {}) {
  return { ...emptyType2CoreContextDraft, ...patch };
}

describe("active Type 2 core intake model", () => {
  it("carries explicit CrCl independently from eGFR", () => {
    const result = type2ClinicalContextFromActiveIntake({
      context: context({ eGfr: "58", creatinineClearanceMlMin: "41" }),
      structuredContext: { ...emptyType2StructuredIntakeDraft },
      factors: ["ckd"],
      worldDrugDomains: [],
    });

    expect(result.kidney?.eGfr).toBe(58);
    expect(result.kidney?.creatinineClearanceMlMin).toBe(41);
  });

  it("never infers CrCl from eGFR", () => {
    const result = type2ClinicalContextFromActiveIntake({
      context: context({ eGfr: "58" }),
      structuredContext: { ...emptyType2StructuredIntakeDraft },
      factors: ["ckd"],
      worldDrugDomains: [],
    });

    expect(result.kidney?.eGfr).toBe(58);
    expect(result.kidney?.creatinineClearanceMlMin).toBeUndefined();
  });

  it("calculates BMI only from explicit weight and height", () => {
    expect(type2BmiFromCoreDraft(context({ weight: "82", height: "173" }))).toBe(27.4);
    expect(type2BmiFromCoreDraft(context({ weight: "82" }))).toBeUndefined();
  });

  it("projects the explicit pregnancy factor without inventing pregnancy subtype", () => {
    const result = type2ClinicalContextFromActiveIntake({
      context: context(),
      structuredContext: { ...emptyType2StructuredIntakeDraft },
      factors: ["pregnancy"],
      worldDrugDomains: [],
    });

    expect(result.pregnancy).toBe(true);
    expect(result.pregnancyCare).toBeUndefined();
  });

  it("merges explicit hypertension BP without overwriting existing cardiovascular facts", () => {
    const result = type2ClinicalContextFromActiveIntake({
      context: context({ lvef: "35" }),
      structuredContext: {
        ...emptyType2StructuredIntakeDraft,
        systolicBloodPressure: "148",
        diastolicBloodPressure: "86",
      },
      factors: ["ascvd", "heart_failure"],
      worldDrugDomains: ["hypertension"],
    });

    expect(result.cardiovascular).toEqual(expect.objectContaining({
      ascvd: true,
      heartFailure: true,
      lvefPercent: 35,
      systolicBloodPressure: 148,
      diastolicBloodPressure: 86,
    }));
  });

  it("does not fabricate BP or NYHA data that the active draft leaves absent", () => {
    const result = type2ClinicalContextFromActiveIntake({
      context: context({ lvef: "35" }),
      structuredContext: { ...emptyType2StructuredIntakeDraft },
      factors: ["heart_failure"],
      worldDrugDomains: ["hypertension"],
    });

    expect(result.cardiovascular?.lvefPercent).toBe(35);
    expect(result.cardiovascular?.systolicBloodPressure).toBeUndefined();
    expect(result.cardiovascular?.diastolicBloodPressure).toBeUndefined();
    expect(result.cardiovascular?.nyhaClass).toBeUndefined();
  });

  it("projects DOB-derived age without allowing reported age to override it", () => {
    const result = type2ClinicalContextFromActiveIntake({
      context: context(),
      structuredContext: { ...emptyType2StructuredIntakeDraft },
      factors: [],
      worldDrugDomains: [],
      patientAge: { dateOfBirth: "2000-09-08", confirmedReportedAgeYears: 65 },
      ageAsOf: new Date(2026, 8, 7, 12),
    });

    expect(result.ageYears).toBe(25);
  });

});
