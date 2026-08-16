"use client";

import type {
  PatientCodeKind,
  PatientHandoffArchivePage,
  PatientHandoffCodeStatus,
  PatientHandoffLookupResult,
  PatientHandoffRecord,
  PatientHandoffUpsertInput,
} from "@glymize/contracts";
import { runtimeFetch } from "./runtime-client";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toAsciiDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const p = PERSIAN_DIGITS.indexOf(digit);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(digit);
    return a >= 0 ? String(a) : digit;
  });
}

export function normalizePatientCode(value: string) {
  return toAsciiDigits(value)
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/\\\.]+/g, "");
}

export function validateIranianNationalId(value: string) {
  const code = normalizePatientCode(value);
  if (
    !/^\d{10}$/.test(code) ||
    /^(\d)\1{9}$/.test(code)
  ) {
    return false;
  }
  const sum = code
    .slice(0, 9)
    .split("")
    .reduce(
      (acc, digit, index) =>
        acc + Number(digit) * (10 - index),
      0,
    );
  const remainder = sum % 11;
  const expected =
    remainder < 2 ? remainder : 11 - remainder;
  return Number(code[9]) === expected;
}

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

export class PatientHandoffCodeConflictError
  extends Error {
  readonly codeStatus?: PatientHandoffCodeStatus;

  constructor(codeStatus?: PatientHandoffCodeStatus) {
    super("PATIENT_CODE_EXISTS");
    this.name = "PatientHandoffCodeConflictError";
    this.codeStatus = codeStatus;
  }
}

export async function savePatientHandoff(
  input: PatientHandoffUpsertInput,
): Promise<PatientHandoffRecord> {
  const response = await runtimeFetch(
    "/v1/patient-handoff/upsert",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    const payload = await responsePayload(response);
    const serverCode = String(
      payload?.error ?? "",
    );

    if (
      response.status === 409 &&
      serverCode === "PATIENT_CODE_EXISTS"
    ) {
      throw new PatientHandoffCodeConflictError(
        payload?.codeStatus as
          | PatientHandoffCodeStatus
          | undefined,
      );
    }

    throw new Error(
      handoffError(
        response.status,
        "HANDOFF_SAVE_FAILED",
        serverCode,
      ),
    );
  }

  return response.json() as Promise<PatientHandoffRecord>;
}

export async function checkPatientHandoffCode(
  patientCode: string,
  patientCodeKind: PatientCodeKind,
): Promise<PatientHandoffCodeStatus> {
  const response = await runtimeFetch(
    "/v1/patient-handoff/code-status",
    {
      method: "POST",
      body: JSON.stringify({
        patientCode,
        patientCodeKind,
      }),
    },
  );

  if (!response.ok) {
    const payload = await responsePayload(response);
    throw new Error(
      handoffError(
        response.status,
        "HANDOFF_CODE_STATUS_FAILED",
        String(payload?.error ?? ""),
      ),
    );
  }

  return response.json() as Promise<PatientHandoffCodeStatus>;
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
