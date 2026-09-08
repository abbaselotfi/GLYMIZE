import type { PatientCoreFactMeta } from "./provenance.js";

export const patientClinicalContextStates = [
  "present",
  "absent",
  "unknown",
] as const;
export type PatientClinicalContextState =
  (typeof patientClinicalContextStates)[number];

export interface PatientClinicalContextView {
  contextId: string;
  contextKey: string;
  displayName: string;
  state: PatientClinicalContextState;
  value?: string | number | boolean;
  meta: PatientCoreFactMeta;
}
