import { describe, expect, it } from "vitest";
import type {
  PatientContextView,
  PatientMedicationStateView,
} from "@glymize/contracts/patient-core";
import { comparePatientContexts } from "../src/patient-core/change-detection";

const patientId = "00000000-0000-4000-8000-000000000001";
const practiceId = "practice-1";

function medication(
  key: string,
  dose: string,
  encounterId: string,
): PatientMedicationStateView {
  return {
    factId: `${encounterId}:${key}`,
    factKey: `medication:${key}`,
    displayName: key,
    status: "active",
    sourceState: "reconciled",
    adherence: "unknown",
    dose,
    meta: {
      scope: { practiceId, patientId },
      source: {
        sourceType: "patient_record_v2",
        recordType: "patient_encounter_snapshot",
        recordId: `snapshot:${encounterId}`,
        encounterId,
      },
      effectiveAt: "2026-09-09T08:00:00.000Z",
      freshness: "unknown",
      verification: "verified",
      revision: 1,
    },
  };
}

function context(
  completeness: "complete" | "partial" | "not_available",
  medications: PatientMedicationStateView[],
  encounterId: string,
): PatientContextView {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-09T08:00:00.000Z",
    identity: {
      scope: { practiceId, patientId },
      patient: {
        patientId,
        status: "active",
        identifiers: [],
      },
    },
    allergies: { completeness: "not_available", gapReason: "source_not_exposed", items: [] },
    problems: { completeness: "not_available", gapReason: "source_not_exposed", items: [] },
    medications: {
      completeness,
      ...(completeness === "partial" ? { gapReason: "other" as const } : {}),
      ...(completeness === "not_available" ? { gapReason: "not_collected" as const } : {}),
      items: medications,
      asOf: encounterId,
    },
    observations: { completeness: "complete", items: [] },
    clinicalContexts: { completeness: "complete", items: [] },
  };
}

const baselineAnchor = {
  encounterId: "encounter-old",
  effectiveAt: "2026-08-01T08:00:00.000Z",
  snapshotRevision: 1,
};
const currentAnchor = {
  encounterId: "encounter-new",
  effectiveAt: "2026-09-01T08:00:00.000Z",
  snapshotRevision: 1,
};

describe("Patient Clinical Core deterministic change detection", () => {
  it("reports added, removed, and changed facts only with complete bilateral coverage", () => {
    const result = comparePatientContexts(
      context(
        "complete",
        [
          medication("metformin", "500 mg", "encounter-old"),
          medication("gliclazide", "60 mg", "encounter-old"),
        ],
        "encounter-old",
      ),
      context(
        "complete",
        [
          medication("metformin", "1000 mg", "encounter-new"),
          medication("empagliflozin", "10 mg", "encounter-new"),
        ],
        "encounter-new",
      ),
      baselineAnchor,
      currentAnchor,
      "2026-09-09T09:00:00.000Z",
    );

    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "medication",
          kind: "changed",
          subjectKey: "medication:metformin",
          deltas: expect.arrayContaining([
            expect.objectContaining({ field: "dose", before: "500 mg", after: "1000 mg" }),
          ]),
        }),
        expect.objectContaining({
          family: "medication",
          kind: "added",
          subjectKey: "medication:empagliflozin",
        }),
        expect.objectContaining({
          family: "medication",
          kind: "removed",
          subjectKey: "medication:gliclazide",
        }),
      ]),
    );
  });

  it("allows same-fact changes under partial coverage but suppresses false add/remove", () => {
    const result = comparePatientContexts(
      context(
        "partial",
        [medication("metformin", "500 mg", "encounter-old")],
        "encounter-old",
      ),
      context(
        "partial",
        [
          medication("metformin", "1000 mg", "encounter-new"),
          medication("empagliflozin", "10 mg", "encounter-new"),
        ],
        "encounter-new",
      ),
      baselineAnchor,
      currentAnchor,
      "2026-09-09T09:00:00.000Z",
    );

    expect(result.coverage).toContainEqual(
      expect.objectContaining({ family: "medication", state: "partial" }),
    );
    expect(result.changes).toContainEqual(
      expect.objectContaining({
        family: "medication",
        kind: "changed",
        subjectKey: "medication:metformin",
      }),
    );
    expect(result.changes).not.toContainEqual(
      expect.objectContaining({ kind: "added", subjectKey: "medication:empagliflozin" }),
    );
    expect(result.changes).not.toContainEqual(expect.objectContaining({ kind: "removed" }));
  });

  it("omits a family entirely when either side is unavailable", () => {
    const result = comparePatientContexts(
      context("not_available", [], "encounter-old"),
      context(
        "complete",
        [medication("metformin", "500 mg", "encounter-new")],
        "encounter-new",
      ),
      baselineAnchor,
      currentAnchor,
      "2026-09-09T09:00:00.000Z",
    );

    expect(result.coverage).toContainEqual(
      expect.objectContaining({ family: "medication", state: "omitted" }),
    );
    expect(result.changes).not.toContainEqual(expect.objectContaining({ family: "medication" }));
  });

  it("rejects cross-practice or cross-patient comparison", () => {
    const left = context("complete", [], "encounter-old");
    const right = context("complete", [], "encounter-new");
    right.identity.scope = { practiceId: "other-practice", patientId };

    expect(() =>
      comparePatientContexts(
        left,
        right,
        baselineAnchor,
        currentAnchor,
        "2026-09-09T09:00:00.000Z",
      ),
    ).toThrow("PATIENT_CORE_SCOPE_MISMATCH");
  });
});
