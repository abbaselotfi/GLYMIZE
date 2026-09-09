import {
  PATIENT_LONGITUDINAL_HISTORY_PAGE_SCHEMA_VERSION,
  patientCoreCollectionCompletenessStates,
  patientCoreCollectionGapReasons,
  patientCoreEventTypes,
  patientCoreFreshnessStates,
  patientCoreSourceTypes,
  patientCoreVerificationStates,
  type PatientLongitudinalHistoryFamily,
  type PatientLongitudinalHistoryPage,
} from "@glymize/contracts/patient-core";
import { validatePatientCoreCollectionContinuation } from "./patient-longitudinal-continuation-validator";

export type PatientLongitudinalHistoryExpectedScope = {
  practiceId: string;
  patientId: string;
  family: PatientLongitudinalHistoryFamily;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" && value[key] !== "";
}

function optionalString(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || typeof value[key] === "string";
}

function oneOf<const T extends readonly string[]>(options: T, value: unknown): value is T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

function invalid(): never {
  throw new Error("PATIENT_LONGITUDINAL_HISTORY_INVALID_RESPONSE");
}

function assertScope(value: unknown, expected: PatientLongitudinalHistoryExpectedScope) {
  if (
    !isRecord(value) ||
    value.practiceId !== expected.practiceId ||
    value.patientId !== expected.patientId
  ) {
    throw new Error("PATIENT_LONGITUDINAL_HISTORY_SCOPE_MISMATCH");
  }
}

function assertSource(value: unknown) {
  if (
    !isRecord(value) ||
    !oneOf(patientCoreSourceTypes, value.sourceType) ||
    !hasString(value, "recordType") ||
    !hasString(value, "recordId") ||
    !optionalString(value, "encounterId") ||
    !optionalString(value, "documentId")
  ) {
    invalid();
  }
}

function assertDiagnostics(value: unknown) {
  if (value === undefined) return;
  if (!isRecord(value) || !hasString(value, "sourceScope")) invalid();
  if (value.exclusions !== undefined && !Array.isArray(value.exclusions)) invalid();
}

function assertCollection(value: unknown) {
  if (
    !isRecord(value) ||
    !oneOf(patientCoreCollectionCompletenessStates, value.completeness) ||
    !Array.isArray(value.items) ||
    (value.gapReason !== undefined && !oneOf(patientCoreCollectionGapReasons, value.gapReason)) ||
    !optionalString(value, "asOf")
  ) {
    invalid();
  }
  try {
    validatePatientCoreCollectionContinuation(value, undefined, true);
  } catch {
    invalid();
  }
  assertDiagnostics(value.diagnostics);
  return value as Record<string, unknown> & { items: unknown[] };
}

function assertObservation(
  value: unknown,
  expected: PatientLongitudinalHistoryExpectedScope,
) {
  if (
    !isRecord(value) ||
    !hasString(value, "factId") ||
    !hasString(value, "factKey") ||
    !hasString(value, "displayName") ||
    !hasString(value, "observedAt") ||
    !["string", "number", "boolean"].includes(typeof value.value) ||
    !isRecord(value.meta) ||
    !oneOf(patientCoreFreshnessStates, value.meta.freshness) ||
    !oneOf(patientCoreVerificationStates, value.meta.verification)
  ) {
    invalid();
  }
  assertScope(value.meta.scope, expected);
  assertSource(value.meta.source);
}

function assertEvent(value: unknown) {
  if (
    !isRecord(value) ||
    !hasString(value, "eventId") ||
    !oneOf(patientCoreEventTypes, value.eventType) ||
    !hasString(value, "effectiveAt") ||
    !optionalString(value, "status") ||
    !optionalString(value, "label")
  ) {
    invalid();
  }
  assertSource(value.source);
}

export function parsePatientLongitudinalHistoryPage(
  value: unknown,
  expected: PatientLongitudinalHistoryExpectedScope,
): PatientLongitudinalHistoryPage {
  if (
    !isRecord(value) ||
    value.schemaVersion !== PATIENT_LONGITUDINAL_HISTORY_PAGE_SCHEMA_VERSION ||
    value.family !== expected.family ||
    !hasString(value, "generatedAt")
  ) {
    invalid();
  }
  assertScope(value.scope, expected);
  const collection = assertCollection(value.collection);

  if (expected.family === "observations") {
    for (const item of collection.items) assertObservation(item, expected);
  } else {
    for (const item of collection.items) assertEvent(item);
  }
  return value as unknown as PatientLongitudinalHistoryPage;
}
