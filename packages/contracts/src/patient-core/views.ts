import type { PatientLongitudinalSummary } from "../patient-record-v2.js";
import type { PatientAllergyIntoleranceView } from "./allergies.js";
import type { PatientClinicalContextView } from "./contexts.js";
import type { PatientCoreCollection } from "./coverage.js";
import type { PatientMedicationStateView } from "./medications.js";
import type { PatientObservationView } from "./observations.js";
import type { PatientProblemView } from "./problems.js";
import type { PatientCoreScope } from "./provenance.js";

export const PATIENT_CLINICAL_CORE_SCHEMA_VERSION = 1 as const;
export type PatientClinicalCoreSchemaVersion =
  typeof PATIENT_CLINICAL_CORE_SCHEMA_VERSION;

export interface PatientContextIdentityView {
  scope: PatientCoreScope;
  /** `scope.patientId` must equal `patient.patientId`. */
  patient: PatientLongitudinalSummary;
}

/**
 * Versioned read-only contract shared by future Patient Core consumers.
 *
 * B2 defines the semantic envelope only. B3 owns the longitudinal projection
 * and change-detection implementation. Each collection carries explicit
 * completeness so an empty list cannot silently mean both "known empty" and
 * "not available to this projection".
 */
export interface PatientContextView {
  schemaVersion: PatientClinicalCoreSchemaVersion;
  generatedAt: string;
  identity: PatientContextIdentityView;
  allergies: PatientCoreCollection<PatientAllergyIntoleranceView>;
  problems: PatientCoreCollection<PatientProblemView>;
  medications: PatientCoreCollection<PatientMedicationStateView>;
  observations: PatientCoreCollection<PatientObservationView>;
  clinicalContexts: PatientCoreCollection<PatientClinicalContextView>;
}
