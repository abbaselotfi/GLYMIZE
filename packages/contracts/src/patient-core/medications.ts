import type { PatientCoreFactBase } from "./facts.js";

export const patientMedicationStatuses = [
  "active",
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

export interface PatientMedicationStateView extends PatientCoreFactBase {
  /** Stable catalogue/master-registry identity when an explicit link exists. */
  medicationId?: string;
  status: PatientMedicationStatus;
  sourceState: PatientMedicationSourceState;
  adherence: PatientMedicationAdherenceState;
  dose?: string;
  route?: string;
  frequency?: string;
  indication?: string;
  startedAt?: string;
  stoppedAt?: string;
}
