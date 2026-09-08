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

/**
 * Explicit completeness prevents an empty array from being misread as proof
 * that the patient has no facts in this family.
 *
 * `complete` means complete for the declared projection/source scope, not that
 * the patient's clinical history is globally complete.
 */
export interface PatientCoreCollection<T> {
  completeness: PatientCoreCollectionCompleteness;
  items: T[];
  gapReason?: PatientCoreCollectionGapReason;
  asOf?: string;
}
