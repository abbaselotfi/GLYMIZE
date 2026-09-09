import type { PatientEncounterSnapshotKind } from "@glymize/contracts";
import { describe, expect, it } from "vitest";
import {
  projectSnapshotClinicalContexts,
  projectSnapshotContext,
  projectSnapshotMedications,
} from "../src/patient-core/projection";
import type { PatientCoreEncounterSnapshotSource } from "../src/patient-core/snapshot-reader";

function source(
  snapshotKind: PatientEncounterSnapshotKind,
  snapshot: PatientCoreEncounterSnapshotSource["snapshot"],
): PatientCoreEncounterSnapshotSource {
  return {
    encounterId: "encounter-1",
    encounterAt: "2026-09-09T08:00:00.000Z",
    encounterStatus: "reviewed",
    snapshotId: `snapshot-${snapshotKind}`,
    revision: 4,
    snapshotKind,
    createdAt: "2026-09-09T08:05:00.000Z",
    snapshot,
  };
}

const patient = {
  patientId: "patient-1",
  status: "active" as const,
  identifiers: [],
};

const expectedStages = {
  clinical: "clinical_snapshot",
  care_team: "care_team_snapshot",
  physician_review: "physician_review_snapshot",
  final: "final_snapshot",
} as const;

describe("R28-06 Patient Core authority/readiness projection", () => {
  it("distinguishes medication not-collected from known-empty reconciliation", () => {
    const unavailable = projectSnapshotMedications(
      source("care_team", {}),
      "practice-1",
      "patient-1",
    );
    const knownEmpty = projectSnapshotMedications(
      source("care_team", { medications: [] }),
      "practice-1",
      "patient-1",
    );

    expect(unavailable).toMatchObject({
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
    });
    expect(knownEmpty).toMatchObject({
      completeness: "complete",
      items: [],
    });
  });

  it.each(Object.entries(expectedStages))(
    "preserves %s medication reconciliation stage without turning it into an order state",
    (snapshotKind, reconciliationStage) => {
      const result = projectSnapshotMedications(
        source(snapshotKind as PatientEncounterSnapshotKind, {
          medications: [
            {
              genericMedicationId: "med-1",
              genericName: "Example medicine",
              status: "active",
              verification: "confirmed",
            },
          ],
        }),
        "practice-1",
        "patient-1",
      );

      expect(result.items[0]).toMatchObject({
        sourceState: "reconciled",
        reconciliationStage,
        status: "active",
        meta: {
          verification: "verified",
          freshness: "unknown",
          effectiveAt: "2026-09-09T08:00:00.000Z",
          recordedAt: "2026-09-09T08:05:00.000Z",
          revision: 4,
          source: {
            recordType: "patient_encounter_snapshot",
            encounterId: "encounter-1",
          },
        },
      });
      expect(result.items[0]).not.toHaveProperty("orderId");
      expect(result.items[0]).not.toHaveProperty("signedAt");
    },
  );

  it("keeps explicit clinical-flag absence inside a partial bounded context family", () => {
    const result = projectSnapshotClinicalContexts(
      source("physician_review", {
        clinicalFlags: { ckd: false, heartFailure: true },
      }),
      "practice-1",
      "patient-1",
    );

    expect(result.completeness).toBe("partial");
    expect(result.gapReason).toBe("not_supported");
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ factKey: "context:ckd", state: "absent" }),
      expect.objectContaining({ factKey: "context:heartFailure", state: "present" }),
    ]));
  });

  it("does not invent allergy or problem authority from snapshot flags or notes", () => {
    const context = projectSnapshotContext(
      patient,
      "practice-1",
      source("final", {
        clinicalFlags: { ckd: true },
        nurseNotes: "Allergy and problem words are not canonical facts.",
      }),
    );

    expect(context.allergies).toMatchObject({
      completeness: "not_available",
      gapReason: "source_not_exposed",
      items: [],
    });
    expect(context.problems).toMatchObject({
      completeness: "not_available",
      gapReason: "source_not_exposed",
      items: [],
    });
  });
});
