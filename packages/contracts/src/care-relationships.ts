import type { ReferralProviderSnapshot } from "./referrals.js";

export const careRelationshipStatuses = [
  "requested",
  "active",
  "paused",
  "ended",
  "revoked",
  "rejected",
] as const;
export type CareRelationshipStatus = (typeof careRelationshipStatuses)[number];

export interface CareRelationshipCapabilities {
  careRelationships: boolean;
  localRecordLinking: boolean;
  clinicalAuthorization: false;
}

export interface CareRelationshipSummary {
  id: string;
  status: CareRelationshipStatus;
  provider: ReferralProviderSnapshot;
  assignedPhysicianUserId?: string;
  linkedLocalRecord: boolean;
  activatedAt?: string;
  terminalAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeCareRelationshipSummary extends CareRelationshipSummary {
  patientAccountId: string;
  patientProofingStatus: "unverified" | "pending" | "verified" | "rejected";
  patientIdentityMask?: string;
  localPatientId?: string;
}

export interface CareRelationshipRequestInput {
  referralRedemptionId: string;
  confirmed: true;
}

export interface CareRelationshipTransitionInput {
  confirmed: true;
  reasonCode?: string;
}

export interface CareRelationshipLocalRecordInput {
  patientId: string;
  confirmed: true;
}
