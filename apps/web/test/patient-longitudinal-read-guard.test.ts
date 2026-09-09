import type { PatientLongitudinalReadModel } from "@glymize/contracts/patient-core";
import { describe, expect, it, vi } from "vitest";
import {
  createLatestPatientLongitudinalReader,
  isPatientWorkspaceReadScopeActive,
  type PatientWorkspaceReadScope,
} from "../lib/patient-longitudinal-read-guard";
import { parsePatientLongitudinalReadModel } from "../lib/patient-longitudinal-response-validator";

const scope: PatientWorkspaceReadScope = {
  actorId: "physician-1",
  practiceId: "practice-1",
  patientId: "patient-1",
};

function source(recordId = "record-1") {
  return {
    sourceType: "patient_record_v2",
    recordType: "encounter_snapshot",
    recordId,
  };
}

function meta(patientId = scope.patientId, practiceId = scope.practiceId) {
  return {
    scope: { patientId, practiceId },
    source: source(),
    freshness: "unknown",
    verification: "verified",
  };
}

function model(
  overrides: { patientId?: string; practiceId?: string; schemaVersion?: number } = {},
) {
  const patientId = overrides.patientId ?? scope.patientId;
  const practiceId = overrides.practiceId ?? scope.practiceId;
  const factScope = { patientId, practiceId };
  return {
    schemaVersion: overrides.schemaVersion ?? 1,
    generatedAt: "2026-09-09T00:00:00.000Z",
    context: {
      schemaVersion: 1,
      generatedAt: "2026-09-09T00:00:00.000Z",
      identity: {
        scope: factScope,
        patient: { patientId, status: "active", identifiers: [] },
      },
      allergies: { completeness: "not_available", items: [] },
      problems: { completeness: "not_available", items: [] },
      medications: { completeness: "partial", items: [] },
      observations: { completeness: "complete", items: [] },
      clinicalContexts: { completeness: "partial", items: [] },
    },
    timeline: { completeness: "complete", items: [] },
    changesSincePreviousEncounter: {
      schemaVersion: 1,
      scope: factScope,
      generatedAt: "2026-09-09T00:00:00.000Z",
      comparisonStatus: "unavailable",
      coverage: [],
      changes: [],
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("Patient longitudinal response guard", () => {
  it("accepts the supported envelope only for the requested patient and practice", () => {
    expect(parsePatientLongitudinalReadModel(model(), scope)).toMatchObject({ schemaVersion: 1 });
    expect(() =>
      parsePatientLongitudinalReadModel(model({ patientId: "patient-2" }), scope),
    ).toThrow("PATIENT_LONGITUDINAL_SCOPE_MISMATCH");
    expect(() =>
      parsePatientLongitudinalReadModel(model({ practiceId: "practice-2" }), scope),
    ).toThrow("PATIENT_LONGITUDINAL_SCOPE_MISMATCH");
  });

  it("rejects unsupported and malformed response envelopes", () => {
    expect(() => parsePatientLongitudinalReadModel(model({ schemaVersion: 2 }), scope)).toThrow(
      "PATIENT_LONGITUDINAL_UNSUPPORTED_VERSION",
    );
    expect(() => parsePatientLongitudinalReadModel({ schemaVersion: 1 }, scope)).toThrow(
      "PATIENT_LONGITUDINAL_INVALID_RESPONSE",
    );
  });

  it("accepts valid nested facts, timeline events, and changes", () => {
    const payload = model();
    payload.context.medications.items.push({
      factId: "med-1",
      factKey: "medication:1",
      displayName: "Example medication",
      meta: meta(),
      status: "active",
      sourceState: "reconciled",
      adherence: "unknown",
    } as never);
    payload.context.observations.items.push({
      factId: "obs-1",
      factKey: "lab:hba1c",
      displayName: "HbA1c",
      meta: meta(),
      value: 7.1,
      unit: "%",
      observedAt: "2026-09-09T00:00:00.000Z",
    } as never);
    payload.timeline.items.push({
      eventId: "event-1",
      eventType: "encounter",
      effectiveAt: "2026-09-09T00:00:00.000Z",
      source: source("encounter-1"),
    } as never);
    payload.changesSincePreviousEncounter.comparisonStatus = "partial";
    payload.changesSincePreviousEncounter.coverage.push({
      family: "medication",
      state: "partial",
    } as never);
    payload.changesSincePreviousEncounter.changes.push({
      changeId: "change-1",
      family: "medication",
      kind: "changed",
      subjectKey: "medication:1",
      displayName: "Example medication",
      deltas: [{ field: "status", before: "held", after: "active" }],
    } as never);

    expect(parsePatientLongitudinalReadModel(payload, scope)).toMatchObject({ schemaVersion: 1 });
  });

  it("fails closed for malformed nested values consumed by the workspace", () => {
    const invalidMedication = model();
    invalidMedication.context.medications.items.push({
      factId: "med-1",
      factKey: "medication:1",
      displayName: "Example medication",
      meta: meta(),
      status: "invented-status",
      sourceState: "reconciled",
      adherence: "unknown",
    } as never);
    expect(() => parsePatientLongitudinalReadModel(invalidMedication, scope)).toThrow(
      "PATIENT_LONGITUDINAL_INVALID_RESPONSE",
    );

    const invalidChange = model();
    invalidChange.changesSincePreviousEncounter.changes.push({
      changeId: "change-1",
      family: "invented-family",
      kind: "changed",
      subjectKey: "x",
      displayName: "Bad change",
    } as never);
    expect(() => parsePatientLongitudinalReadModel(invalidChange, scope)).toThrow(
      "PATIENT_LONGITUDINAL_INVALID_RESPONSE",
    );

    const invalidTimeline = model();
    invalidTimeline.timeline.items.push({
      eventId: "event-1",
      eventType: "encounter",
      effectiveAt: "2026-09-09T00:00:00.000Z",
    } as never);
    expect(() => parsePatientLongitudinalReadModel(invalidTimeline, scope)).toThrow(
      "PATIENT_LONGITUDINAL_INVALID_RESPONSE",
    );
  });
});

describe("latest Patient Workspace read", () => {
  it("rejects a completed read after logout, account change, practice change, or disablement", () => {
    expect(
      isPatientWorkspaceReadScopeActive(scope, {
        id: scope.actorId,
        practiceId: scope.practiceId,
        status: "active",
      }),
    ).toBe(true);
    expect(isPatientWorkspaceReadScopeActive(scope, null)).toBe(false);
    expect(
      isPatientWorkspaceReadScopeActive(scope, {
        id: "physician-2",
        practiceId: scope.practiceId,
        status: "active",
      }),
    ).toBe(false);
    expect(
      isPatientWorkspaceReadScopeActive(scope, {
        id: scope.actorId,
        practiceId: "practice-2",
        status: "active",
      }),
    ).toBe(false);
    expect(
      isPatientWorkspaceReadScopeActive(scope, {
        id: scope.actorId,
        practiceId: scope.practiceId,
        status: "disabled",
      }),
    ).toBe(false);
  });

  it("ignores an obsolete patient response that resolves after the active patient", async () => {
    const patientA = deferred<PatientLongitudinalReadModel>();
    const patientB = deferred<PatientLongitudinalReadModel>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn((requested: PatientWorkspaceReadScope, signal: AbortSignal) => {
      signals.push(signal);
      return requested.patientId === "patient-a" ? patientA.promise : patientB.promise;
    });
    const reader = createLatestPatientLongitudinalReader(loader);
    const readA = reader.read({ ...scope, patientId: "patient-a" });
    const readB = reader.read({ ...scope, patientId: "patient-b" });

    expect(signals[0]?.aborted).toBe(true);
    patientB.resolve(model({ patientId: "patient-b" }) as PatientLongitudinalReadModel);
    expect(await readB).toMatchObject({ status: "current", scope: { patientId: "patient-b" } });
    patientA.resolve(model({ patientId: "patient-a" }) as PatientLongitudinalReadModel);
    expect(await readA).toEqual({ status: "obsolete" });
  });

  it("keeps only the newest overlapping refresh for the same patient", async () => {
    const first = deferred<PatientLongitudinalReadModel>();
    const second = deferred<PatientLongitudinalReadModel>();
    let invocation = 0;
    const reader = createLatestPatientLongitudinalReader(() => {
      invocation += 1;
      return invocation === 1 ? first.promise : second.promise;
    });

    const firstRead = reader.read(scope);
    const secondRead = reader.read(scope);

    second.resolve(model() as PatientLongitudinalReadModel);
    expect((await secondRead).status).toBe("current");
    first.resolve(model() as PatientLongitudinalReadModel);
    expect(await firstRead).toEqual({ status: "obsolete" });
  });

  it("invalidates an in-flight read when authorization or practice context changes", async () => {
    const pending = deferred<PatientLongitudinalReadModel>();
    const signals: AbortSignal[] = [];
    const reader = createLatestPatientLongitudinalReader((_requested, signal) => {
      signals.push(signal);
      return pending.promise;
    });
    const read = reader.read(scope);

    reader.invalidate();
    expect(signals[0]?.aborted).toBe(true);
    pending.resolve(model() as PatientLongitudinalReadModel);

    expect(await read).toEqual({ status: "obsolete" });
  });

  it("ignores an obsolete failure after a newer context has taken ownership", async () => {
    const first = deferred<PatientLongitudinalReadModel>();
    const second = deferred<PatientLongitudinalReadModel>();
    let invocation = 0;
    const reader = createLatestPatientLongitudinalReader(() => {
      invocation += 1;
      return invocation === 1 ? first.promise : second.promise;
    });

    const firstRead = reader.read(scope);
    const secondRead = reader.read(scope);
    first.reject(new Error("PATIENT_ACCESS_DENIED"));
    expect(await firstRead).toEqual({ status: "obsolete" });
    second.resolve(model() as PatientLongitudinalReadModel);
    expect((await secondRead).status).toBe("current");
  });

  it("surfaces current access failures instead of retaining old patient data", async () => {
    const reader = createLatestPatientLongitudinalReader(async () => {
      throw new Error("PATIENT_ACCESS_DENIED");
    });

    await expect(reader.read(scope)).rejects.toThrow("PATIENT_ACCESS_DENIED");
  });
});
