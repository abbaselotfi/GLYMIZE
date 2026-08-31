"use client";

import type {
  PatientCareTeamIntakeInput,
  PatientCareTeamIntakeResult,
  PatientCreateInput,
  PatientCreateResult,
  PatientEncounterCreateInput,
  PatientEncounterCreateResult,
  PatientEncounterDetail,
  PatientEncounterRevisionInput,
  PatientEncounterRevisionResult,
  PatientFileNumberAllocatorInitializeInput,
  PatientFileNumberAllocatorState,
  PatientIdentifierAttachInput,
  PatientIdentifierAttachResult,
  PatientLegacyHandoffPromotionInput,
  PatientLegacyHandoffPromotionResult,
  PatientResolveInput,
  PatientResolveResult,
  PatientWorkspaceSnapshot,
} from "@glymize/contracts";
import { runtimeFetch } from "./runtime-client";

async function payload(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function patientRecordError(
  response: Response,
  body: Record<string, unknown> | null,
  fallback: string,
) {
  const code = String(body?.error ?? "");
  if (code) return code;
  if (response.status === 401) return "PATIENT_RECORD_AUTH_REQUIRED";
  if (response.status === 403) return "PATIENT_RECORD_PERMISSION_DENIED";
  if (response.status === 404) return "PATIENT_RECORD_NOT_FOUND";
  if (response.status === 409) return "PATIENT_RECORD_CONFLICT";
  if (response.status === 422 || response.status === 400) {
    return "PATIENT_RECORD_INPUT_INVALID";
  }
  return fallback;
}

async function checkedJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  if (!response.ok) {
    const body = await payload(response);
    throw new Error(
      patientRecordError(response, body, fallback),
    );
  }
  return response.json() as Promise<T>;
}

export async function getPatientFileNumberAllocator() {
  const response = await runtimeFetch(
    "/v1/patients/file-number-allocator",
  );
  return checkedJson<PatientFileNumberAllocatorState>(
    response,
    "PATIENT_FILE_NUMBER_ALLOCATOR_READ_FAILED",
  );
}

export async function initializePatientFileNumberAllocator(
  input: PatientFileNumberAllocatorInitializeInput,
) {
  const response = await runtimeFetch(
    "/v1/patients/file-number-allocator/initialize",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return checkedJson<PatientFileNumberAllocatorState>(
    response,
    "PATIENT_FILE_NUMBER_ALLOCATOR_INIT_FAILED",
  );
}

export async function resolvePatient(
  input: PatientResolveInput,
): Promise<PatientResolveResult> {
  const response = await runtimeFetch(
    "/v1/patients/resolve",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  if (response.status === 404) {
    const result = await response.json() as PatientResolveResult;
    return result;
  }

  return checkedJson<PatientResolveResult>(
    response,
    "PATIENT_RESOLVE_FAILED",
  );
}

export async function promoteLegacyHandoff(
  input: PatientLegacyHandoffPromotionInput,
) {
  const response = await runtimeFetch(
    "/v1/patients/promote-legacy-handoff",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return checkedJson<PatientLegacyHandoffPromotionResult>(
    response,
    "PATIENT_LEGACY_HANDOFF_PROMOTION_FAILED",
  );
}

export async function createCareTeamPatientIntake(
  input: PatientCareTeamIntakeInput,
) {
  const response = await runtimeFetch(
    "/v1/patients/care-team-intake",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return checkedJson<PatientCareTeamIntakeResult>(
    response,
    "PATIENT_CARE_TEAM_INTAKE_FAILED",
  );
}

export async function createPatient(
  input: PatientCreateInput,
) {
  const response = await runtimeFetch(
    "/v1/patients",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return checkedJson<PatientCreateResult>(
    response,
    "PATIENT_CREATE_FAILED",
  );
}

export async function attachPatientIdentifier(
  patientId: string,
  input: PatientIdentifierAttachInput,
) {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/identifiers`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return checkedJson<PatientIdentifierAttachResult>(
    response,
    "PATIENT_IDENTIFIER_ATTACH_FAILED",
  );
}

export async function createPatientEncounter(
  patientId: string,
  input: PatientEncounterCreateInput,
) {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/encounters`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return checkedJson<PatientEncounterCreateResult>(
    response,
    "PATIENT_ENCOUNTER_CREATE_FAILED",
  );
}

export async function getPatientEncounter(
  patientId: string,
  encounterId: string,
) {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/encounters/${encodeURIComponent(encounterId)}`,
  );
  return checkedJson<PatientEncounterDetail>(
    response,
    "PATIENT_ENCOUNTER_READ_FAILED",
  );
}

export async function revisePatientEncounter(
  patientId: string,
  encounterId: string,
  input: PatientEncounterRevisionInput,
) {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/encounters/${encodeURIComponent(encounterId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return checkedJson<PatientEncounterRevisionResult>(
    response,
    "PATIENT_ENCOUNTER_REVISION_FAILED",
  );
}

export async function getPatientWorkspace(
  patientId: string,
) {
  const response = await runtimeFetch(
    `/v1/patients/${encodeURIComponent(patientId)}/workspace`,
  );
  return checkedJson<PatientWorkspaceSnapshot>(
    response,
    "PATIENT_WORKSPACE_READ_FAILED",
  );
}
