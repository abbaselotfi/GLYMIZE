"use client";

import type {
  AvailabilityExceptionInput,
  AvailabilityRuleInput,
  AppointmentSlotHold,
  AppointmentSlotHoldInput,
  AppointmentTransitionInput,
  BookAppointmentInput,
  CandidateAppointmentSlotResult,
  ManagedAvailabilityException,
  ManagedAvailabilityRule,
  ManagedSchedulingConfiguration,
  ManagedSchedulingPolicy,
  ManagedAppointment,
  RescheduleAppointmentInput,
  SchedulingCapabilities,
  SchedulingPolicyInput,
} from "@glymize/contracts";
import { runtimeFetch } from "./runtime-client";
import { patientIdentityFetch } from "./patient-identity-client";
import { runtimeApiUrl } from "./runtime-api-url";

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return String(body?.error ?? fallback);
}

async function schedulingFetch(path: string, init?: RequestInit) {
  return runtimeFetch(`/v1/scheduling${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
}

async function patientSchedulingFetch(path: string, init?: RequestInit) {
  return patientIdentityFetch(`/v1/scheduling${path}`, {
    ...init,
    cache: "no-store",
  });
}

export async function getSchedulingCapabilities() {
  if (!runtimeApiUrl) throw new Error("RUNTIME_API_NOT_CONFIGURED");
  const response = await fetch(`${runtimeApiUrl}/v1/scheduling/capabilities`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorOf(response, "SCHEDULING_CAPABILITIES_FAILED"));
  return response.json() as Promise<SchedulingCapabilities>;
}

export async function getManagedSchedulingConfiguration() {
  const response = await schedulingFetch("/manage");
  if (!response.ok) throw new Error(await errorOf(response, "SCHEDULING_CONFIGURATION_FAILED"));
  return response.json() as Promise<ManagedSchedulingConfiguration>;
}

export async function saveSchedulingPolicy(
  input: Omit<SchedulingPolicyInput, "confirmed">,
) {
  const response = await schedulingFetch("/manage/policy", {
    method: "PUT",
    body: JSON.stringify({ ...input, confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "SCHEDULING_POLICY_SAVE_FAILED"));
  return (await response.json() as { policy: ManagedSchedulingPolicy }).policy;
}

export async function createAvailabilityRule(
  input: Omit<AvailabilityRuleInput, "confirmed">,
) {
  const response = await schedulingFetch("/manage/rules", {
    method: "POST",
    body: JSON.stringify({ ...input, confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "AVAILABILITY_RULE_CREATE_FAILED"));
  return (await response.json() as { rule: ManagedAvailabilityRule }).rule;
}

export async function retireAvailabilityRule(ruleId: string) {
  const response = await schedulingFetch(`/manage/rules/${encodeURIComponent(ruleId)}/retire`, {
    method: "POST",
    body: JSON.stringify({ confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "AVAILABILITY_RULE_RETIRE_FAILED"));
  return (await response.json() as { rule: ManagedAvailabilityRule }).rule;
}

export async function createAvailabilityException(
  input: Omit<AvailabilityExceptionInput, "confirmed">,
) {
  const response = await schedulingFetch("/manage/exceptions", {
    method: "POST",
    body: JSON.stringify({ ...input, confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "AVAILABILITY_EXCEPTION_CREATE_FAILED"));
  return (await response.json() as { exception: ManagedAvailabilityException }).exception;
}

export async function revokeAvailabilityException(exceptionId: string) {
  const response = await schedulingFetch(`/manage/exceptions/${encodeURIComponent(exceptionId)}/revoke`, {
    method: "POST",
    body: JSON.stringify({ confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "AVAILABILITY_EXCEPTION_REVOKE_FAILED"));
  return (await response.json() as { exception: ManagedAvailabilityException }).exception;
}

export async function setSchedulingPublication(publish: boolean) {
  const response = await schedulingFetch(`/manage/${publish ? "publish" : "hide"}`, {
    method: "POST",
    body: JSON.stringify({ confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "SCHEDULING_PUBLICATION_FAILED"));
  return (await response.json() as { policy: ManagedSchedulingPolicy }).policy;
}

export async function listCandidateAppointmentSlots(input: {
  providerProfileId: string;
  from: string;
  to: string;
  mode?: "in_person" | "audio" | "video";
}) {
  if (!runtimeApiUrl) throw new Error("RUNTIME_API_NOT_CONFIGURED");
  const query = new URLSearchParams({ from: input.from, to: input.to });
  if (input.mode) query.set("mode", input.mode);
  const response = await fetch(
    `${runtimeApiUrl}/v1/scheduling/providers/${encodeURIComponent(input.providerProfileId)}/slots?${query}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await errorOf(response, "SLOT_DISCOVERY_FAILED"));
  return response.json() as Promise<CandidateAppointmentSlotResult>;
}

export async function acquireAppointmentSlotHold(
  input: Omit<AppointmentSlotHoldInput, "confirmed">,
) {
  const response = await patientSchedulingFetch("/slot-holds", {
    method: "POST",
    body: JSON.stringify({ ...input, confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "SLOT_HOLD_FAILED"));
  return (await response.json() as { hold: AppointmentSlotHold }).hold;
}

export async function listAppointmentSlotHolds() {
  const response = await patientSchedulingFetch("/slot-holds");
  if (!response.ok) throw new Error(await errorOf(response, "SLOT_HOLD_LIST_FAILED"));
  return (await response.json() as { holds: AppointmentSlotHold[] }).holds;
}

export async function releaseAppointmentSlotHold(holdId: string) {
  const response = await patientSchedulingFetch(`/slot-holds/${encodeURIComponent(holdId)}/release`, {
    method: "POST",
    body: JSON.stringify({ confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "SLOT_HOLD_RELEASE_FAILED"));
  return response.json() as Promise<{ released: true; holdId: string }>;
}

export async function bookAppointment(
  input: Omit<BookAppointmentInput, "confirmed">,
) {
  const response = await patientSchedulingFetch("/appointments", {
    method: "POST",
    body: JSON.stringify({ ...input, confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "APPOINTMENT_BOOKING_FAILED"));
  return (await response.json() as { appointment: ManagedAppointment }).appointment;
}

export async function listPatientAppointments() {
  const response = await patientSchedulingFetch("/appointments");
  if (!response.ok) throw new Error(await errorOf(response, "APPOINTMENT_LIST_FAILED"));
  return (await response.json() as { appointments: ManagedAppointment[] }).appointments;
}

export async function patientAppointmentAction(
  appointmentId: string,
  action: "cancel" | "check-in",
  input: Omit<AppointmentTransitionInput, "confirmed"> = {},
) {
  const response = await patientSchedulingFetch(
    `/appointments/${encodeURIComponent(appointmentId)}/${action}`,
    { method: "POST", body: JSON.stringify({ ...input, confirmed: true }) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "APPOINTMENT_UPDATE_FAILED"));
  return (await response.json() as { appointment: ManagedAppointment }).appointment;
}

export async function reschedulePatientAppointment(
  appointmentId: string,
  input: Omit<RescheduleAppointmentInput, "confirmed">,
) {
  const response = await patientSchedulingFetch(
    `/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
    { method: "POST", body: JSON.stringify({ ...input, confirmed: true }) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "APPOINTMENT_RESCHEDULE_FAILED"));
  return (await response.json() as { appointment: ManagedAppointment }).appointment;
}

export async function listManagedAppointments() {
  const response = await schedulingFetch("/manage/appointments");
  if (!response.ok) throw new Error(await errorOf(response, "APPOINTMENT_LIST_FAILED"));
  return (await response.json() as { appointments: ManagedAppointment[] }).appointments;
}

export async function managedAppointmentAction(
  appointmentId: string,
  action: "confirm" | "start" | "complete" | "no-show" | "cancel",
  input: Omit<AppointmentTransitionInput, "confirmed"> = {},
) {
  const response = await schedulingFetch(
    `/manage/appointments/${encodeURIComponent(appointmentId)}/${action}`,
    { method: "POST", body: JSON.stringify({ ...input, confirmed: true }) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "APPOINTMENT_UPDATE_FAILED"));
  return (await response.json() as { appointment: ManagedAppointment }).appointment;
}

export async function rescheduleManagedAppointment(
  appointmentId: string,
  input: Omit<RescheduleAppointmentInput, "confirmed">,
) {
  const response = await schedulingFetch(
    `/manage/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
    { method: "POST", body: JSON.stringify({ ...input, confirmed: true }) },
  );
  if (!response.ok) throw new Error(await errorOf(response, "APPOINTMENT_RESCHEDULE_FAILED"));
  return (await response.json() as { appointment: ManagedAppointment }).appointment;
}
