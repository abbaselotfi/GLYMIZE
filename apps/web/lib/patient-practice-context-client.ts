"use client";

import type {
  PatientPracticeContext,
  PatientPracticeContextCapabilities,
  PatientPracticeContextSelection,
} from "@glymize/contracts";
import { patientIdentityFetch } from "./patient-identity-client";
import { runtimeApiUrl } from "./runtime-api-url";

const STORAGE_KEY = "glymize.patient.practice-context.v1";

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return String(body?.error ?? fallback);
}

export async function getPatientPracticeContextCapabilities() {
  if (!runtimeApiUrl) throw new Error("RUNTIME_API_NOT_CONFIGURED");
  const response = await fetch(`${runtimeApiUrl}/v1/patient-practice-contexts/capabilities`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorOf(response, "PATIENT_CONTEXT_CAPABILITIES_FAILED"));
  return response.json() as Promise<PatientPracticeContextCapabilities>;
}

export async function listPatientPracticeContexts() {
  const response = await patientIdentityFetch("/v1/patient-practice-contexts", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorOf(response, "PATIENT_CONTEXT_LIST_FAILED"));
  const body = await response.json() as { contexts: PatientPracticeContext[] };
  return body.contexts;
}

export async function selectPatientPracticeContext(contextId: string) {
  const response = await patientIdentityFetch("/v1/patient-practice-contexts/select", {
    method: "POST",
    body: JSON.stringify({ contextId, confirmed: true }),
  });
  if (!response.ok) throw new Error(await errorOf(response, "PATIENT_CONTEXT_SELECTION_FAILED"));
  const body = await response.json() as { selection: PatientPracticeContextSelection };
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(STORAGE_KEY, body.selection.context.id);
  }
  return body.selection;
}

export function resolveSelectedPatientPracticeContext(
  contexts: readonly PatientPracticeContext[],
) {
  if (typeof window === "undefined") return null;
  const selectedId = window.sessionStorage.getItem(STORAGE_KEY);
  const selected = contexts.find((context) => context.id === selectedId && context.selectable) ?? null;
  if (!selected && selectedId) window.sessionStorage.removeItem(STORAGE_KEY);
  return selected;
}

export function clearSelectedPatientPracticeContext() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(STORAGE_KEY);
}
