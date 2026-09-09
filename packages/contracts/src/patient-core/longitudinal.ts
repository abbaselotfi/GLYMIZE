import type { PatientChangeSet } from "./changes.js";
import type {
  PatientCoreCollection,
  PatientCoreCollectionContinuation,
} from "./coverage.js";
import type { PatientCoreEventView } from "./events.js";
import type { PatientObservationView } from "./observations.js";
import type { PatientContextView } from "./views.js";

export const PATIENT_LONGITUDINAL_READ_MODEL_SCHEMA_VERSION = 1 as const;
export const PATIENT_LONGITUDINAL_HISTORY_PAGE_SCHEMA_VERSION = 1 as const;

export const patientLongitudinalHistoryFamilies = [
  "observations",
  "timeline",
] as const;
export type PatientLongitudinalHistoryFamily =
  (typeof patientLongitudinalHistoryFamilies)[number];

/**
 * Shared longitudinal read model for Clinical Brief, What Changed,
 * Smart Routing and curated AI context consumers.
 *
 * This is a derived read projection only; it is never a write authority.
 */
export interface PatientLongitudinalReadModel {
  schemaVersion: typeof PATIENT_LONGITUDINAL_READ_MODEL_SCHEMA_VERSION;
  generatedAt: string;
  context: PatientContextView;
  timeline: PatientCoreCollection<PatientCoreEventView>;
  changesSincePreviousEncounter: PatientChangeSet;
}

type ContinuableCollection<T> = PatientCoreCollection<T> & {
  continuation: PatientCoreCollectionContinuation;
};

type PatientLongitudinalHistoryPageBase = {
  schemaVersion: typeof PATIENT_LONGITUDINAL_HISTORY_PAGE_SCHEMA_VERSION;
  generatedAt: string;
  scope: {
    practiceId: string;
    patientId: string;
  };
};

export type PatientLongitudinalObservationHistoryPage =
  PatientLongitudinalHistoryPageBase & {
    family: "observations";
    collection: ContinuableCollection<PatientObservationView>;
  };

export type PatientLongitudinalTimelineHistoryPage =
  PatientLongitudinalHistoryPageBase & {
    family: "timeline";
    collection: ContinuableCollection<PatientCoreEventView>;
  };

export type PatientLongitudinalHistoryPage =
  | PatientLongitudinalObservationHistoryPage
  | PatientLongitudinalTimelineHistoryPage;
