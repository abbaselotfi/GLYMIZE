import type {
  PatientChange,
  PatientCoreEventView,
  PatientCoreFactMeta,
  PatientLongitudinalReadModel,
  PatientMedicationStateView,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import { describe, expect, it } from "vitest";
import { buildPatientTenSecondBrief } from "../lib/patient-clinical-brief";
import {
  buildPatientWorkspaceSelection,
  PATIENT_WORKSPACE_PREVIEW_LIMITS,
} from "../lib/patient-workspace-selection";

function meta(
  recordId: string,
  verification: PatientCoreFactMeta["verification"] = "verified",
  revision = 1,
): PatientCoreFactMeta {
  return {
    scope: { practiceId: "practice-1", patientId: "patient-1" },
    source: {
      sourceType: "patient_record_v2",
      recordType: "patient_observation",
      recordId,
      encounterId: `encounter-${revision}`,
    },
    freshness: "unknown",
    verification,
    revision,
  };
}

function observation(
  id: string,
  factKey: string,
  observedAt: string,
  options: {
    abnormalFlag?: string;
    verification?: PatientCoreFactMeta["verification"];
    unit?: string;
    specimen?: string;
    revision?: number;
  } = {},
): PatientObservationView {
  return {
    factId: id,
    factKey,
    displayName: factKey,
    value: id,
    ...(options.unit ? { unit: options.unit } : {}),
    ...(options.specimen ? { specimen: options.specimen } : {}),
    ...(options.abnormalFlag ? { abnormalFlag: options.abnormalFlag } : {}),
    observedAt,
    meta: meta(id, options.verification ?? "verified", options.revision ?? 1),
  };
}

function medication(id: string, status: PatientMedicationStateView["status"]): PatientMedicationStateView {
  return {
    factId: id,
    factKey: `medication:${id}`,
    displayName: id,
    status,
    sourceState: "reconciled",
    adherence: "unknown",
    meta: meta(id),
  };
}

function event(index: number): PatientCoreEventView {
  return {
    eventId: `event-${index}`,
    eventType: "encounter",
    effectiveAt: `2026-09-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    source: {
      sourceType: "patient_record_v2",
      recordType: "patient_encounter",
      recordId: `event-${index}`,
      encounterId: `event-${index}`,
    },
  };
}

function change(index: number): PatientChange {
  return {
    changeId: `change-${index}`,
    family: "observation",
    kind: "changed",
    subjectKey: `observation:${index}`,
    displayName: `Observation ${index}`,
    source: {
      sourceType: "patient_record_v2",
      recordType: "patient_observation",
      recordId: `change-source-${index}`,
      encounterId: "encounter-current",
    },
  };
}

function model(overrides: {
  observations?: PatientObservationView[];
  medications?: PatientMedicationStateView[];
  timeline?: PatientCoreEventView[];
  changes?: PatientChange[];
} = {}): PatientLongitudinalReadModel {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-09T12:00:00.000Z",
    context: {
      schemaVersion: 1,
      generatedAt: "2026-09-09T12:00:00.000Z",
      identity: {} as never,
      allergies: { completeness: "complete", items: [] },
      problems: { completeness: "complete", items: [] },
      medications: { completeness: "complete", items: overrides.medications ?? [] },
      observations: { completeness: "complete", items: overrides.observations ?? [] },
      clinicalContexts: { completeness: "complete", items: [] },
    },
    timeline: { completeness: "complete", items: overrides.timeline ?? [] },
    changesSincePreviousEncounter: {
      schemaVersion: 1,
      scope: { practiceId: "practice-1", patientId: "patient-1" },
      generatedAt: "2026-09-09T12:00:00.000Z",
      comparisonStatus: "complete",
      baseline: {
        encounterId: "encounter-baseline",
        effectiveAt: "2026-09-01T09:00:00.000Z",
        snapshotRevision: 1,
      },
      current: {
        encounterId: "encounter-current",
        effectiveAt: "2026-09-09T09:00:00.000Z",
        snapshotRevision: 2,
      },
      coverage: [],
      changes: overrides.changes ?? [],
    },
  } as PatientLongitudinalReadModel;
}

describe("Patient Workspace selection contract", () => {
  it("keeps an old source flag historical when a newer result exists in the same exact series", () => {
    const fixture = model({
      observations: [
        observation("old", "observation:hba1c:%:blood", "2026-08-01T09:00:00.000Z", {
          abnormalFlag: "H",
          unit: "%",
          specimen: "blood",
          revision: 1,
        }),
        observation("new", "observation:hba1c:%:blood", "2026-09-01T09:00:00.000Z", {
          abnormalFlag: "N",
          unit: "%",
          specimen: "blood",
          revision: 2,
        }),
      ],
    });

    const selected = buildPatientWorkspaceSelection(fixture);
    const brief = buildPatientTenSecondBrief(fixture, selected);

    expect(selected.currentObservations.items.map((item) => item.factId)).toEqual(["new"]);
    expect(selected.currentFlaggedObservations.items).toEqual([]);
    expect(selected.historicalFlaggedObservations.map((item) => item.factId)).toEqual(["old"]);
    expect(brief.flaggedObservationCount).toBe(0);
    expect(brief.historicalFlaggedObservationCount).toBe(1);
    expect(brief.posture).toBe("current_snapshot_available");
  });

  it("does not collapse incompatible unit or specimen series", () => {
    const fixture = model({
      observations: [
        observation("mgdl", "observation:glucose:mg/dL:plasma", "2026-09-09T08:00:00.000Z", {
          abnormalFlag: "H",
          unit: "mg/dL",
          specimen: "plasma",
        }),
        observation("mmol", "observation:glucose:mmol/L:plasma", "2026-09-09T09:00:00.000Z", {
          unit: "mmol/L",
          specimen: "plasma",
        }),
        observation("serum", "observation:glucose:mg/dL:serum", "2026-09-09T10:00:00.000Z", {
          unit: "mg/dL",
          specimen: "serum",
        }),
      ],
    });

    const selected = buildPatientWorkspaceSelection(fixture);

    expect(selected.currentObservations.items).toHaveLength(3);
    expect(selected.currentFlaggedObservations.items.map((item) => item.factId)).toEqual(["mgdl"]);
  });

  it("surfaces current unverified findings without inventing severity", () => {
    const fixture = model({
      observations: [
        observation("unverified", "observation:creatinine:mg/dL:serum", "2026-09-09T10:00:00.000Z", {
          verification: "unverified",
          unit: "mg/dL",
          specimen: "serum",
          revision: 4,
        }),
      ],
    });

    const selected = buildPatientWorkspaceSelection(fixture);
    const brief = buildPatientTenSecondBrief(fixture, selected);

    expect(selected.currentUnverifiedObservations.items).toHaveLength(1);
    expect(selected.currentUnverifiedObservations.items[0]?.meta.revision).toBe(4);
    expect(selected.currentUnverifiedObservations.items[0]?.meta.source.recordId).toBe("unverified");
    expect(brief.unverifiedObservationCount).toBe(1);
    expect(brief.posture).toBe("review_recorded_changes");
  });

  it("reconciles headline counts with explicit preview and omitted collections", () => {
    const observations = Array.from({ length: 10 }, (_, index) =>
      observation(
        `observation-${index}`,
        `observation:key-${index}:unit:specimen`,
        `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      ),
    );
    const medications = Array.from({ length: 8 }, (_, index) =>
      medication(`medication-${index}`, index < 5 ? "held" : "active"),
    );
    const timeline = Array.from({ length: 10 }, (_, index) => event(index));
    const changes = Array.from({ length: 7 }, (_, index) => change(index));
    const fixture = model({ observations, medications, timeline, changes });

    const selected = buildPatientWorkspaceSelection(fixture);
    const brief = buildPatientTenSecondBrief(fixture, selected);

    expect(selected.currentObservations.preview).toHaveLength(PATIENT_WORKSPACE_PREVIEW_LIMITS.observations);
    expect(selected.currentObservations.omittedCount).toBe(2);
    expect(selected.medications.preview).toHaveLength(PATIENT_WORKSPACE_PREVIEW_LIMITS.medications);
    expect(selected.medications.omittedCount).toBe(2);
    expect(selected.attentionMedications.preview).toHaveLength(PATIENT_WORKSPACE_PREVIEW_LIMITS.attention);
    expect(selected.attentionMedications.omittedCount).toBe(2);
    expect(selected.timeline.preview).toHaveLength(PATIENT_WORKSPACE_PREVIEW_LIMITS.timeline);
    expect(selected.timeline.omittedCount).toBe(2);
    expect(selected.changes.preview).toHaveLength(PATIENT_WORKSPACE_PREVIEW_LIMITS.changes);
    expect(selected.changes.omittedCount).toBe(1);
    expect(brief.recordedChangeCount).toBe(selected.changes.items.length);
    expect(brief.medicationAttentionCount).toBe(selected.attentionMedications.items.length);
  });
});
