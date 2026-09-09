import { describe, expect, it } from "vitest";
import type { PatientLongitudinalSummary } from "@glymize/contracts";
import {
  projectSnapshotClinicalContexts,
  projectSnapshotContext,
  projectSnapshotMedications,
  projectSnapshotObservations,
} from "../src/patient-core/projection";
import type { PatientCoreEncounterSnapshotSource } from "../src/patient-core/snapshot-reader";

const patient: PatientLongitudinalSummary = {
  patientId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  identifiers: [],
};

function source(overrides: Partial<PatientCoreEncounterSnapshotSource> = {}): PatientCoreEncounterSnapshotSource {
  return {
    encounterId: "00000000-0000-4000-8000-000000000002",
    encounterAt: "2026-09-09T08:00:00.000Z",
    encounterStatus: "completed",
    snapshotId: "00000000-0000-4000-8000-000000000003",
    revision: 2,
    snapshotKind: "final",
    createdAt: "2026-09-09T08:05:00.000Z",
    snapshot: {},
    ...overrides,
  };
}

describe("Patient Clinical Core snapshot projection", () => {
  it("preserves held medication state and rejects rejected medication facts", () => {
    const result = projectSnapshotMedications(
      source({
        snapshot: {
          medications: [
            {
              genericMedicationId: "metformin",
              genericName: "Metformin",
              doseAmount: 500,
              doseUnit: "mg",
              frequencyPerDay: 2,
              status: "held",
              verification: "confirmed",
            },
            {
              genericName: "Rejected medicine",
              verification: "rejected",
            },
          ],
        },
      }),
      "practice-1",
      patient.patientId,
    );

    expect(result.completeness).toBe("complete");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      factKey: "medication:metformin",
      status: "held",
      sourceState: "reconciled",
      dose: "500 mg",
      frequency: "2/day",
    });
    expect(result.items[0]?.meta.scope).toEqual({
      practiceId: "practice-1",
      patientId: patient.patientId,
    });
  });

  it("distinguishes missing medication collection from a known empty collection", () => {
    expect(
      projectSnapshotMedications(source(), "practice-1", patient.patientId),
    ).toMatchObject({
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
    });

    expect(
      projectSnapshotMedications(
        source({ snapshot: { medications: [] } }),
        "practice-1",
        patient.patientId,
      ),
    ).toMatchObject({
      completeness: "complete",
      items: [],
    });
  });

  it("projects the latest accepted lab per canonical key without inventing unit conversion", () => {
    const result = projectSnapshotObservations(
      source({
        snapshot: {
          labs: [
            {
              id: "lab-1",
              canonicalKey: "hba1c",
              canonicalName: "HbA1c",
              rawName: "HbA1c",
              value: 8.1,
              unit: "%",
              observedAt: "2026-08-01T00:00:00.000Z",
              verification: "confirmed",
            },
            {
              id: "lab-2",
              canonicalKey: "hba1c",
              canonicalName: "HbA1c",
              rawName: "HbA1c",
              value: 7.4,
              unit: "%",
              observedAt: "2026-09-01T00:00:00.000Z",
              verification: "confirmed",
            },
            {
              id: "lab-rejected",
              canonicalKey: "potassium",
              rawName: "K",
              value: 9.9,
              unit: "mmol/L",
              verification: "rejected",
            },
          ],
        },
      }),
      "practice-1",
      patient.patientId,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      factKey: "observation:hba1c:%:",
      value: 7.4,
      unit: "%",
      observedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("marks a snapshot observation family partial when an eligible lab is unusable", () => {
    const result = projectSnapshotObservations(
      source({
        snapshot: {
          labs: [
            {
              id: "lab-valid",
              canonicalKey: "hba1c",
              rawName: "HbA1c",
              value: 7.2,
              unit: "%",
              verification: "confirmed",
            },
            {
              id: "lab-missing-value",
              canonicalKey: "creatinine",
              rawName: "Creatinine",
              verification: "confirmed",
            },
          ],
        },
      }),
      "practice-1",
      patient.patientId,
    );

    expect(result.completeness).toBe("partial");
    expect(result.gapReason).toBe("other");
    expect(result.items).toHaveLength(1);
  });

  it("keeps bounded legacy clinical flags explicitly partial", () => {
    const result = projectSnapshotClinicalContexts(
      source({
        snapshot: {
          clinicalFlags: {
            ckd: true,
            heartFailure: false,
          },
        },
      }),
      "practice-1",
      patient.patientId,
    );

    expect(result.completeness).toBe("partial");
    expect(result.gapReason).toBe("not_supported");
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factKey: "context:ckd", state: "present" }),
        expect.objectContaining({ factKey: "context:heartFailure", state: "absent" }),
      ]),
    );
  });

  it("does not pretend problems or allergies are available before an authority exists", () => {
    const context = projectSnapshotContext(
      patient,
      "practice-1",
      source({ snapshot: { medications: [], labs: [], clinicalFlags: {} } }),
    );
    expect(context.problems).toMatchObject({
      completeness: "not_available",
      gapReason: "source_not_exposed",
    });
    expect(context.allergies).toMatchObject({
      completeness: "not_available",
      gapReason: "source_not_exposed",
    });
  });
});
