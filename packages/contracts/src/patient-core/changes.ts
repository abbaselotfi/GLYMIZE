import type { PatientCoreScope, PatientCoreSourceReference } from "./provenance.js";

export const patientChangeFamilies = [
  "allergy",
  "problem",
  "medication",
  "observation",
  "clinical_context",
  "patient_status",
  "event",
] as const;
export type PatientChangeFamily =
  (typeof patientChangeFamilies)[number];

export const patientChangeKinds = [
  "added",
  "removed",
  "changed",
] as const;
export type PatientChangeKind =
  (typeof patientChangeKinds)[number];

export type PatientChangeScalar = string | number | boolean | null;

export interface PatientChangeFieldDelta {
  field: string;
  before?: PatientChangeScalar;
  after?: PatientChangeScalar;
}

export interface PatientChange {
  changeId: string;
  family: PatientChangeFamily;
  kind: PatientChangeKind;
  subjectKey: string;
  displayName: string;
  effectiveAt?: string;
  source?: PatientCoreSourceReference;
  deltas?: PatientChangeFieldDelta[];
}

export const patientChangeCoverageStates = [
  "complete",
  "partial",
  "omitted",
] as const;
export type PatientChangeCoverageState =
  (typeof patientChangeCoverageStates)[number];

export interface PatientChangeFamilyCoverage {
  family: Exclude<PatientChangeFamily, "patient_status" | "event">;
  state: PatientChangeCoverageState;
  reason?: string;
}

export interface PatientChangeAnchor {
  encounterId: string;
  effectiveAt: string;
  snapshotRevision: number;
}

export type PatientChangeComparisonStatus =
  | "complete"
  | "partial"
  | "unavailable";

export interface PatientChangeSet {
  schemaVersion: 1;
  scope: PatientCoreScope;
  generatedAt: string;
  comparisonStatus: PatientChangeComparisonStatus;
  baseline?: PatientChangeAnchor;
  current?: PatientChangeAnchor;
  coverage: PatientChangeFamilyCoverage[];
  changes: PatientChange[];
}
