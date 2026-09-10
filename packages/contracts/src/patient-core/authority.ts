import type {
  PatientAllergyCategory,
  PatientAllergyCriticality,
  PatientAllergyReactionView,
  PatientAllergyStatus,
} from "./allergies.js";
import type { PatientCoreSourceReference, PatientCoreVerification } from "./provenance.js";
import type { PatientProblemCoding, PatientProblemStatus } from "./problems.js";

export const PATIENT_CORE_AUTHORITY_WRITE_SCHEMA_VERSION = 1 as const;
export type PatientCoreAuthorityWriteSchemaVersion =
  typeof PATIENT_CORE_AUTHORITY_WRITE_SCHEMA_VERSION;

export const patientCoreAuthorityFamilies = ["allergy", "problem"] as const;
export type PatientCoreAuthorityFamily =
  (typeof patientCoreAuthorityFamilies)[number];

export const patientCoreAuthorityReconciliationStates = [
  "partial",
  "complete",
] as const;
export type PatientCoreAuthorityReconciliationState =
  (typeof patientCoreAuthorityReconciliationStates)[number];

export const patientCoreAuthorityVerificationIntents = [
  "direct_clinician_entry",
  "clinician_review_of_external_source",
] as const;
export type PatientCoreAuthorityVerificationIntent =
  (typeof patientCoreAuthorityVerificationIntents)[number];

export interface PatientCoreAuthorityMutationBase {
  schemaVersion: PatientCoreAuthorityWriteSchemaVersion;
  /** Omit for create; required together with expectedRevision for revision. */
  factId?: string;
  /** Omit for create. Existing facts require exact optimistic revision match. */
  expectedRevision?: number;
  displayName: string;
  verification: PatientCoreVerification;
  verificationIntent?: PatientCoreAuthorityVerificationIntent;
  source: PatientCoreSourceReference;
  effectiveAt?: string;
}

export interface PatientCoreAllergyMutationInput
  extends PatientCoreAuthorityMutationBase {
  category: PatientAllergyCategory;
  status: PatientAllergyStatus;
  criticality: PatientAllergyCriticality;
  substanceKey?: string;
  medicationId?: string;
  reactions?: PatientAllergyReactionView[];
  onsetAt?: string;
  resolvedAt?: string;
}

export interface PatientCoreProblemMutationInput
  extends PatientCoreAuthorityMutationBase {
  status: PatientProblemStatus;
  coding?: PatientProblemCoding;
  onsetAt?: string;
  resolvedAt?: string;
  relatedProblemFactIds?: string[];
}

export interface PatientCoreCollectionReconciliationInput {
  schemaVersion: PatientCoreAuthorityWriteSchemaVersion;
  family: PatientCoreAuthorityFamily;
  completeness: PatientCoreAuthorityReconciliationState;
  /** Omit for first reconciliation; otherwise exact optimistic revision match. */
  expectedRevision?: number;
  source: PatientCoreSourceReference;
  reconciledAt?: string;
}

export interface PatientCoreAuthorityFactWriteResult {
  schemaVersion: PatientCoreAuthorityWriteSchemaVersion;
  family: PatientCoreAuthorityFamily;
  factId: string;
  revision: number;
  recordedAt: string;
}

export interface PatientCoreCollectionReconciliationResult {
  schemaVersion: PatientCoreAuthorityWriteSchemaVersion;
  family: PatientCoreAuthorityFamily;
  revision: number;
  completeness: PatientCoreAuthorityReconciliationState;
  reconciledAt: string;
}
