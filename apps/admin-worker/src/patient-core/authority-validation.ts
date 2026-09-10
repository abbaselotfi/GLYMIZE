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

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

function validCalendarDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return false;

  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  const days = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= days[month - 1]!;
}

function validIsoDate(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return false;

  const match = value.match(ISO_DATE_PATTERN);
  if (!match) return false;

  return validCalendarDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

function validRfc3339Instant(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return false;

  const match = value.match(RFC3339_INSTANT_PATTERN);
  if (!match) return false;

  if (
    !validCalendarDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    )
  ) {
    return false;
  }

  if (
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59
  ) {
    return false;
  }

  const offset = match[8]!;

  if (offset !== "Z") {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));

    if (offsetHour > 23 || offsetMinute > 59) {
      return false;
    }
  }

  return true;
}

function optionalClinicalDateTime(value: unknown) {
  return value === undefined ||
    validIsoDate(value) ||
    validRfc3339Instant(value);
}

function optionalRfc3339Instant(value: unknown) {
  return value === undefined || validRfc3339Instant(value);
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
    optionalClinicalDateTime(value.effectiveAt);
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
    !optionalClinicalDateTime(value.onsetAt) ||
    !optionalClinicalDateTime(value.resolvedAt) ||
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
    !optionalClinicalDateTime(value.onsetAt) ||
    !optionalClinicalDateTime(value.resolvedAt) ||
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
    !optionalRfc3339Instant(value.reconciledAt)
  ) {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
  return value as unknown as PatientCoreCollectionReconciliationInput;
}
