export const schedulingConfirmationPolicies = [
  "auto_confirm",
  "approval_required",
] as const;
export type SchedulingConfirmationPolicy =
  (typeof schedulingConfirmationPolicies)[number];

export const schedulingVisitModes = ["in_person", "audio", "video"] as const;
export type SchedulingVisitMode = (typeof schedulingVisitModes)[number];

export const schedulingPolicyStatuses = ["draft", "published", "suspended"] as const;
export type SchedulingPolicyStatus = (typeof schedulingPolicyStatuses)[number];

export const availabilityExceptionKinds = ["unavailable", "additional"] as const;
export type AvailabilityExceptionKind = (typeof availabilityExceptionKinds)[number];

export interface SchedulingCapabilities {
  availabilityManagement: boolean;
  patientSlotDiscovery: boolean;
  slotLocking: boolean;
  booking: boolean;
  paymentGateway: false;
}

export const appointmentStatuses = [
  "requested",
  "confirmed",
  "cancelled",
  "rescheduled",
  "checked_in",
  "in_progress",
  "completed",
  "no_show",
] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const appointmentPaymentStates = [
  "not_required",
  "pending",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;
export type AppointmentPaymentState = (typeof appointmentPaymentStates)[number];

export interface AppointmentFinancialSnapshot {
  feeAmountMinor?: number;
  currency?: string;
  pricingPolicyVersion?: string;
  paymentRequired: boolean;
  paymentState: AppointmentPaymentState;
  capturedAt: string;
}

export interface ManagedAppointment {
  id: string;
  providerProfileId: string;
  practiceId: string;
  physicianUserId: string;
  patientAccountId: string;
  careRelationshipId: string;
  rescheduledFromAppointmentId?: string;
  replacementAppointmentId?: string;
  startsAt: string;
  endsAt: string;
  visitMode: SchedulingVisitMode;
  confirmationPolicy: SchedulingConfirmationPolicy;
  policyRevision: number;
  status: AppointmentStatus;
  version: number;
  financialSnapshot: AppointmentFinancialSnapshot;
  grantsClinicalAccess: false;
  createdAt: string;
  updatedAt: string;
}

export interface BookAppointmentInput {
  slotHoldId: string;
  confirmed: true;
}

export interface RescheduleAppointmentInput {
  slotHoldId: string;
  reasonCode?: string;
  confirmed: true;
}

export interface AppointmentTransitionInput {
  reasonCode?: string;
  confirmed: true;
}

export interface CandidateAppointmentSlot {
  providerProfileId: string;
  practiceId: string;
  startsAt: string;
  endsAt: string;
  visitMode: SchedulingVisitMode;
  timeZone: string;
  policyRevision: number;
  informational: true;
  reserved: false;
}

export interface CandidateAppointmentSlotResult {
  slots: CandidateAppointmentSlot[];
  serverTime: string;
  bookingEnabled: boolean;
}

export interface AppointmentSlotHoldInput {
  providerProfileId: string;
  startsAt: string;
  visitMode: SchedulingVisitMode;
  confirmed: true;
}

export interface AppointmentSlotHold {
  id: string;
  providerProfileId: string;
  practiceId: string;
  startsAt: string;
  endsAt: string;
  visitMode: SchedulingVisitMode;
  status: "held" | "released" | "expired" | "consumed";
  expiresAt: string;
  bookingCreated: false;
  grantsClinicalAccess: false;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulingPolicyInput {
  timeZone: string;
  confirmationPolicy: SchedulingConfirmationPolicy;
  defaultVisitDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxDailyAppointments: number;
  bookingHorizonDays: number;
  minimumNoticeMinutes: number;
  cancellationNoticeMinutes: number;
  rescheduleNoticeMinutes: number;
  confirmed: true;
}

export interface ManagedSchedulingPolicy
  extends Omit<SchedulingPolicyInput, "confirmed"> {
  id: string;
  practiceId: string;
  physicianUserId: string;
  status: SchedulingPolicyStatus;
  revision: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityRuleInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
  visitMode: SchedulingVisitMode;
  effectiveFrom: string;
  effectiveUntil?: string;
  confirmed: true;
}

export interface ManagedAvailabilityRule
  extends Omit<AvailabilityRuleInput, "confirmed"> {
  id: string;
  retiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityExceptionInput {
  date: string;
  kind: AvailabilityExceptionKind;
  startMinute?: number;
  endMinute?: number;
  visitMode?: SchedulingVisitMode;
  reasonLabel?: string;
  confirmed: true;
}

export interface ManagedAvailabilityException
  extends Omit<AvailabilityExceptionInput, "confirmed"> {
  id: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedSchedulingConfiguration {
  policy?: ManagedSchedulingPolicy;
  rules: ManagedAvailabilityRule[];
  exceptions: ManagedAvailabilityException[];
}
