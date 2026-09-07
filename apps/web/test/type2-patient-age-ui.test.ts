import { describe, expect, it } from "vitest";
import type { PatientHandoffRecord, PatientLongitudinalSummary } from "@glymize/contracts";
import {
  type2AgeYearsFromDateOfBirth,
  type2PatientAgeDraftFromPatientData,
  type2PatientAgeFromDraft,
} from "../app/type-2/type2-patient-age-ui";

function handoff(age: number | undefined, verification: "confirmed" | "unverified" = "confirmed") {
  return {
    id: "handoff-1",
    patientCodeKind: "file_number",
    patientCodeDisplay: "••01",
    status: "ready_for_physician",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    revision: 1,
    demographics: age === undefined ? undefined : { reportedAgeYears: age },
    patientFieldProvenance: age === undefined ? undefined : {
      reportedAgeYears: {
        sourceKind: "manual",
        verification,
      },
    },
    vitals: {},
    clinicalFlags: {},
    labs: [],
    medications: [],
  } satisfies PatientHandoffRecord;
}

function patient(dateOfBirth: string): PatientLongitudinalSummary {
  return {
    patientId: "patient-1",
    status: "active",
    demographics: { dateOfBirth },
    identifiers: [],
  };
}

describe("Type 2 DOB-first age model", () => {
  it("calculates age deterministically across the birthday boundary", () => {
    expect(type2AgeYearsFromDateOfBirth("2000-09-08", new Date(2026, 8, 7, 12))).toBe(25);
    expect(type2AgeYearsFromDateOfBirth("2000-09-08", new Date(2026, 8, 8, 12))).toBe(26);
  });

  it("rejects invalid and future dates instead of fabricating age", () => {
    expect(type2AgeYearsFromDateOfBirth("2026-02-31", new Date(2026, 8, 7, 12))).toBeUndefined();
    expect(type2AgeYearsFromDateOfBirth("2027-01-01", new Date(2026, 8, 7, 12))).toBeUndefined();
  });

  it("prefers longitudinal DOB over a confirmed encounter-reported age", () => {
    const draft = type2PatientAgeDraftFromPatientData(handoff(65), patient("1986-09-07"));
    expect(type2PatientAgeFromDraft(draft, new Date(2026, 8, 7, 12))).toEqual({
      ageYears: 40,
      source: "date_of_birth",
    });
  });

  it("uses reported age only when provenance is explicitly confirmed", () => {
    const confirmed = type2PatientAgeDraftFromPatientData(handoff(52));
    const unverified = type2PatientAgeDraftFromPatientData(handoff(52, "unverified"));

    expect(type2PatientAgeFromDraft(confirmed, new Date(2026, 8, 7, 12))).toEqual({
      ageYears: 52,
      source: "confirmed_reported_age",
    });
    expect(type2PatientAgeFromDraft(unverified, new Date(2026, 8, 7, 12))).toEqual({
      ageYears: undefined,
      source: "unknown",
    });
    expect(unverified.dateOfBirth).toBe("");
  });
});
