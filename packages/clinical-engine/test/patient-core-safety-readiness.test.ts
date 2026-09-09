import type {
  PatientContextView,
  PatientCoreFactMeta,
  PatientMedicationStateView,
} from "@glymize/contracts/patient-core";
import { describe, expect, it } from "vitest";
import { buildPatientCoreMedicationSafetyReadiness } from "../src/patient-core-safety-readiness";

const scope = { practiceId: "practice-1", patientId: "patient-1" };

function meta(
  verification: PatientCoreFactMeta["verification"] = "verified",
  freshness: PatientCoreFactMeta["freshness"] = "unknown",
): PatientCoreFactMeta {
  return {
    scope,
    source: {
      sourceType: "patient_record_v2",
      recordType: "patient_encounter_snapshot",
      recordId: "snapshot-1",
      encounterId: "encounter-1",
    },
    effectiveAt: "2026-09-09T08:00:00.000Z",
    recordedAt: "2026-09-09T08:05:00.000Z",
    verification,
    freshness,
    revision: 3,
  };
}

function medication(
  factId: string,
  verification: PatientCoreFactMeta["verification"],
  freshness: PatientCoreFactMeta["freshness"],
): PatientMedicationStateView {
  return {
    factId,
    factKey: `medication:${factId}`,
    displayName: factId,
    status: "active",
    sourceState: "reconciled",
    adherence: "unknown",
    reconciliationStage: "care_team_snapshot",
    meta: meta(verification, freshness),
  };
}

function context(): PatientContextView {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-09T09:00:00.000Z",
    identity: {
      scope,
      patient: {
        patientId: scope.patientId,
        status: "active",
        identifiers: [],
      },
    },
    allergies: {
      completeness: "not_available",
      gapReason: "not_collected",
      items: [],
    },
    problems: {
      completeness: "partial",
      gapReason: "source_not_exposed",
      items: [],
    },
    medications: {
      completeness: "complete",
      items: [
        medication("unverified-med", "unverified", "current"),
        medication("unknown-freshness-med", "verified", "unknown"),
        medication("stale-med", "verified", "stale"),
        medication("current-med", "verified", "current"),
      ],
    },
    observations: {
      completeness: "complete",
      items: [],
    },
    clinicalContexts: {
      completeness: "complete",
      items: [],
    },
  };
}

describe("Patient Core medication-safety readiness bridge", () => {
  it("keeps not-collected, partial, known-absent and present states distinct", () => {
    const result = buildPatientCoreMedicationSafetyReadiness(context());

    expect(result.decisionAuthority).toBe("none");
    expect(result.allergies).toMatchObject({
      state: "not_collected",
      completeness: "not_available",
      gapReason: "not_collected",
      facts: [],
    });
    expect(result.problems).toMatchObject({
      state: "partial",
      completeness: "partial",
      facts: [],
    });
    expect(result.observations).toMatchObject({
      state: "known_absent",
      completeness: "complete",
      facts: [],
    });
    expect(result.medications.state).toBe("present");
  });

  it("never promotes missing or partial safety families to known absence", () => {
    const result = buildPatientCoreMedicationSafetyReadiness(context());

    expect(result.allergies.state).not.toBe("known_absent");
    expect(result.problems.state).not.toBe("known_absent");
    expect(result.allergies).not.toHaveProperty("clearance");
    expect(result.problems).not.toHaveProperty("eligible");
  });

  it("preserves verification and reviewed freshness states without inventing a cutoff", () => {
    const result = buildPatientCoreMedicationSafetyReadiness(context());

    expect(result.medications.facts.map((item) => item.readiness)).toEqual([
      "unverified",
      "freshness_unknown",
      "stale",
      "current",
    ]);
  });

  it("preserves reconciliation stage, source time, verification and revision for consumers", () => {
    const result = buildPatientCoreMedicationSafetyReadiness(context());
    const fact = result.medications.facts[0]!.fact;

    expect(fact).toMatchObject({
      reconciliationStage: "care_team_snapshot",
      sourceState: "reconciled",
      status: "active",
      meta: {
        effectiveAt: "2026-09-09T08:00:00.000Z",
        recordedAt: "2026-09-09T08:05:00.000Z",
        verification: "unverified",
        freshness: "current",
        revision: 3,
      },
    });
  });
});
