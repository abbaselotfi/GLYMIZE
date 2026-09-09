import type {
  PatientLongitudinalHistoryPage,
  PatientLongitudinalReadModel,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import { describe, expect, it } from "vitest";
import { mergePatientLongitudinalHistoryPage } from "../lib/patient-longitudinal-history-merge";
import { parsePatientLongitudinalHistoryPage } from "../lib/patient-longitudinal-history-validator";
import { validatePatientLongitudinalContinuations } from "../lib/patient-longitudinal-continuation-validator";

const scope = { practiceId: "practice-1", patientId: "patient-1" };
const sourceVersion = "2026-09-09T10:00:00.000Z";

function observation(id: string, day: number): PatientObservationView {
  return {
    factId: id,
    factKey: "observation:hba1c:%:",
    displayName: "HbA1c",
    value: 7 + day / 10,
    unit: "%",
    observedAt: `2026-08-${String(day).padStart(2, "0")}T08:00:00.000Z`,
    meta: {
      scope,
      source: {
        sourceType: "patient_record_v2",
        recordType: "patient_observation",
        recordId: id,
      },
      recordedAt: `2026-08-${String(day).padStart(2, "0")}T09:00:00.000Z`,
      freshness: "unknown",
      verification: "verified",
    },
  };
}

function model(): PatientLongitudinalReadModel {
  return {
    schemaVersion: 1,
    generatedAt: sourceVersion,
    context: {
      schemaVersion: 1,
      generatedAt: sourceVersion,
      identity: {
        scope,
        patient: { patientId: scope.patientId, status: "active", identifiers: [] },
      },
      allergies: { completeness: "not_available", items: [] },
      problems: { completeness: "not_available", items: [] },
      medications: { completeness: "partial", items: [] },
      observations: {
        completeness: "partial",
        gapReason: "other",
        items: [observation("obs-5", 5), observation("obs-4", 4)],
        diagnostics: {
          sourceScope: "latest_snapshot_revision_per_encounter",
          sourceRowCount: 5,
          eligibleCount: 5,
          includedCount: 2,
          intentionallyExcludedCount: 0,
          invalidSkippedCount: 0,
          truncatedCount: 3,
        },
        continuation: {
          sourceVersion,
          pageSize: 2,
          hasMore: true,
          nextCursor: "cursor-a",
          remainingCount: 3,
        },
      },
      clinicalContexts: { completeness: "partial", items: [] },
    },
    timeline: {
      completeness: "partial",
      gapReason: "source_not_exposed",
      items: [],
      continuation: { sourceVersion, pageSize: 60, hasMore: false },
    },
    changesSincePreviousEncounter: {
      schemaVersion: 1,
      scope,
      generatedAt: sourceVersion,
      comparisonStatus: "unavailable",
      coverage: [],
      changes: [],
    },
  };
}

function observationPage(
  items: PatientObservationView[],
  remainingCount: number,
  nextCursor?: string,
): PatientLongitudinalHistoryPage {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-09T10:05:00.000Z",
    scope,
    family: "observations",
    collection: {
      completeness: remainingCount > 0 ? "partial" : "complete",
      ...(remainingCount > 0 ? { gapReason: "other" as const } : {}),
      items,
      diagnostics: {
        sourceScope: "latest_snapshot_revision_per_encounter",
        sourceRowCount: items.length + remainingCount,
        eligibleCount: items.length + remainingCount,
        includedCount: items.length,
        intentionallyExcludedCount: 0,
        invalidSkippedCount: 0,
        truncatedCount: remainingCount,
      },
      continuation: {
        sourceVersion,
        pageSize: 2,
        hasMore: remainingCount > 0,
        remainingCount,
        ...(nextCursor ? { nextCursor } : {}),
      },
    },
  };
}

describe("R28-05 Patient Workspace history continuation", () => {
  it("merges all bounded observation pages without duplicates or accounting loss", () => {
    let current = model();
    current = mergePatientLongitudinalHistoryPage(
      current,
      observationPage([observation("obs-3", 3), observation("obs-2", 2)], 1, "cursor-b"),
    );
    expect(current.context.observations.diagnostics).toMatchObject({
      includedCount: 4,
      truncatedCount: 1,
    });

    current = mergePatientLongitudinalHistoryPage(
      current,
      observationPage([observation("obs-1", 1)], 0),
    );
    expect(current.context.observations.items.map((item) => item.factId)).toEqual([
      "obs-5",
      "obs-4",
      "obs-3",
      "obs-2",
      "obs-1",
    ]);
    expect(current.context.observations.completeness).toBe("complete");
    expect(current.context.observations.gapReason).toBeUndefined();
    expect(current.context.observations.diagnostics).toMatchObject({
      sourceRowCount: 5,
      eligibleCount: 5,
      includedCount: 5,
      truncatedCount: 0,
    });
    expect(current.context.observations.continuation).toMatchObject({ hasMore: false });
  });

  it("rejects duplicate and cross-watermark pages", () => {
    expect(() =>
      mergePatientLongitudinalHistoryPage(
        model(),
        observationPage([observation("obs-4", 4)], 2, "cursor-b"),
      ),
    ).toThrow("PATIENT_LONGITUDINAL_HISTORY_DUPLICATE");

    const page = observationPage([observation("obs-3", 3)], 2, "cursor-b");
    page.collection.continuation.sourceVersion = "2026-09-10T10:00:00.000Z";
    expect(() => mergePatientLongitudinalHistoryPage(model(), page)).toThrow(
      "PATIENT_LONGITUDINAL_HISTORY_SOURCE_MISMATCH",
    );
  });

  it("validates initial continuation semantics and history page scope", () => {
    expect(validatePatientLongitudinalContinuations(model())).toBeTruthy();
    const invalidModel = model();
    invalidModel.context.observations.completeness = "complete";
    expect(() => validatePatientLongitudinalContinuations(invalidModel)).toThrow(
      "PATIENT_LONGITUDINAL_INVALID_RESPONSE",
    );

    const page = observationPage([observation("obs-3", 3)], 2, "cursor-b");
    expect(parsePatientLongitudinalHistoryPage(page, {
      ...scope,
      family: "observations",
    })).toMatchObject({ schemaVersion: 1, family: "observations" });
    expect(() => parsePatientLongitudinalHistoryPage(page, {
      practiceId: scope.practiceId,
      patientId: "patient-2",
      family: "observations",
    })).toThrow("PATIENT_LONGITUDINAL_HISTORY_SCOPE_MISMATCH");
  });
});
