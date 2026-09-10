import type {
  PatientClinicalContextView,
  PatientCoreFactMeta,
  PatientLongitudinalReadModel,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import { describe, expect, it } from "vitest";
import {
  buildType2PatientCoreHandoffCandidate,
  type2PatientCoreHandoffMatchesIntent,
} from "../lib/type2-patient-core-handoff";

const scope = { practiceId: "practice-1", patientId: "patient-1" };

function meta(input: {
  id: string;
  revision?: number;
  verification?: PatientCoreFactMeta["verification"];
  freshness?: PatientCoreFactMeta["freshness"];
  patientId?: string;
}): PatientCoreFactMeta {
  return {
    scope: {
      practiceId: scope.practiceId,
      patientId: input.patientId ?? scope.patientId,
    },
    source: {
      sourceType: "patient_record_v2",
      recordType: "patient_observation",
      recordId: input.id,
      encounterId: `encounter-${input.revision ?? 1}`,
    },
    freshness: input.freshness ?? "unknown",
    verification: input.verification ?? "verified",
    ...(input.revision === undefined ? {} : { revision: input.revision }),
  };
}

function observation(input: {
  id: string;
  key: string;
  value: string | number;
  observedAt: string;
  revision?: number;
  verification?: PatientCoreFactMeta["verification"];
  freshness?: PatientCoreFactMeta["freshness"];
  patientId?: string;
  unit?: string;
}): PatientObservationView {
  return {
    factId: input.id,
    factKey: input.key,
    displayName: input.key,
    value: input.value,
    ...(input.unit ? { unit: input.unit } : {}),
    observedAt: input.observedAt,
    meta: meta(input),
  };
}

function clinicalContext(input: {
  id: string;
  key: string;
  state?: PatientClinicalContextView["state"];
  revision?: number;
  verification?: PatientCoreFactMeta["verification"];
  freshness?: PatientCoreFactMeta["freshness"];
}): PatientClinicalContextView {
  return {
    factId: input.id,
    factKey: input.key,
    displayName: input.key,
    state: input.state ?? "present",
    meta: {
      ...meta(input),
      source: {
        sourceType: "patient_record_v2",
        recordType: "patient_clinical_context",
        recordId: input.id,
        encounterId: `encounter-${input.revision ?? 1}`,
      },
    },
  };
}

function model(input: {
  observations?: PatientObservationView[];
  contexts?: PatientClinicalContextView[];
} = {}): PatientLongitudinalReadModel {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-10T04:00:00.000Z",
    context: {
      schemaVersion: 1,
      generatedAt: "2026-09-10T04:00:00.000Z",
      identity: {
        scope,
        patient: {
          patientId: scope.patientId,
          status: "active",
          identifiers: [],
        },
      },
      allergies: { completeness: "complete", items: [] },
      problems: { completeness: "complete", items: [] },
      medications: { completeness: "complete", items: [] },
      observations: {
        completeness: "complete",
        items: input.observations ?? [],
      },
      clinicalContexts: {
        completeness: "partial",
        items: input.contexts ?? [],
      },
    },
    timeline: { completeness: "complete", items: [] },
    changesSincePreviousEncounter: {
      schemaVersion: 1,
      scope,
      generatedAt: "2026-09-10T04:00:00.000Z",
      comparisonStatus: "no_baseline",
      coverage: [],
      changes: [],
    },
  } as PatientLongitudinalReadModel;
}

describe("R28-07 Type 2 Patient Core handoff adapter", () => {
  it("offers verified revision-bound facts as review candidates without inventing a target", () => {
    const candidate = buildType2PatientCoreHandoffCandidate(model({
      observations: [
        observation({
          id: "hba1c-1",
          key: "observation:hba1c:%:blood",
          value: 8.4,
          unit: "%",
          observedAt: "2026-09-01T09:00:00.000Z",
          revision: 3,
        }),
        observation({
          id: "egfr-1",
          key: "observation:egfr:mL/min/1.73m2:serum",
          value: "48",
          observedAt: "2026-09-01T09:00:00.000Z",
          revision: 3,
        }),
      ],
      contexts: [
        clinicalContext({
          id: "ckd-1",
          key: "context:ckd",
          revision: 3,
        }),
      ],
    }));

    expect(candidate.requiredIssues).toEqual([]);
    expect(candidate.prefill.currentHba1c).toBe(8.4);
    expect(candidate.prefill.eGfr).toBe(48);
    expect(candidate.prefill.factors).toContain("ckd");
    expect(candidate).not.toHaveProperty("prefill.targetHba1c");
    expect(candidate.fields.find((field) => field.key === "current_hba1c")).toMatchObject({
      status: "ready",
      freshness: "unknown",
      source: {
        revision: 3,
        verification: "verified",
        freshness: "unknown",
      },
    });
  });

  it("does not fall back to an older verified HbA1c when the newest value is unverified", () => {
    const candidate = buildType2PatientCoreHandoffCandidate(model({
      observations: [
        observation({
          id: "older-verified",
          key: "observation:hba1c:%:blood",
          value: 7.8,
          observedAt: "2026-08-01T09:00:00.000Z",
          revision: 1,
        }),
        observation({
          id: "newest-unverified",
          key: "observation:hba1c:%:blood",
          value: 9.1,
          observedAt: "2026-09-01T09:00:00.000Z",
          revision: 2,
          verification: "unverified",
        }),
      ],
    }));

    expect(candidate.prefill.currentHba1c).toBeUndefined();
    expect(candidate.requiredIssues).toEqual([
      { key: "current_hba1c", reason: "unverified" },
    ]);
    expect(candidate.fields.find((field) => field.key === "current_hba1c")?.source?.factId)
      .toBe("newest-unverified");
  });

  it("keeps an explicitly stale required value out of prefill", () => {
    const candidate = buildType2PatientCoreHandoffCandidate(model({
      observations: [
        observation({
          id: "stale-hba1c",
          key: "observation:hba1c:%:blood",
          value: 8.8,
          observedAt: "2025-01-01T09:00:00.000Z",
          revision: 5,
          freshness: "stale",
        }),
      ],
    }));

    expect(candidate.prefill.currentHba1c).toBeUndefined();
    expect(candidate.requiredIssues).toEqual([
      { key: "current_hba1c", reason: "stale" },
    ]);
  });

  it("reports missing HbA1c instead of treating zero rows as a negative or safe state", () => {
    const candidate = buildType2PatientCoreHandoffCandidate(model());

    expect(candidate.prefill.currentHba1c).toBeUndefined();
    expect(candidate.requiredIssues).toEqual([
      { key: "current_hba1c", reason: "missing" },
    ]);
    expect(candidate.sourceRevisionFingerprint).toBe("none");
  });

  it("fails closed when a relevant fact crosses the patient scope", () => {
    expect(() => buildType2PatientCoreHandoffCandidate(model({
      observations: [
        observation({
          id: "wrong-patient-hba1c",
          key: "observation:hba1c:%:blood",
          value: 8.1,
          observedAt: "2026-09-01T09:00:00.000Z",
          revision: 2,
          patientId: "patient-2",
        }),
      ],
    }))).toThrow("PATIENT_MODULE_HANDOFF_SCOPE_MISMATCH");
  });

  it("invalidates a launch intent when relevant source revisions change before destination review", () => {
    const launch = buildType2PatientCoreHandoffCandidate(model({
      observations: [
        observation({
          id: "hba1c",
          key: "observation:hba1c:%:blood",
          value: 8.1,
          observedAt: "2026-09-01T09:00:00.000Z",
          revision: 2,
        }),
      ],
    }));
    const refreshed = buildType2PatientCoreHandoffCandidate(model({
      observations: [
        observation({
          id: "hba1c",
          key: "observation:hba1c:%:blood",
          value: 8.1,
          observedAt: "2026-09-01T09:00:00.000Z",
          revision: 3,
        }),
      ],
    }));

    expect(type2PatientCoreHandoffMatchesIntent(refreshed, launch)).toBe(false);
    expect(type2PatientCoreHandoffMatchesIntent(launch, launch)).toBe(true);
  });
});
