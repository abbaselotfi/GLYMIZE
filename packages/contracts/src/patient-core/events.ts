import type { PatientCoreSourceReference } from "./provenance.js";

export const patientCoreEventTypes = [
  "encounter",
  "order",
  "referral",
  "procedure",
  "document",
  "other",
] as const;
export type PatientCoreEventType =
  (typeof patientCoreEventTypes)[number];

export interface PatientCoreEventView {
  eventId: string;
  eventType: PatientCoreEventType;
  effectiveAt: string;
  status?: string;
  label?: string;
  source: PatientCoreSourceReference;
}
