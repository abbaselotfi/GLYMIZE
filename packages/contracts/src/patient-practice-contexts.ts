import type { CareRelationshipStatus } from "./care-relationships.js";
import type { ReferralProviderSnapshot } from "./referrals.js";

export interface PatientPracticeContextCapabilities {
  multiPracticePatient: boolean;
  contextSelectionGrantsAccess: false;
}

export interface PatientPracticeContext {
  id: string;
  practiceId: string;
  provider: ReferralProviderSnapshot;
  relationshipStatus: CareRelationshipStatus;
  selectable: boolean;
  linkedLocalRecord: boolean;
  legacyPortalBridgeAvailable: boolean;
  updatedAt: string;
}

export interface PatientPracticeContextSelectionInput {
  contextId: string;
  confirmed: true;
}

export interface PatientPracticeContextSelection {
  context: PatientPracticeContext;
  grantsClinicalAccess: false;
  grantsCrossPracticeAccess: false;
}
