"use client";

import type {
  PatientCodeKind,
  PatientHandoffArchivePage,
  PatientHandoffLookupResult,
  PatientHandoffRecord,
} from "@glymize/contracts";
import { normalizePatientCode } from "@glymize/contracts";
export {
  normalizePatientCode,
  toAsciiDigits,
  validateIranianNationalId,
} from "@glymize/contracts";
import { runtimeFetch } from "./runtime-client";

function handoffError(
  status: number,
  fallback: string,
  serverCode?: string,
) {
  if (status === 401) return "HANDOFF_AUTH_REQUIRED";
  if (status === 403) return "HANDOFF_PERMISSION_DENIED";
  if (status === 409) {
    if (
      serverCode === "HANDOFF_REVISION_CONFLICT"
    ) {
      return "HANDOFF_REVISION_CONFLICT";
    }
    if (
      serverCode === "HANDOFF_UPDATE_TARGET_MISMATCH"
    ) {
      return "HANDOFF_UPDATE_TARGET_MISMATCH";
    }
    if (serverCode === "AMBIGUOUS_PATIENT_CODE") {
      return "AMBIGUOUS_PATIENT_CODE";
    }
    return "HANDOFF_CONFLICT";
  }
  if (status === 422 || status === 400) {
    return "HANDOFF_INPUT_INVALID";
  }
  if (status === 503) {
    return "HANDOFF_BACKEND_NOT_CONFIGURED";
  }
  return fallback;
}

async function responsePayload(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function lookupPatientHandoff(
  patientCode: string,
  patientCodeKind?: PatientCodeKind,
): Promise<PatientHandoffLookupResult> {
  const normalized = normalizePatientCode(patientCode);
  if (!normalized) return { found: false };

  const response = await runtimeFetch(
    "/v1/patient-handoff/lookup",
    {
      method: "POST",
      body: JSON.stringify({
        patientCode,
        ...(patientCodeKind
          ? { patientCodeKind }
          : {}),
      }),
    },
  );

  if (response.status === 404) {
    return { found: false };
  }
  if (!response.ok) {
    const payload = await responsePayload(response);
    throw new Error(
      handoffError(
        response.status,
        "HANDOFF_LOOKUP_FAILED",
        String(payload?.error ?? ""),
      ),
    );
  }

  return response.json() as Promise<PatientHandoffLookupResult>;
}

export async function listPatientHandoffs(
  cursor?: string | null,
  limit = 50,
): Promise<PatientHandoffArchivePage> {
  const query = new URLSearchParams({
    limit: String(limit),
  });
  if (cursor) query.set("cursor", cursor);

  const response = await runtimeFetch(
    `/v1/patient-handoff/list?${query.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(
      handoffError(
        response.status,
        "HANDOFF_ARCHIVE_LIST_FAILED",
      ),
    );
  }

  return response.json() as Promise<PatientHandoffArchivePage>;
}

export async function getPatientHandoffById(
  recordId: string,
): Promise<PatientHandoffRecord> {
  const response = await runtimeFetch(
    `/v1/patient-handoff/records/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    throw new Error("HANDOFF_NOT_FOUND");
  }

  if (!response.ok) {
    throw new Error(
      handoffError(
        response.status,
        "HANDOFF_ARCHIVE_OPEN_FAILED",
      ),
    );
  }

  return response.json() as Promise<PatientHandoffRecord>;
}
