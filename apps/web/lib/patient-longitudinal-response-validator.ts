import {
  PATIENT_CLINICAL_CORE_SCHEMA_VERSION,
  PATIENT_LONGITUDINAL_READ_MODEL_SCHEMA_VERSION,
  patientAllergyCategories,
  patientAllergyCriticalities,
  patientAllergyStatuses,
  patientChangeCoverageStates,
  patientChangeFamilies,
  patientChangeKinds,
  patientClinicalContextStates,
  patientCoreCollectionCompletenessStates,
  patientCoreCollectionGapReasons,
  patientCoreEventTypes,
  patientCoreFreshnessStates,
  patientCoreSourceTypes,
  patientCoreVerificationStates,
  patientMedicationAdherenceStates,
  patientMedicationSourceStates,
  patientMedicationStatuses,
  patientProblemStatuses,
  type PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";

export type PatientLongitudinalExpectedScope = {
  practiceId: string;
  patientId: string;
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

function isScalar(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function invalidResponse(): never {
  throw new Error("PATIENT_LONGITUDINAL_INVALID_RESPONSE");
}

function assertScope(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  if (
    !isRecord(value) ||
    value.patientId !== expected.patientId ||
    value.practiceId !== expected.practiceId
  ) {
    throw new Error("PATIENT_LONGITUDINAL_SCOPE_MISMATCH");
  }
}

function assertSourceReference(value: unknown) {
  if (
    !isRecord(value) ||
    !oneOf(patientCoreSourceTypes, value.sourceType) ||
    !hasString(value, "recordType") ||
    !hasString(value, "recordId") ||
    !optionalString(value, "encounterId") ||
    !optionalString(value, "documentId")
  ) {
    invalidResponse();
  }
}

function assertFactMeta(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  if (
    !isRecord(value) ||
    !oneOf(patientCoreFreshnessStates, value.freshness) ||
    !oneOf(patientCoreVerificationStates, value.verification) ||
    !optionalString(value, "effectiveAt") ||
    !optionalString(value, "recordedAt") ||
    (value.revision !== undefined &&
      (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0))
  ) {
    invalidResponse();
  }
  assertScope(value.scope, expected);
  assertSourceReference(value.source);
}

function assertCollectionEnvelope(
  value: unknown,
): Record<string, unknown> & { items: unknown[] } {
  if (
    !isRecord(value) ||
    !oneOf(patientCoreCollectionCompletenessStates, value.completeness) ||
    !Array.isArray(value.items) ||
    (value.gapReason !== undefined && !oneOf(patientCoreCollectionGapReasons, value.gapReason)) ||
    !optionalString(value, "asOf")
  ) {
    invalidResponse();
  }
  return value as Record<string, unknown> & { items: unknown[] };
}

function assertFactBase(
  item: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  if (
    !isRecord(item) ||
    !hasString(item, "factId") ||
    !hasString(item, "factKey") ||
    !hasString(item, "displayName")
  ) {
    invalidResponse();
  }
  assertFactMeta(item.meta, expected);
  return item;
}

function assertAllergies(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  const collection = assertCollectionEnvelope(value);
  for (const raw of collection.items) {
    const item = assertFactBase(raw, expected);
    if (
      !oneOf(patientAllergyCategories, item.category) ||
      !oneOf(patientAllergyStatuses, item.status) ||
      !oneOf(patientAllergyCriticalities, item.criticality)
    ) {
      invalidResponse();
    }
  }
}

function assertProblems(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  const collection = assertCollectionEnvelope(value);
  for (const raw of collection.items) {
    const item = assertFactBase(raw, expected);
    if (!oneOf(patientProblemStatuses, item.status)) invalidResponse();
  }
}

function assertMedications(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  const collection = assertCollectionEnvelope(value);
  for (const raw of collection.items) {
    const item = assertFactBase(raw, expected);
    if (
      !oneOf(patientMedicationStatuses, item.status) ||
      !oneOf(patientMedicationSourceStates, item.sourceState) ||
      !oneOf(patientMedicationAdherenceStates, item.adherence)
    ) {
      invalidResponse();
    }
  }
}

function assertObservations(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  const collection = assertCollectionEnvelope(value);
  for (const raw of collection.items) {
    const item = assertFactBase(raw, expected);
    if (
      !hasString(item, "observedAt") ||
      !["string", "number", "boolean"].includes(typeof item.value)
    ) {
      invalidResponse();
    }
  }
}

function assertClinicalContexts(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  const collection = assertCollectionEnvelope(value);
  for (const raw of collection.items) {
    const item = assertFactBase(raw, expected);
    if (
      !oneOf(patientClinicalContextStates, item.state) ||
      (item.value !== undefined && !["string", "number", "boolean"].includes(typeof item.value))
    ) {
      invalidResponse();
    }
  }
}

function assertPatientIdentity(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  if (!isRecord(value) || !isRecord(value.patient)) invalidResponse();
  assertScope(value.scope, expected);

  const patient = value.patient;
  if (
    patient.patientId !== expected.patientId ||
    !oneOf(["active", "archived"] as const, patient.status) ||
    !Array.isArray(patient.identifiers) ||
    !optionalString(patient, "latestEncounterAt")
  ) {
    if (patient.patientId !== expected.patientId) {
      throw new Error("PATIENT_LONGITUDINAL_SCOPE_MISMATCH");
    }
    invalidResponse();
  }

  for (const identifier of patient.identifiers) {
    if (
      !isRecord(identifier) ||
      !hasString(identifier, "id") ||
      !oneOf(["file_number", "national_id", "other"] as const, identifier.kind) ||
      typeof identifier.displayMask !== "string" ||
      typeof identifier.isPrimary !== "boolean"
    ) {
      invalidResponse();
    }
  }

  if (patient.demographics !== undefined) {
    if (!isRecord(patient.demographics)) invalidResponse();
    if (
      !optionalString(patient.demographics, "firstName") ||
      !optionalString(patient.demographics, "lastName") ||
      !optionalString(patient.demographics, "dateOfBirth")
    ) {
      invalidResponse();
    }
  }
}

function assertTimeline(value: unknown) {
  const timeline = assertCollectionEnvelope(value);
  for (const raw of timeline.items) {
    if (
      !isRecord(raw) ||
      !hasString(raw, "eventId") ||
      !oneOf(patientCoreEventTypes, raw.eventType) ||
      !hasString(raw, "effectiveAt") ||
      !optionalString(raw, "status") ||
      !optionalString(raw, "label")
    ) {
      invalidResponse();
    }
    assertSourceReference(raw.source);
  }
}

function assertChangeAnchor(value: unknown) {
  if (
    !isRecord(value) ||
    !hasString(value, "encounterId") ||
    !hasString(value, "effectiveAt") ||
    typeof value.snapshotRevision !== "number" ||
    !Number.isInteger(value.snapshotRevision) ||
    value.snapshotRevision < 0
  ) {
    invalidResponse();
  }
}

function assertChanges(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !hasString(value, "generatedAt") ||
    !oneOf(["complete", "partial", "unavailable"] as const, value.comparisonStatus) ||
    !Array.isArray(value.coverage) ||
    !Array.isArray(value.changes)
  ) {
    invalidResponse();
  }
  assertScope(value.scope, expected);

  if (value.baseline !== undefined) assertChangeAnchor(value.baseline);
  if (value.current !== undefined) assertChangeAnchor(value.current);

  for (const coverage of value.coverage) {
    if (
      !isRecord(coverage) ||
      !oneOf(["allergy", "problem", "medication", "observation", "clinical_context"] as const, coverage.family) ||
      !oneOf(patientChangeCoverageStates, coverage.state) ||
      !optionalString(coverage, "reason")
    ) {
      invalidResponse();
    }
  }

  for (const change of value.changes) {
    if (
      !isRecord(change) ||
      !hasString(change, "changeId") ||
      !oneOf(patientChangeFamilies, change.family) ||
      !oneOf(patientChangeKinds, change.kind) ||
      !hasString(change, "subjectKey") ||
      !hasString(change, "displayName") ||
      !optionalString(change, "effectiveAt") ||
      (change.deltas !== undefined && !Array.isArray(change.deltas))
    ) {
      invalidResponse();
    }
    if (change.source !== undefined) assertSourceReference(change.source);
    if (Array.isArray(change.deltas)) {
      for (const delta of change.deltas) {
        if (
          !isRecord(delta) ||
          !hasString(delta, "field") ||
          (delta.before !== undefined && !isScalar(delta.before)) ||
          (delta.after !== undefined && !isScalar(delta.after))
        ) {
          invalidResponse();
        }
      }
    }
  }
}

export function parsePatientLongitudinalReadModel(
  value: unknown,
  expected: PatientLongitudinalExpectedScope,
): PatientLongitudinalReadModel {
  if (!isRecord(value)) invalidResponse();
  if (value.schemaVersion !== PATIENT_LONGITUDINAL_READ_MODEL_SCHEMA_VERSION) {
    throw new Error("PATIENT_LONGITUDINAL_UNSUPPORTED_VERSION");
  }
  if (!hasString(value, "generatedAt") || !isRecord(value.context)) invalidResponse();

  const context = value.context;
  if (
    context.schemaVersion !== PATIENT_CLINICAL_CORE_SCHEMA_VERSION ||
    !hasString(context, "generatedAt")
  ) {
    invalidResponse();
  }

  assertPatientIdentity(context.identity, expected);
  assertAllergies(context.allergies, expected);
  assertProblems(context.problems, expected);
  assertMedications(context.medications, expected);
  assertObservations(context.observations, expected);
  assertClinicalContexts(context.clinicalContexts, expected);
  assertTimeline(value.timeline);
  assertChanges(value.changesSincePreviousEncounter, expected);

  return value as unknown as PatientLongitudinalReadModel;
}
