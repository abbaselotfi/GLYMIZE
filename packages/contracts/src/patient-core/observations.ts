import type { PatientCoreFactBase } from "./facts.js";

export type PatientObservationValue = string | number | boolean;

export interface PatientObservationView extends PatientCoreFactBase {
  value: PatientObservationValue;
  unit?: string;
  specimen?: string;
  abnormalFlag?: string;
  observedAt: string;
}
