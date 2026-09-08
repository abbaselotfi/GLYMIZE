import type { PatientCoreFactMeta } from "./provenance.js";

export const patientProblemStatuses = [
  "active",
  "resolved",
  "historical",
  "suspected",
  "unknown",
] as const;
export type PatientProblemStatus =
  (typeof patientProblemStatuses)[number];

export interface PatientProblemView {
  problemId: string;
  conceptKey?: string;
  displayName: string;
  status: PatientProblemStatus;
  onsetAt?: string;
  resolvedAt?: string;
  relatedProblemIds?: string[];
  meta: PatientCoreFactMeta;
}
