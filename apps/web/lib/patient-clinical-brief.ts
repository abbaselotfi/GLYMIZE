import type {
  PatientCoreCollectionCompleteness,
  PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";
import {
  buildPatientWorkspaceSelection,
  type PatientWorkspaceSelection,
} from "./patient-workspace-selection";

export { isSourceFlaggedObservation } from "./patient-workspace-selection";

export type PatientReviewPosture =
  | "review_recorded_changes"
  | "coverage_limited"
  | "current_snapshot_available"
  | "first_recorded_encounter";

export interface PatientDataCoverageItem {
  family:
    | "allergies"
    | "problems"
    | "medications"
    | "observations"
    | "clinical_contexts"
    | "timeline";
  completeness: PatientCoreCollectionCompleteness;
}

export interface PatientTenSecondBrief {
  posture: PatientReviewPosture;
  recordedChangeCount: number;
  medicationAttentionCount: number;
  /** Newest-per-exact-series source flags only; historical flags are separate. */
  flaggedObservationCount: number;
  unverifiedObservationCount: number;
  historicalFlaggedObservationCount: number;
  incompleteFamilyCount: number;
  coverage: PatientDataCoverageItem[];
}

export function buildPatientTenSecondBrief(
  model: PatientLongitudinalReadModel,
  selected: PatientWorkspaceSelection = buildPatientWorkspaceSelection(model),
): PatientTenSecondBrief {
  const coverage: PatientDataCoverageItem[] = [
    { family: "allergies", completeness: model.context.allergies.completeness },
    { family: "problems", completeness: model.context.problems.completeness },
    { family: "medications", completeness: model.context.medications.completeness },
    { family: "observations", completeness: model.context.observations.completeness },
    {
      family: "clinical_contexts",
      completeness: model.context.clinicalContexts.completeness,
    },
    { family: "timeline", completeness: model.timeline.completeness },
  ];

  const recordedChangeCount = selected.changes.items.length;
  const medicationAttentionCount = selected.attentionMedications.items.length;
  const flaggedObservationCount = selected.currentFlaggedObservations.items.length;
  const unverifiedObservationCount = selected.currentUnverifiedObservations.items.length;
  const historicalFlaggedObservationCount = selected.historicalFlaggedObservations.length;
  const incompleteFamilyCount = coverage.filter(
    (item) => item.completeness !== "complete",
  ).length;

  const hasReviewTrigger =
    recordedChangeCount > 0 ||
    medicationAttentionCount > 0 ||
    flaggedObservationCount > 0 ||
    unverifiedObservationCount > 0;
  const comparison = model.changesSincePreviousEncounter;

  let posture: PatientReviewPosture;
  if (hasReviewTrigger) {
    posture = "review_recorded_changes";
  } else if (comparison.current && !comparison.baseline) {
    posture = "first_recorded_encounter";
  } else if (incompleteFamilyCount > 0) {
    posture = "coverage_limited";
  } else {
    posture = "current_snapshot_available";
  }

  return {
    posture,
    recordedChangeCount,
    medicationAttentionCount,
    flaggedObservationCount,
    unverifiedObservationCount,
    historicalFlaggedObservationCount,
    incompleteFamilyCount,
    coverage,
  };
}
