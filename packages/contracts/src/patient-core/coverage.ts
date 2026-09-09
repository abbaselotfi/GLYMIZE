export const patientCoreCollectionCompletenessStates = [
  "complete",
  "partial",
  "not_available",
] as const;
export type PatientCoreCollectionCompleteness =
  (typeof patientCoreCollectionCompletenessStates)[number];

export const patientCoreCollectionGapReasons = [
  "source_not_exposed",
  "not_collected",
  "permission_limited",
  "not_supported",
  "other",
] as const;
export type PatientCoreCollectionGapReason =
  (typeof patientCoreCollectionGapReasons)[number];

export const patientCoreProjectionExclusionReasons = [
  "rejected",
  "raw_namespace",
  "duplicate_projection",
  "other",
] as const;
export type PatientCoreProjectionExclusionReason =
  (typeof patientCoreProjectionExclusionReasons)[number];

export interface PatientCoreProjectionExclusionCount {
  reason: PatientCoreProjectionExclusionReason;
  count: number;
}

/**
 * Runtime projection accounting for one declared source scope.
 *
 * This is deliberately non-clinical metadata: it explains why a collection is
 * complete or partial without turning missing data into a medical conclusion.
 * `sourceRowCount` is the number of rows inside `sourceScope`; rows outside that
 * declared scope (for example superseded snapshot revisions) are not counted.
 */
export interface PatientCoreCollectionDiagnostics {
  sourceScope: string;
  sourceRowCount: number;
  eligibleCount: number;
  includedCount: number;
  intentionallyExcludedCount: number;
  invalidSkippedCount: number;
  truncatedCount: number;
  exclusions?: PatientCoreProjectionExclusionCount[];
}

/**
 * Explicit completeness prevents an empty array from being misread as proof
 * that the patient has no facts in this family.
 *
 * `complete` means complete for the declared projection/source scope, not that
 * the patient's clinical history is globally complete. When `diagnostics` is
 * present, `complete` additionally requires zero invalid skips and truncation.
 */
export interface PatientCoreCollection<T> {
  completeness: PatientCoreCollectionCompleteness;
  items: T[];
  gapReason?: PatientCoreCollectionGapReason;
  asOf?: string;
  diagnostics?: PatientCoreCollectionDiagnostics;
}
