/**
 * Patient Record v2 contracts.
 *
 * A Patient is the stable longitudinal aggregate. Encounters are dated visits
 * beneath that patient. National ID and practice file number are identifiers,
 * never the database primary key.
 */

export const patientIdentifierKinds = [
  "file_number",
  "national_id",
  "other",
] as const;
export type PatientIdentifierKind =
  (typeof patientIdentifierKinds)[number];

export const patientWorkspaceModes = [
  "focus",
  "standard",
  "comprehensive",
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
  reportedSex?: "male" | "female";
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
