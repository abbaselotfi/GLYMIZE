import type { PatientCoreFactBase } from "./facts.js";

export const patientAllergyCategories = [
  "medication",
  "food",
  "environment",
  "biologic",
  "other",
] as const;
export type PatientAllergyCategory =
  (typeof patientAllergyCategories)[number];

export const patientAllergyStatuses = [
  "active",
  "resolved",
  "uncertain",
] as const;
export type PatientAllergyStatus =
  (typeof patientAllergyStatuses)[number];

export const patientAllergyCriticalities = [
  "low",
  "high",
  "unable_to_assess",
] as const;
export type PatientAllergyCriticality =
  (typeof patientAllergyCriticalities)[number];

export interface PatientAllergyReactionView {
  displayName: string;
  severity?: "mild" | "moderate" | "severe" | "unknown";
}

export interface PatientAllergyIntoleranceView extends PatientCoreFactBase {
  category: PatientAllergyCategory;
  status: PatientAllergyStatus;
  criticality: PatientAllergyCriticality;
  substanceKey?: string;
  medicationId?: string;
  reactions?: PatientAllergyReactionView[];
  onsetAt?: string;
  resolvedAt?: string;
}
