import type { PatientCoreFactBase } from "./facts.js";

export const patientMedicationStatuses = [
  "active",
  "held",
  "stopped",
  "uncertain",
] as const;
export type PatientMedicationStatus =
  (typeof patientMedicationStatuses)[number];

export const patientMedicationSourceStates = [
  "prescribed",
  "patient_reported",
  "reconciled",
  "unknown",
] as const;
export type PatientMedicationSourceState =
  (typeof patientMedicationSourceStates)[number];

export const patientMedicationAdherenceStates = [
  "taking_as_prescribed",
  "taking_differently",
  "not_taking",
  "unknown",
] as const;
export type PatientMedicationAdherenceState =
  (typeof patientMedicationAdherenceStates)[number];

/**
 * Structural stage of the immutable encounter snapshot that supplied a
 * reconciled medication fact. This is not a prescribing or approval state.
 * Signed physician orders remain separate workflow objects.
 */
export const patientMedicationReconciliationStages = [
  "clinical_snapshot",
  "care_team_snapshot",
  "physician_review_snapshot",
  "final_snapshot",
] as const;
export type PatientMedicationReconciliationStage =
  (typeof patientMedicationReconciliationStages)[number];

export interface PatientMedicationStateView extends PatientCoreFactBase {
  /** Stable catalogue/master-registry identity when an explicit link exists. */
  medicationId?: string;
  status: PatientMedicationStatus;
  sourceState: PatientMedicationSourceState;
  adherence: PatientMedicationAdherenceState;
  reconciliationStage?: PatientMedicationReconciliationStage;
  dose?: string;
  route?: string;
  frequency?: string;
  indication?: string;
  startedAt?: string;
  stoppedAt?: string;
}
