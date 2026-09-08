import type { PatientCoreFactBase } from "./facts.js";

export const patientClinicalContextStates = [
  "present",
  "absent",
  "unknown",
] as const;
export type PatientClinicalContextState =
  (typeof patientClinicalContextStates)[number];

/**
 * Cross-cutting state that may affect multiple specialties simultaneously.
 * A context is not automatically a diagnosis and must not be promoted into the
 * problem list without an explicit reviewed workflow.
 */
export interface PatientClinicalContextView extends PatientCoreFactBase {
  state: PatientClinicalContextState;
  value?: string | number | boolean;
}
