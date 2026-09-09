import type {
  PatientCoreEventView,
  PatientLongitudinalReadModel,
  PatientObservationView,
} from "@glymize/contracts/patient-core";

export const PATIENT_WORKSPACE_PREVIEW_LIMITS = {
  attention: 3,
  changes: 6,
  medications: 6,
  observations: 8,
  timeline: 8,
} as const;

export interface PatientWorkspacePreview<T> {
  items: T[];
  preview: T[];
  omitted: T[];
  omittedCount: number;
}

export function isSourceFlaggedObservation(flag: string | undefined) {
  if (!flag) return false;
  const normalized = flag.trim().toUpperCase();
  return normalized !== "N" && normalized !== "NORMAL" && normalized !== "NONE";
}

function preview<T>(items: T[], limit: number): PatientWorkspacePreview<T> {
  return {
    items,
    preview: items.slice(0, limit),
    omitted: items.slice(limit),
    omittedCount: Math.max(0, items.length - limit),
  };
}

function byNewestObservation(left: PatientObservationView, right: PatientObservationView) {
  const time = right.observedAt.localeCompare(left.observedAt);
  if (time !== 0) return time;
  return right.factId.localeCompare(left.factId);
}

function byNewestEvent(left: PatientCoreEventView, right: PatientCoreEventView) {
  const time = right.effectiveAt.localeCompare(left.effectiveAt);
  if (time !== 0) return time;
  return right.eventId.localeCompare(left.eventId);
}

/**
 * One structural selection contract for all C1 summary surfaces.
 *
 * Observation "current" means newest fact inside an exact `factKey` series.
 * Worker fact keys include canonical key + unit + specimen, so incompatible
 * units/specimens never silently replace one another. This is presentation
 * selection only: it does not infer clinical resolution, severity or normality.
 */
export function buildPatientWorkspaceSelection(model: PatientLongitudinalReadModel) {
  const sortedObservations = [...model.context.observations.items].sort(byNewestObservation);
  const currentBySeries: PatientObservationView[] = [];
  const historicalBySeries: PatientObservationView[] = [];
  const seenSeries = new Set<string>();

  for (const observation of sortedObservations) {
    if (seenSeries.has(observation.factKey)) {
      historicalBySeries.push(observation);
    } else {
      seenSeries.add(observation.factKey);
      currentBySeries.push(observation);
    }
  }

  const currentMedications = model.context.medications.items.filter(
    (item) => item.status !== "stopped",
  );
  const attentionMedications = currentMedications.filter(
    (item) => item.status === "held" || item.status === "uncertain",
  );
  const currentFlaggedObservations = currentBySeries.filter((item) =>
    isSourceFlaggedObservation(item.abnormalFlag),
  );
  const currentUnverifiedObservations = currentBySeries.filter(
    (item) => item.meta.verification !== "verified",
  );
  const historicalFlaggedObservations = historicalBySeries.filter((item) =>
    isSourceFlaggedObservation(item.abnormalFlag),
  );
  const changes = [...model.changesSincePreviousEncounter.changes];
  const timeline = [...model.timeline.items].sort(byNewestEvent);

  return {
    medications: preview(currentMedications, PATIENT_WORKSPACE_PREVIEW_LIMITS.medications),
    attentionMedications: preview(attentionMedications, PATIENT_WORKSPACE_PREVIEW_LIMITS.attention),
    currentObservations: preview(currentBySeries, PATIENT_WORKSPACE_PREVIEW_LIMITS.observations),
    currentFlaggedObservations: preview(
      currentFlaggedObservations,
      PATIENT_WORKSPACE_PREVIEW_LIMITS.attention,
    ),
    currentUnverifiedObservations: preview(
      currentUnverifiedObservations,
      PATIENT_WORKSPACE_PREVIEW_LIMITS.attention,
    ),
    historicalFlaggedObservations,
    changes: preview(changes, PATIENT_WORKSPACE_PREVIEW_LIMITS.changes),
    timeline: preview(timeline, PATIENT_WORKSPACE_PREVIEW_LIMITS.timeline),
  };
}

export type PatientWorkspaceSelection = ReturnType<typeof buildPatientWorkspaceSelection>;
