import { describe, expect, it } from "vitest";
import {
  completenessFromPatientCoreDiagnostics,
  validatePatientCoreCollectionDiagnostics,
} from "../src/patient-core/projection-coverage";

const base = {
  sourceScope: "latest_snapshot_revision_per_encounter",
  sourceRowCount: 4,
  eligibleCount: 2,
  includedCount: 2,
  intentionallyExcludedCount: 2,
  invalidSkippedCount: 0,
  truncatedCount: 0,
  exclusions: [
    { reason: "raw_namespace" as const, count: 1 },
    { reason: "rejected" as const, count: 1 },
  ],
};

describe("Patient Core projection coverage accounting", () => {
  it("derives complete only when no eligible fact was skipped or truncated", () => {
    expect(completenessFromPatientCoreDiagnostics(base)).toBe("complete");
    expect(
      completenessFromPatientCoreDiagnostics({
        ...base,
        includedCount: 1,
        invalidSkippedCount: 1,
      }),
    ).toBe("partial");
    expect(
      completenessFromPatientCoreDiagnostics({
        ...base,
        includedCount: 1,
        truncatedCount: 1,
      }),
    ).toBe("partial");
  });

  it("fails closed when source/eligible/exclusion accounting is inconsistent", () => {
    expect(() =>
      validatePatientCoreCollectionDiagnostics({
        ...base,
        sourceRowCount: 5,
      }),
    ).toThrow("PATIENT_CORE_COVERAGE_ACCOUNTING_INVALID");
    expect(() =>
      validatePatientCoreCollectionDiagnostics({
        ...base,
        intentionallyExcludedCount: 1,
      }),
    ).toThrow("PATIENT_CORE_COVERAGE_ACCOUNTING_INVALID");
  });
});
