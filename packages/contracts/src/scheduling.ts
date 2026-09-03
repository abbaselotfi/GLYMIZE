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
  patientSlotDiscovery: false;
  booking: false;
  paymentGateway: false;
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
