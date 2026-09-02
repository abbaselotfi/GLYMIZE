/**
 * P5-A global patient identity contracts.
 *
 * A patient account is global. The legacy link summaries below describe only
 * a reviewed bridge to a practice-local Portal identity; they do not model or
 * grant a P5-B care relationship.
 */

export const patientProofingStatuses = [
  "unverified",
  "pending",
  "verified",
  "rejected",
] as const;
export type PatientProofingStatus = (typeof patientProofingStatuses)[number];

export const patientLegacyLinkStatuses = [
  "pending",
  "verified",
  "rejected",
  "revoked",
] as const;
export type PatientLegacyLinkStatus = (typeof patientLegacyLinkStatuses)[number];

export const patientLegacyLinkProvenances = [
  "practice_confirmation",
  "admin_review",
  "legacy_review",
] as const;
export type PatientLegacyLinkProvenance =
  (typeof patientLegacyLinkProvenances)[number];

export const patientLegacyLinkVerificationMethods = [
  "in_person_document_review",
  "existing_portal_reauthentication",
  "verified_contact_callback",
] as const;
export type PatientLegacyLinkVerificationMethod =
  (typeof patientLegacyLinkVerificationMethods)[number];

export interface PatientIdentityCapabilities {
  patientIdentityV2: boolean;
  selfRegistration: boolean;
  smsOtp: boolean;
  recordLinking: boolean;
}

export interface GlobalPatientAccountSummary {
  id: string;
  status: "active" | "disabled" | "closed";
  proofingStatus: PatientProofingStatus;
  linkedClinicalRecord: boolean;
}

export interface PatientIdentityRegistrationInput {
  nationalId: string;
  password: string;
}

export interface PatientIdentityRegistrationResult {
  accountId: string;
  proofingStatus: "unverified";
  linkedClinicalRecord: false;
}

export interface PatientIdentityLoginInput {
  nationalId: string;
  password: string;
  rememberMe?: boolean;
  deviceLabel?: string;
}

export interface PatientIdentitySessionResult {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  persistent: boolean;
  account: GlobalPatientAccountSummary;
}

export interface PatientIdentitySessionView {
  account: GlobalPatientAccountSummary;
}

export interface PatientVerifiedLegacyLinkSummary {
  portalUserId: string;
  practiceId: string;
  practiceName: string;
  provenance: PatientLegacyLinkProvenance;
  verifiedAt: string;
}

export interface PatientLinkedPortalSessionResult {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  persistent: boolean;
  mustChangePassword: false;
}

export interface PatientLegacyLinkReviewSummary {
  portalUserId: string;
  patientAccountId: string;
  practiceId: string;
  status: PatientLegacyLinkStatus;
  provenance: PatientLegacyLinkProvenance;
  verificationMethod: PatientLegacyLinkVerificationMethod;
  requestedByRuntimeUserId?: string;
  verifiedByRuntimeUserId?: string;
  verifiedAt?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientLegacyLinkRequestInput {
  portalUserId: string;
  patientAccountId: string;
  provenance: PatientLegacyLinkProvenance;
  verificationMethod: PatientLegacyLinkVerificationMethod;
}

export interface PatientLegacyLinkDecisionInput {
  confirmed: true;
}
