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
  "referral",
  "care_relationship",
  "system_import",
  "derived_projection",
  "other",
] as const;
export type PatientCoreSourceType =
  (typeof patientCoreSourceTypes)[number];

/** Practice-local clinical scope remains explicit even when global identity exists. */
export interface PatientCoreScope {
  practiceId: string;
  patientId: string;
}

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
 * `freshness` is explicit rather than inferred here. Individual reviewed
 * clinical modules may define freshness requirements; the shared core must not
 * invent a universal staleness threshold.
 */
export interface PatientCoreFactMeta {
  scope: PatientCoreScope;
  source: PatientCoreSourceReference;
  effectiveAt?: string;
  recordedAt?: string;
  freshness: PatientCoreFreshness;
  verification: PatientCoreVerification;
  revision?: number;
}
