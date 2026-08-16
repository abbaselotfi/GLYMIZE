/**
 * Patient Record v2 contracts.
 *
 * A Patient is the stable longitudinal aggregate. Encounters are dated visits
 * beneath that patient. National ID and practice file number are identifiers,
 * never the database primary key.
 */

import type {
  PatientHandoffClinicalFlags,
  PatientHandoffFieldProvenanceMap,
  PatientHandoffLab,
  PatientHandoffMedication,
  PatientHandoffVitals,
} from "./patient-handoff.js";

export const patientIdentifierKinds = [
  "file_number",
  "national_id",
  "other",
] as const;
export type PatientIdentifierKind =
  (typeof patientIdentifierKinds)[number];

/**
 * Patient Workspace reuses the physician's existing layout preset. We do not
 * create a second, competing preference system for longitudinal records.
 */
export const patientWorkspaceModes = [
  "auto",
  "command_center",
  "focused_workflow",
  "compact_cards",
] as const;
export type PatientWorkspaceMode =
  (typeof patientWorkspaceModes)[number];

export type PatientRecordStatus = "active" | "archived";
export type PatientEncounterKind =
  | "outpatient"
  | "telehealth"
  | "other";
export type PatientEncounterSource =
  | "care_team"
  | "physician"
  | "import"
  | "other";
export type PatientEncounterStatus =
  | "draft"
  | "ready_for_physician"
  | "reviewed"
  | "completed"
  | "archived";

export interface PatientIdentifierSummary {
  id: string;
  kind: PatientIdentifierKind;
  displayMask: string;
  isPrimary: boolean;
}

export interface PatientLongitudinalDemographics {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

export interface PatientLongitudinalSummary {
  patientId: string;
  status: PatientRecordStatus;
  demographics?: PatientLongitudinalDemographics;
  identifiers: PatientIdentifierSummary[];
  latestEncounterAt?: string;
}

export interface PatientFileNumberAllocatorState {
  status: "uninitialized" | "ready";
  /** Serialized decimal string to avoid JavaScript integer precision loss. */
  lastAllocatedNumber?: string;
  /** Advisory display value. Allocation is rechecked atomically server-side. */
  nextProposedNumber?: string;
  displayWidth: number;
  initializedAt?: string;
}

export interface PatientFileNumberAllocatorInitializeInput {
  /**
   * Practice-confirmed latest assigned file number. Existing legacy HMAC-only
   * rows cannot be used to infer this value.
   */
  lastAllocatedNumber: string;
  displayWidth?: number;
}

export interface PatientIdentifierInput {
  kind: PatientIdentifierKind;
  value: string;
  isPrimary?: boolean;
}

export interface PatientResolveInput {
  identifier: string;
  /**
   * Optional override. When omitted, a checksum-valid Iranian national ID is
   * preferred; otherwise the value is treated as a practice file number.
   */
  kind?: PatientIdentifierKind;
}

export interface PatientLegacyHandoffReference {
  id: string;
  kind: PatientIdentifierKind;
  displayMask: string;
  revision: number;
  updatedAt: string;
}

export interface PatientResolveResult {
  found: boolean;
  resolvedKind: PatientIdentifierKind;
  matchedIdentifier?: PatientIdentifierSummary;
  patient?: PatientLongitudinalSummary;
  /**
   * Transitional compatibility signal. The v2 runtime never silently guesses
   * that a legacy handoff and an existing v2 patient are the same person.
   */
  legacyHandoff?: PatientLegacyHandoffReference;
}

export interface PatientCreateInput {
  identifiers?: PatientIdentifierInput[];
  /**
   * Ask the server to allocate the current monotonic next file number in the
   * same transaction as patient creation. Do not also send a file_number.
   */
  allocateFileNumber?: boolean;
  demographics?: Pick<
    PatientLongitudinalDemographics,
    "firstName" | "lastName" | "dateOfBirth"
  >;
}

export interface PatientCreateResult {
  patient: PatientLongitudinalSummary;
  assignedFileNumber?: string;
  allocator: PatientFileNumberAllocatorState;
}

export interface PatientIdentifierAttachInput {
  /**
   * Attach one explicit identifier to an existing patient. Omit this only
   * when allocateFileNumber is true.
   */
  identifier?: PatientIdentifierInput;
  /** Allocate the next monotonic practice file number server-side. */
  allocateFileNumber?: boolean;
}

export interface PatientIdentifierAttachResult {
  patient: PatientLongitudinalSummary;
  assignedFileNumber?: string;
  allocator: PatientFileNumberAllocatorState;
}

export interface PatientEncounterSummary {
  encounterId: string;
  patientId: string;
  encounterAt: string;
  encounterKind: PatientEncounterKind;
  source: PatientEncounterSource;
  status: PatientEncounterStatus;
  latestSnapshotRevision?: number;
  latestSignedPlanId?: string;
}

export interface PatientEncounterClinicalSnapshot {
  vitals?: PatientHandoffVitals;
  clinicalFlags?: PatientHandoffClinicalFlags;
  labs?: PatientHandoffLab[];
  medications?: PatientHandoffMedication[];
  patientFieldProvenance?: PatientHandoffFieldProvenanceMap;
  demographics?: {
    reportedAgeYears?: number;
    reportedSex?: "male" | "female";
  };
  nurseNotes?: string;
  ocrText?: string;
}

export interface PatientEncounterCreateInput {
  encounterAt?: string;
  encounterKind?: PatientEncounterKind;
  status?: PatientEncounterStatus;
  snapshot?: PatientEncounterClinicalSnapshot;
}

export interface PatientEncounterCreateResult {
  encounter: PatientEncounterSummary;
  observationCount: number;
}

export type PhysicianNoteScope = "patient" | "encounter";
export type PhysicianNoteVisibility =
  | "physician_only"
  | "care_team_visible";

export interface PhysicianNoteRevision {
  noteId: string;
  threadId: string;
  patientId: string;
  encounterId?: string;
  scope: PhysicianNoteScope;
  visibility: PhysicianNoteVisibility;
  isPinned: boolean;
  revision: number;
  body: string;
  authoredBy: string;
  createdAt: string;
}

export type PatientObservationVerification =
  | "unverified"
  | "confirmed"
  | "rejected";

export interface PatientTrendPoint {
  observationId: string;
  encounterId: string;
  observedAt: string;
  value: number;
  unit: string;
  verification: PatientObservationVerification;
  abnormalFlag?: string;
}

export interface PatientTrendSeries {
  canonicalKey: string;
  displayName: string;
  unit: string;
  specimen?: string;
  chartEligible: boolean;
  pinned?: boolean;
  points: PatientTrendPoint[];
}

export interface PatientWorkspaceSnapshot {
  patient: PatientLongitudinalSummary;
  encounters: PatientEncounterSummary[];
  patientNotes: PhysicianNoteRevision[];
  trends: PatientTrendSeries[];
  mode: PatientWorkspaceMode;
}
