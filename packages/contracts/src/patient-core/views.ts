import type { PatientLongitudinalSummary } from "../patient-record-v2.js";
import type { PatientClinicalContextView } from "./contexts.js";
import type { PatientCoreEventView } from "./events.js";
import type { PatientMedicationStateView } from "./medications.js";
import type { PatientObservationView } from "./observations.js";
import type { PatientProblemView } from "./problems.js";

export const PATIENT_CLINICAL_CORE_SCHEMA_VERSION = 1 as const;
export type PatientClinicalCoreSchemaVersion =
  typeof PATIENT_CLINICAL_CORE_SCHEMA_VERSION;

export interface PatientContextIdentityView {
  practiceId: string;
  patient: PatientLongitudinalSummary;
}

/**
 * Canonical, read-only Adult Medicine patient-context projection.
 *
 * This view does not become a persistence authority. Empty arrays mean the
 * projection source did not provide that fact family; they must never be
 * interpreted as proof that the patient has no such facts.
 */
export interface PatientContextView {
  schemaVersion: PatientClinicalCoreSchemaVersion;
  generatedAt: string;
  identity: PatientContextIdentityView;
  problems: PatientProblemView[];
  medications: PatientMedicationStateView[];
  observations: PatientObservationView[];
  clinicalContexts: PatientClinicalContextView[];
  events: PatientCoreEventView[];
}
