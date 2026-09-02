export const referralStoredStatuses = ["active", "revoked", "exhausted"] as const;
export type ReferralStoredStatus = (typeof referralStoredStatuses)[number];
export type ReferralEffectiveStatus = ReferralStoredStatus | "expired";

export const referralRedemptionStatuses = [
  "pending_care_relationship",
  "converted",
  "cancelled",
  "rejected",
] as const;
export type ReferralRedemptionStatus = (typeof referralRedemptionStatuses)[number];

export interface ReferralCapabilities {
  referralService: boolean;
  patientRedemption: boolean;
}

export interface ReferralProviderSnapshot {
  displayName: string;
  specialtyName: string;
  practiceDisplayName: string;
}

export interface ReferralIssueInput {
  intendedPhysicianUserId?: string;
  /** Patient-visible workflow label; must not contain patient or clinical identifiers. */
  purposeLabel?: string;
  maxUses?: number;
  expiresInHours?: number;
}

export interface ReferralSummary {
  id: string;
  intendedPhysicianUserId: string;
  provider: ReferralProviderSnapshot;
  purposeLabel?: string;
  codeHint: string;
  status: ReferralEffectiveStatus;
  maxUses: number;
  useCount: number;
  remainingUses: number;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** The plaintext credential is returned exactly once, at issuance. */
export interface IssuedReferral extends ReferralSummary {
  code: string;
  qrPayload: string;
}

export interface ReferralInspection {
  provider: ReferralProviderSnapshot;
  purposeLabel?: string;
  expiresAt: string;
  remainingUses: number;
}

export interface ReferralRedeemInput {
  code: string;
  confirmed: true;
}

export interface ReferralRedemption {
  id: string;
  referralId: string;
  provider: ReferralProviderSnapshot;
  status: ReferralRedemptionStatus;
  patientProofingStatusAtRedeem: "unverified" | "pending" | "verified" | "rejected";
  redeemedAt: string;
  updatedAt: string;
}
