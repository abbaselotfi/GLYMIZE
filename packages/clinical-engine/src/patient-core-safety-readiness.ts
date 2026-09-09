import type {
  PatientAllergyIntoleranceView,
  PatientClinicalContextView,
  PatientContextView,
  PatientCoreCollection,
  PatientCoreCollectionGapReason,
  PatientCoreFactBase,
  PatientCoreFreshness,
  PatientCoreScope,
  PatientCoreVerification,
  PatientMedicationStateView,
  PatientObservationView,
  PatientProblemView,
} from "@glymize/contracts/patient-core";

export const PATIENT_CORE_SAFETY_READINESS_SCHEMA_VERSION = 1 as const;

export const patientCoreSafetyCollectionStates = [
  "not_collected",
  "not_available",
  "partial",
  "known_absent",
  "present",
] as const;
export type PatientCoreSafetyCollectionState =
  (typeof patientCoreSafetyCollectionStates)[number];

export const patientCoreSafetyFactReadinessStates = [
  "unverified",
  "freshness_unknown",
  "stale",
  "current",
] as const;
export type PatientCoreSafetyFactReadinessState =
  (typeof patientCoreSafetyFactReadinessStates)[number];

export interface PatientCoreSafetyFactReadiness<T extends PatientCoreFactBase> {
  readiness: PatientCoreSafetyFactReadinessState;
  fact: T;
}

export interface PatientCoreSafetyCollectionReadiness<T extends PatientCoreFactBase> {
  state: PatientCoreSafetyCollectionState;
  completeness: PatientCoreCollection<T>["completeness"];
  gapReason?: PatientCoreCollectionGapReason;
  facts: Array<PatientCoreSafetyFactReadiness<T>>;
}

/**
 * Structural bridge from Patient Core to medication-safety consumers.
 *
 * This object deliberately has no eligibility, contraindication, ranking,
 * treatment, dose, or clearance authority. It preserves source availability,
 * verification and freshness so reviewed safety registries can fail closed.
 */
export interface PatientCoreMedicationSafetyReadiness {
  schemaVersion: typeof PATIENT_CORE_SAFETY_READINESS_SCHEMA_VERSION;
  generatedAt: string;
  scope: PatientCoreScope;
  decisionAuthority: "none";
  allergies: PatientCoreSafetyCollectionReadiness<PatientAllergyIntoleranceView>;
  problems: PatientCoreSafetyCollectionReadiness<PatientProblemView>;
  medications: PatientCoreSafetyCollectionReadiness<PatientMedicationStateView>;
  observations: PatientCoreSafetyCollectionReadiness<PatientObservationView>;
  clinicalContexts: PatientCoreSafetyCollectionReadiness<PatientClinicalContextView>;
}

function collectionState<T extends PatientCoreFactBase>(
  collection: PatientCoreCollection<T>,
): PatientCoreSafetyCollectionState {
  if (collection.completeness === "not_available") {
    return collection.gapReason === "not_collected"
      ? "not_collected"
      : "not_available";
  }
  if (collection.completeness === "partial") return "partial";
  return collection.items.length === 0 ? "known_absent" : "present";
}

function factReadiness(
  verification: PatientCoreVerification,
  freshness: PatientCoreFreshness,
): PatientCoreSafetyFactReadinessState {
  if (verification !== "verified") return "unverified";
  if (freshness === "unknown") return "freshness_unknown";
  return freshness;
}

function adaptCollection<T extends PatientCoreFactBase>(
  collection: PatientCoreCollection<T>,
): PatientCoreSafetyCollectionReadiness<T> {
  return {
    state: collectionState(collection),
    completeness: collection.completeness,
    ...(collection.gapReason ? { gapReason: collection.gapReason } : {}),
    facts: collection.items.map((fact) => ({
      readiness: factReadiness(fact.meta.verification, fact.meta.freshness),
      fact,
    })),
  };
}

export function buildPatientCoreMedicationSafetyReadiness(
  context: PatientContextView,
): PatientCoreMedicationSafetyReadiness {
  return {
    schemaVersion: PATIENT_CORE_SAFETY_READINESS_SCHEMA_VERSION,
    generatedAt: context.generatedAt,
    scope: context.identity.scope,
    decisionAuthority: "none",
    allergies: adaptCollection(context.allergies),
    problems: adaptCollection(context.problems),
    medications: adaptCollection(context.medications),
    observations: adaptCollection(context.observations),
    clinicalContexts: adaptCollection(context.clinicalContexts),
  };
}
