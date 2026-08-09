import { describe, expect, it } from "vitest";
import type { GenericMedication, Type2AssessmentResult, Type2ConsiderationRequest } from "@glymize/contracts";
import { buildType2Assessment } from "../src/index.js";
import { buildType2TreatmentScenarios } from "../src/scenario-engine.js";

const medicines: GenericMedication[] = [
  { id: "metformin", canonicalName: "Metformin", persianName: "متفورمین", className: "Biguanide", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
  { id: "sitagliptin", canonicalName: "Sitagliptin", persianName: "سیتاگلیپتین", className: "DPP-4 inhibitor", therapyGroup: "oral_glucose_lowering", administrationRoute: "oral" },
];

const clinicalRequest: Type2ConsiderationRequest = {
  currentHba1c: 8,
  targetHba1c: 7,
  factors: [],
  costPreference: "moderate",
  routePreference: "oral_and_injectable",
};

const insuredRequest: Type2ConsiderationRequest = {
  ...clinicalRequest,
  costPreference: "insured_only",
};

describe("selected insurance provider gate", () => {
  it("does not treat coverage by a different insurer as coverage for the selected insurer", () => {
    const base = buildType2Assessment(medicines, clinicalRequest);
    const assessment: Type2AssessmentResult = {
      ...base,
      medications: base.medications.map((item) => item.genericMedicationId === "metformin"
        ? { ...item, insuranceCoverages: [{ provider: "social_security", percent: 70 }] }
        : { ...item, insuranceCoverages: [{ provider: "health_insurance", percent: 90 }] }),
    };

    const result = buildType2TreatmentScenarios({ assessment, request: insuredRequest, insuranceProvider: "social_security" });
    const selected = result.flatMap((scenario) => scenario.medications);

    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((item) => item.genericMedicationId === "metformin")).toBe(true);
    expect(selected.every((item) => item.insuranceCoverages.some((coverage) => coverage.provider === "social_security" && coverage.percent > 0))).toBe(true);
  });
});
