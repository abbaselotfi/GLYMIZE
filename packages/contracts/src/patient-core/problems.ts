import type { PatientCoreFactBase } from "./facts.js";

export const patientProblemStatuses = [
  "active",
  "resolved",
  "historical",
  "suspected",
  "unknown",
] as const;
export type PatientProblemStatus =
  (typeof patientProblemStatuses)[number];

export interface PatientProblemCoding {
  system: string;
  code: string;
  display?: string;
}

export interface PatientProblemView extends PatientCoreFactBase {
  status: PatientProblemStatus;
  coding?: PatientProblemCoding;
  onsetAt?: string;
  resolvedAt?: string;
  relatedProblemFactIds?: string[];
}
