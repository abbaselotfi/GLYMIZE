import type { PatientCoreFactMeta } from "./provenance.js";

export type PatientObservationValue = string | number | boolean;

export interface PatientObservationView {
  observationId: string;
  canonicalKey: string;
  displayName: string;
  value: PatientObservationValue;
  unit?: string;
  specimen?: string;
  abnormalFlag?: string;
  observedAt: string;
  meta: PatientCoreFactMeta;
}
