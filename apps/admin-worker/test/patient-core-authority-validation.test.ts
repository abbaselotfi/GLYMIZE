import { describe, expect, it } from "vitest";
import {
  parsePatientCoreAllergyMutation,
  parsePatientCoreCollectionReconciliation,
  parsePatientCoreProblemMutation,
} from "../src/patient-core/authority-validation";

const source = {
  sourceType: "patient_record_v2" as const,
  recordType: "patient_core_manual_entry",
  recordId: "entry-1",
};

function allergy(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    displayName: "Penicillin",
    category: "medication",
    status: "active",
    criticality: "high",
    verification: "unverified",
    source,
    ...overrides,
  };
}

function problem(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    displayName: "Chronic kidney disease",
    status: "active",
    verification: "unverified",
    source,
    ...overrides,
  };
}

describe("R28-06 Option A authority input validation", () => {
  it("accepts unverified patient-reported candidates without promotion", () => {
    const parsed = parsePatientCoreAllergyMutation(allergy({
      verification: "unverified",
      source: {
        sourceType: "patient_reported",
        recordType: "patient_report",
        recordId: "report-1",
      },
    }));
    expect(parsed.verification).toBe("unverified");
    expect(parsed.source.sourceType).toBe("patient_reported");
  });

  it("requires an explicit clinician verification intent before a fact can be verified", () => {
    expect(() =>
      parsePatientCoreProblemMutation(problem({ verification: "verified" })),
    ).toThrow("PATIENT_CORE_AUTHORITY_INPUT_INVALID");

    expect(parsePatientCoreProblemMutation(problem({
      verification: "verified",
      verificationIntent: "direct_clinician_entry",
    })).verification).toBe("verified");
  });

  it("never allows a derived projection to be promoted directly to verified authority", () => {
    expect(() =>
      parsePatientCoreAllergyMutation(allergy({
        verification: "verified",
        verificationIntent: "clinician_review_of_external_source",
        source: {
          sourceType: "derived_projection",
          recordType: "ai_candidate",
          recordId: "candidate-1",
        },
      })),
    ).toThrow("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  });

  it("requires factId and expectedRevision together for optimistic revisions", () => {
    expect(() => parsePatientCoreProblemMutation(problem({ factId: "problem-1" })))
      .toThrow("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
    expect(() => parsePatientCoreProblemMutation(problem({ expectedRevision: 1 })))
      .toThrow("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
    expect(parsePatientCoreProblemMutation(problem({
      factId: "problem-1",
      expectedRevision: 1,
    }))).toMatchObject({ factId: "problem-1", expectedRevision: 1 });
  });

  it("validates explicit partial/complete collection reconciliation separately from fact writes", () => {
    expect(parsePatientCoreCollectionReconciliation({
      schemaVersion: 1,
      family: "allergy",
      completeness: "complete",
      source,
    })).toMatchObject({ family: "allergy", completeness: "complete" });

    expect(() => parsePatientCoreCollectionReconciliation({
      schemaVersion: 1,
      family: "allergy",
      completeness: "known_absent",
      source,
    })).toThrow("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  });

  it("bounds reactions and related-problem references", () => {
    expect(() => parsePatientCoreAllergyMutation(allergy({
      reactions: Array.from({ length: 21 }, () => ({ displayName: "rash" })),
    }))).toThrow("PATIENT_CORE_AUTHORITY_INPUT_INVALID");

    expect(() => parsePatientCoreProblemMutation(problem({
      relatedProblemFactIds: ["problem-2", "problem-2"],
    }))).toThrow("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  });
});
