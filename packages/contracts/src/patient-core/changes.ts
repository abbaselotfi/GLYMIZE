import type { PatientCoreSourceReference } from "./provenance.js";

export const patientChangeKinds = [
  "patient_status_changed",
  "problem_added",
  "problem_status_changed",
  "medication_added",
  "medication_status_changed",
  "observation_added_or_updated",
  "clinical_context_changed",
  "event_added",
] as const;
export type PatientChangeKind =
  (typeof patientChangeKinds)[number];

export interface PatientChange {
  changeId: string;
  kind: PatientChangeKind;
  subjectKey: string;
  effectiveAt?: string;
  source?: PatientCoreSourceReference;
}

export interface PatientChangeSet {
  schemaVersion: 1;
  patientId: string;
  practiceId: string;
  generatedAt: string;
  changes: PatientChange[];
}
