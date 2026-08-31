import type { InsuranceProvider } from "./index.js";

export type PhysicianFinalPlanStatus =
  | "draft"
  | "signed"
  | "superseded"
  | "void";

export type PhysicianOrderStatus = "active" | "cancelled";

export type PhysicianInvestigationKind =
  | "laboratory"
  | "imaging"
  | "procedure"
  | "other";

export type PhysicianInvestigationTiming =
  | "now"
  | "before_next_visit"
  | "at_next_visit"
  | "routine";

export type PhysicianInvestigationPriority =
  | "routine"
  | "priority"
  | "urgent";

export interface PhysicianMedicationInsuranceSnapshot {
  provider: InsuranceProvider;
  genericCode?: string;
  brandCode?: string;
  genericRegistryCode?: string;
  brandRegistryCode?: string;
  ircCode?: string;
  coveragePercent?: number;
  sourceReference?: string;
  observedAt?: string;
}

export interface PhysicianInvestigationInsuranceSnapshot {
  provider: InsuranceProvider;
  serviceCode?: string;
  serviceCodeSystem?: string;
  coveragePercent?: number;
  sourceReference?: string;
  observedAt?: string;
}

export interface PhysicianMedicationOrder {
  id: string;
  status: PhysicianOrderStatus;
  genericMedicationId?: string;
  marketProductId?: string;
  genericName: string;
  brandName?: string;
  route?: string;
  formulation?: string;
  strengthPresentation?: string;
  doseAmount?: number;
  doseUnit?: string;
  frequencyPerDay?: number;
  frequencyCode?: string;
  durationDays?: number;
  quantity?: number;
  quantityUnit?: string;
  insuranceRegistration?: PhysicianMedicationInsuranceSnapshot;
  notes?: string;
}

export interface PhysicianInvestigationOrder {
  id: string;
  status: PhysicianOrderStatus;
  kind: PhysicianInvestigationKind;
  canonicalLabKey?: string;
  investigationCode?: string;
  displayName: string;
  specimen?: string;
  timing: PhysicianInvestigationTiming;
  priority: PhysicianInvestigationPriority;
  fastingRequired?: boolean;
  instructions?: string;
  reasonCode?: string;
  sourceRuleId?: string;
  sourceRulePackVersion?: string;
  sourceDecisionRecordId?: string;
  insuranceRegistration?: PhysicianInvestigationInsuranceSnapshot;
}

export interface PhysicianFinalPlan {
  id: string;
  patientId: string;
  encounterId: string;
  practiceId: string;
  version: number;
  status: PhysicianFinalPlanStatus;
  authoredByUserId: string;
  signedByUserId?: string;
  signedAt?: string;
  supersedesPlanId?: string;
  medicationOrders: PhysicianMedicationOrder[];
  investigationOrders: PhysicianInvestigationOrder[];
  notes?: string;
  engineDecisionRecordId?: string;
  engineVersion?: string;
  rulePackVersion?: string;
}

export type CareTeamOrderKind = "medication" | "investigation";

export type CareTeamOrderFulfillmentStatus =
  | "pending"
  | "submitted_to_payer"
  | "registered"
  | "scheduled"
  | "collected"
  | "result_received"
  | "completed"
  | "unable_to_process"
  | "cancelled";

export interface CareTeamOrderFulfillmentEvent {
  id: string;
  planId: string;
  orderId: string;
  orderKind: CareTeamOrderKind;
  status: CareTeamOrderFulfillmentStatus;
  updatedByUserId: string;
  updatedAt: string;
  note?: string;
}

export interface CareTeamFinalPlanView {
  plan: PhysicianFinalPlan;
  fulfillmentEvents: CareTeamOrderFulfillmentEvent[];
}

export interface EngineInvestigationRecommendation {
  action: "REQUEST_INVESTIGATION";
  investigationKey: string;
  requiredDataKey: string;
  reasonCode: string;
  timing: PhysicianInvestigationTiming;
  priority: PhysicianInvestigationPriority;
  blocksDecision: boolean;
  ruleId: string;
  rulePackVersion: string;
  sourceIds: string[];
}
