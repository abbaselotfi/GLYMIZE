import type {
  PatientCoreFreshness,
  PatientCoreScope,
  PatientCoreVerification,
} from "./patient-core/provenance.js";

export const clinicalModuleLifecycleStates = [
  "foundation",
  "read_only_context",
  "pilot_decision_support",
  "reviewed_decision_support",
  "release_eligible",
  "deprecated",
] as const;
export type ClinicalModuleLifecycleState =
  (typeof clinicalModuleLifecycleStates)[number];

/** Temporary labels used by the pre-F1 launcher. Kept only for explicit migration mapping. */
export const legacyClinicalModuleMaturityStates = [
  "reviewed_cds",
  "reviewed_tool",
  "reference_only",
] as const;
export type LegacyClinicalModuleMaturity =
  (typeof legacyClinicalModuleMaturityStates)[number];

export const clinicalModuleKinds = [
  "clinical_module",
  "clinical_tool",
  "cross_cutting_context",
] as const;
export type ClinicalModuleKind = (typeof clinicalModuleKinds)[number];

/**
 * Registration never grants treatment authority. The authority value is explicit
 * and intentionally narrower than module maturity or UI visibility.
 */
export const clinicalModuleTreatmentAuthorities = [
  "none",
  "type2_decision_graph_v2",
] as const;
export type ClinicalModuleTreatmentAuthority =
  (typeof clinicalModuleTreatmentAuthorities)[number];

/** Release eligibility remains a separate gate from registration and maturity. */
export const clinicalModuleReleaseEligibilityStates = [
  "not_assessed",
  "blocked",
  "release_eligible",
] as const;
export type ClinicalModuleReleaseEligibility =
  (typeof clinicalModuleReleaseEligibilityStates)[number];

export const patientModuleInputKeys = [
  "current_hba1c",
  "egfr",
  "creatinine_clearance",
  "uacr",
  "potassium",
  "ascvd",
  "heart_failure",
  "ckd",
  "dialysis",
  "diabetic_foot",
  "masld_mash",
  "hypoglycemia_risk",
] as const;
export type PatientModuleInputKey = (typeof patientModuleInputKeys)[number];

export const patientModuleContextAdapters = [
  "none",
  "type2_patient_core_v1",
] as const;
export type PatientModuleContextAdapter =
  (typeof patientModuleContextAdapters)[number];

export interface ClinicalModuleRegistration {
  id: string;
  kind: ClinicalModuleKind;
  route: string;
  /** Explicit migration breadcrumb from the launcher labels that pre-date F1. */
  legacyMaturity: LegacyClinicalModuleMaturity;
  maturity: ClinicalModuleLifecycleState;
  treatmentAuthority: ClinicalModuleTreatmentAuthority;
  releaseEligibility: ClinicalModuleReleaseEligibility;
  patientContextAdapter: PatientModuleContextAdapter;
  requiredPatientInputs: PatientModuleInputKey[];
  optionalPatientInputs: PatientModuleInputKey[];
}

export const PATIENT_MODULE_HANDOFF_SCHEMA_VERSION = 1 as const;

/**
 * Revision-only reference used to prove the destination is reviewing the same
 * Patient Core source material that the clinician launched from.
 *
 * No clinical value belongs in this transport object.
 */
export interface PatientModuleSourceRevision {
  factId: string;
  revision: number;
  verification: PatientCoreVerification;
  freshness: PatientCoreFreshness;
}

/**
 * One-tab navigation descriptor. The destination must re-read Patient Core,
 * revalidate practice/patient scope and compare the source revisions before any
 * candidate value can be shown for confirmation or applied to a module form.
 */
export interface PatientModuleHandoffIntent {
  schemaVersion: typeof PATIENT_MODULE_HANDOFF_SCHEMA_VERSION;
  moduleId: string;
  scope: PatientCoreScope;
  sourceRevisionFingerprint: string;
  sourceRevisions: PatientModuleSourceRevision[];
}
