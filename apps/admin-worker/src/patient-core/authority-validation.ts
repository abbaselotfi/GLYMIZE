import {
  PATIENT_CORE_AUTHORITY_WRITE_SCHEMA_VERSION,
  patientAllergyCategories,
  patientAllergyCriticalities,
  patientAllergyStatuses,
  patientCoreAuthorityFamilies,
  patientCoreAuthorityReconciliationStates,
  patientCoreAuthorityVerificationIntents,
  patientCoreSourceTypes,
  patientCoreVerificationStates,
  patientProblemStatuses,
  type PatientCoreAllergyMutationInput,
  type PatientCoreCollectionReconciliationInput,
  type PatientCoreProblemMutationInput,
} from "@glymize/contracts/patient-core";

const MAX_TEXT = 240;
const MAX_ID = 180;
const MAX_REACTIONS = 20;
const MAX_RELATED_PROBLEMS = 50;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function optionalText(value: unknown, max = MAX_TEXT) {
  return value === undefined || text(value, max);
}

function oneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function validExpectedRevision(value: unknown) {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 1);
}

function validMutationIdentity(value: Record<string, unknown>) {
  const hasFactId = value.factId !== undefined;
  const hasExpected = value.expectedRevision !== undefined;
  return hasFactId === hasExpected &&
    (!hasFactId || text(value.factId, MAX_ID)) &&
    validExpectedRevision(value.expectedRevision);
}

function validSource(value: unknown) {
  if (!record(value)) return false;
  return oneOf(patientCoreSourceTypes, value.sourceType) &&
    text(value.recordType, MAX_ID) &&
    text(value.recordId, MAX_ID) &&
    optionalText(value.encounterId, MAX_ID) &&
    optionalText(value.documentId, MAX_ID);
}

function validVerification(value: Record<string, unknown>) {
  if (!oneOf(patientCoreVerificationStates, value.verification)) return false;
  if (
    value.verificationIntent !== undefined &&
    !oneOf(patientCoreAuthorityVerificationIntents, value.verificationIntent)
  ) return false;
  if (value.verification !== "verified") return true;

  if (value.verificationIntent === "direct_clinician_entry") {
    return record(value.source) &&
      (value.source.sourceType === "patient_record_v2" || value.source.sourceType === "other");
  }

  if (value.verificationIntent === "clinician_review_of_external_source") {
    return record(value.source) && value.source.sourceType !== "derived_projection";
  }

  return false;
}

function validMutationBase(value: Record<string, unknown>) {
  return value.schemaVersion === PATIENT_CORE_AUTHORITY_WRITE_SCHEMA_VERSION &&
    validMutationIdentity(value) &&
    text(value.displayName) &&
    validVerification(value) &&
    validSource(value.source) &&
    optionalText(value.effectiveAt, 80);
}

function validReaction(value: unknown) {
  if (!record(value) || !text(value.displayName)) return false;
  return value.severity === undefined ||
    ["mild", "moderate", "severe", "unknown"].includes(String(value.severity));
}

export function parsePatientCoreAllergyMutation(
  value: unknown,
): PatientCoreAllergyMutationInput {
  if (!record(value) || !validMutationBase(value)) {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
  if (
    !oneOf(patientAllergyCategories, value.category) ||
    !oneOf(patientAllergyStatuses, value.status) ||
    !oneOf(patientAllergyCriticalities, value.criticality) ||
    !optionalText(value.substanceKey, MAX_ID) ||
    !optionalText(value.medicationId, MAX_ID) ||
    !optionalText(value.onsetAt, 80) ||
    !optionalText(value.resolvedAt, 80) ||
    (value.reactions !== undefined &&
      (!Array.isArray(value.reactions) ||
        value.reactions.length > MAX_REACTIONS ||
        value.reactions.some((item) => !validReaction(item))))
  ) {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
  return value as unknown as PatientCoreAllergyMutationInput;
}

function validCoding(value: unknown) {
  return record(value) &&
    text(value.system, MAX_ID) &&
    text(value.code, MAX_ID) &&
    optionalText(value.display);
}

export function parsePatientCoreProblemMutation(
  value: unknown,
): PatientCoreProblemMutationInput {
  if (!record(value) || !validMutationBase(value)) {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
  if (
    !oneOf(patientProblemStatuses, value.status) ||
    (value.coding !== undefined && !validCoding(value.coding)) ||
    !optionalText(value.onsetAt, 80) ||
    !optionalText(value.resolvedAt, 80) ||
    (value.relatedProblemFactIds !== undefined &&
      (!Array.isArray(value.relatedProblemFactIds) ||
        value.relatedProblemFactIds.length > MAX_RELATED_PROBLEMS ||
        value.relatedProblemFactIds.some((item) => !text(item, MAX_ID)) ||
        new Set(value.relatedProblemFactIds).size !== value.relatedProblemFactIds.length))
  ) {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
  return value as unknown as PatientCoreProblemMutationInput;
}

export function parsePatientCoreCollectionReconciliation(
  value: unknown,
): PatientCoreCollectionReconciliationInput {
  if (
    !record(value) ||
    value.schemaVersion !== PATIENT_CORE_AUTHORITY_WRITE_SCHEMA_VERSION ||
    !oneOf(patientCoreAuthorityFamilies, value.family) ||
    !oneOf(patientCoreAuthorityReconciliationStates, value.completeness) ||
    !validExpectedRevision(value.expectedRevision) ||
    !validSource(value.source) ||
    !optionalText(value.reconciledAt, 80)
  ) {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
  return value as unknown as PatientCoreCollectionReconciliationInput;
}
