import type {
  PatientCoreCollectionCompleteness,
  PatientLongitudinalReadModel,
} from "@glymize/contracts/patient-core";

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
  flaggedObservationCount: number;
  incompleteFamilyCount: number;
  coverage: PatientDataCoverageItem[];
}

export function isSourceFlaggedObservation(flag: string | undefined) {
  const normalized = flag?.trim().toLocaleUpperCase();
  return Boolean(normalized && !["N", "NORMAL", "NONE"].includes(normalized));
}

export function buildPatientTenSecondBrief(
  model: PatientLongitudinalReadModel,
): PatientTenSecondBrief {
  const medicationAttentionCount = model.context.medications.items.filter(
    (medication) => medication.status === "held" || medication.status === "uncertain",
  ).length;
  const flaggedObservationCount = model.context.observations.items.filter(
    (observation) => isSourceFlaggedObservation(observation.abnormalFlag),
  ).length;
  const recordedChangeCount = model.changesSincePreviousEncounter.changes.length;

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
  const incompleteFamilyCount = coverage.filter(
    (item) => item.completeness !== "complete",
  ).length;

  const hasReviewTrigger =
    recordedChangeCount > 0 ||
    medicationAttentionCount > 0 ||
    flaggedObservationCount > 0;
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
    incompleteFamilyCount,
    coverage,
  };
}
