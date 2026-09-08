import type { PatientChangeSet } from "./changes.js";
import type { PatientCoreCollection } from "./coverage.js";
import type { PatientCoreEventView } from "./events.js";
import type { PatientContextView } from "./views.js";

export const PATIENT_LONGITUDINAL_READ_MODEL_SCHEMA_VERSION = 1 as const;

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
