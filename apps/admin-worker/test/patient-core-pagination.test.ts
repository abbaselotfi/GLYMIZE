import { describe, expect, it } from "vitest";
import {
  decodePatientObservationCursor,
  decodePatientTimelineCursor,
  encodePatientObservationCursor,
  encodePatientTimelineCursor,
  normalizePatientCorePageSize,
  PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE,
  PATIENT_CORE_MAX_PAGE_SIZE,
} from "../src/patient-core/pagination";

const scope = { practiceId: "practice-1", patientId: "patient-1" };
const sourceVersion = "2026-09-09T10:00:00.000Z";
const secret = "cursor-secret";

describe("Patient Core history cursors", () => {
  it("round-trips observation and timeline positions with the frozen source version", async () => {
    const observation = await encodePatientObservationCursor(scope, sourceVersion, {
      observedAt: "2026-08-01T08:00:00.000Z",
      createdAt: "2026-08-01T09:00:00.000Z",
      id: "obs-10",
    }, secret);
    await expect(decodePatientObservationCursor(observation, scope, secret)).resolves.toEqual({
      sourceVersion,
      position: {
        observedAt: "2026-08-01T08:00:00.000Z",
        createdAt: "2026-08-01T09:00:00.000Z",
        id: "obs-10",
      },
    });

    const timeline = await encodePatientTimelineCursor(scope, sourceVersion, {
      effectiveAt: "2026-08-01T08:00:00.000Z",
      eventId: "encounter:enc-10",
    }, secret);
    await expect(decodePatientTimelineCursor(timeline, scope, secret)).resolves.toEqual({
      sourceVersion,
      position: {
        effectiveAt: "2026-08-01T08:00:00.000Z",
        eventId: "encounter:enc-10",
      },
    });
  });

  it("rejects cross-patient, cross-practice and cross-family cursor reuse", async () => {
    const observation = await encodePatientObservationCursor(scope, sourceVersion, {
      observedAt: "2026-08-01T08:00:00.000Z",
      createdAt: "2026-08-01T09:00:00.000Z",
      id: "obs-10",
    }, secret);

    await expect(decodePatientObservationCursor(observation, {
      ...scope,
      patientId: "patient-2",
    }, secret)).rejects.toThrow("PATIENT_HISTORY_CURSOR_SCOPE_MISMATCH");
    await expect(decodePatientObservationCursor(observation, {
      ...scope,
      practiceId: "practice-2",
    }, secret)).rejects.toThrow("PATIENT_HISTORY_CURSOR_SCOPE_MISMATCH");
    await expect(decodePatientTimelineCursor(observation, scope, secret)).rejects.toThrow(
      "PATIENT_HISTORY_CURSOR_SCOPE_MISMATCH",
    );
  });

  it("rejects tampering and cursors signed with another secret", async () => {
    const cursor = await encodePatientObservationCursor(scope, sourceVersion, {
      observedAt: "2026-08-01T08:00:00.000Z",
      createdAt: "2026-08-01T09:00:00.000Z",
      id: "obs-10",
    }, secret);
    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith("a") ? "b" : "a"}`;

    await expect(decodePatientObservationCursor(tampered, scope, secret)).rejects.toThrow(
      "PATIENT_HISTORY_CURSOR_INVALID",
    );
    await expect(decodePatientObservationCursor(cursor, scope, "different-secret")).rejects.toThrow(
      "PATIENT_HISTORY_CURSOR_INVALID",
    );
  });

  it("clamps arbitrary page sizes without allowing an unbounded request", () => {
    expect(normalizePatientCorePageSize(undefined, PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE)).toBe(80);
    expect(normalizePatientCorePageSize(0, 80)).toBe(1);
    expect(normalizePatientCorePageSize(50.9, 80)).toBe(50);
    expect(normalizePatientCorePageSize(50_000, 80)).toBe(PATIENT_CORE_MAX_PAGE_SIZE);
  });
});
