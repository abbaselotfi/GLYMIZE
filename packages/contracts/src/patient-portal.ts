/**
 * Patient Portal (online visit) contracts — WS-2 / WS-3.
 *
 * Patient-reported data is a separate provenance domain. Nothing here may be
 * treated as clinician-verified clinical truth until a physician explicitly
 * confirms it inside the Patient Record. Portal submissions persist in their
 * own runtime tables; incorporation into an encounter is an explicit,
 * audited clinician action.
 */

import type {
  PatientHandoffLab,
  PatientHandoffMedication,
  PatientHandoffVitals,
} from "./patient-handoff.js";

export const portalSubmissionKinds = [
  "medications",
  "labs",
  "vitals",
  "note",
] as const;
export type PortalSubmissionKind =
  (typeof portalSubmissionKinds)[number];

export const portalSubmissionStatuses = [
  "submitted",
  "acknowledged",
  "reviewed",
  "archived",
] as const;
export type PortalSubmissionStatus =
  (typeof portalSubmissionStatuses)[number];

export const portalMediaKinds = ["image", "video"] as const;
export type PortalMediaKind = (typeof portalMediaKinds)[number];

/**
 * Provenance stamped on every stored portal submission payload. Portal
 * intake is always patient-reported and never self-verified.
 */
export interface PortalSubmissionProvenance {
  reportedBy: "patient";
  submittedAt: string;
}

export interface PortalSessionUser {
  portalUserId: string;
  practiceId: string;
  patientId: string;
  mustChangePassword: boolean;
}

export interface PortalSubmissionCreateInput {
  kind: PortalSubmissionKind;
  medications?: PatientHandoffMedication[];
  labs?: PatientHandoffLab[];
  vitals?: PatientHandoffVitals;
  note?: string;
}

export interface PortalSubmissionSummary {
  id: string;
  kind: PortalSubmissionKind;
  status: PortalSubmissionStatus;
  createdAt: string;
  reviewedAt?: string;
  encounterId?: string;
}

export interface PortalSubmissionDetail
  extends PortalSubmissionSummary {
  payload: Record<string, unknown>;
}

export interface PortalThreadSummary {
  id: string;
  /** Present on clinician (admin) thread listings; omitted on patient listings. */
  patientId?: string;
  physicianId: string;
  encounterId?: string;
  status: "open" | "closed";
  lastMessageAt: string;
  createdAt: string;
}

export interface PortalAttachmentSummary {
  id: string;
  mediaKind: PortalMediaKind;
  mimeType: string;
  sizeBytes: number;
}

export interface PortalMessage {
  id: string;
  threadId: string;
  senderRole: "patient" | "physician";
  body: string;
  attachments: PortalAttachmentSummary[];
  createdAt: string;
}

export interface PortalThreadMessagesPage {
  thread: PortalThreadSummary;
  messages: PortalMessage[];
  nextCursor: string | null;
}