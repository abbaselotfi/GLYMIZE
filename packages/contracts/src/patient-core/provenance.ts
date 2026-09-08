export const patientCoreFreshnessStates = [
  "current",
  "stale",
  "unknown",
] as const;
export type PatientCoreFreshness =
  (typeof patientCoreFreshnessStates)[number];

export const patientCoreVerificationStates = [
  "verified",
  "unverified",
  "rejected",
  "unknown",
] as const;
export type PatientCoreVerification =
  (typeof patientCoreVerificationStates)[number];

export const patientCoreSourceTypes = [
  "patient_record_v2",
  "physician_order",
  "patient_reported",
  "document",
  "derived_projection",
  "other",
] as const;
export type PatientCoreSourceType =
  (typeof patientCoreSourceTypes)[number];

export interface PatientCoreSourceReference {
  sourceType: PatientCoreSourceType;
  recordType: string;
  recordId: string;
  encounterId?: string;
  documentId?: string;
}

/**
 * Cross-domain metadata for a reusable clinical fact.
 *
 * `freshness` is explicit rather than inferred here. Individual clinical
 * modules may define reviewed freshness requirements, but the shared contract
 * must not invent a universal clinical staleness threshold.
 */
export interface PatientCoreFactMeta {
  source: PatientCoreSourceReference;
  effectiveAt?: string;
  recordedAt?: string;
  freshness: PatientCoreFreshness;
  verification: PatientCoreVerification;
  revision?: number;
}
