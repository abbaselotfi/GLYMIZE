"use client";

import type {
  PatientHandoffArchivePage,
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
  return toAsciiDigits(value).trim().toUpperCase().replace(/[\s\-_/\\.]+/g, "");
}

export function validateIranianNationalId(value: string) {
  const code = normalizePatientCode(value);
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const sum = code.slice(0, 9).split("").reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  const expected = remainder < 2 ? remainder : 11 - remainder;
  return Number(code[9]) === expected;
}

function handoffError(status: number, fallback: string) {
  if (status === 401) return "HANDOFF_AUTH_REQUIRED";
  if (status === 403) return "HANDOFF_PERMISSION_DENIED";
  if (status === 409) return "AMBIGUOUS_PATIENT_CODE";
  if (status === 422 || status === 400) return "HANDOFF_INPUT_INVALID";
  if (status === 503) return "HANDOFF_BACKEND_NOT_CONFIGURED";
  return fallback;
}

export async function savePatientHandoff(input: PatientHandoffUpsertInput): Promise<PatientHandoffRecord> {
  const response = await runtimeFetch("/v1/patient-handoff/upsert", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(handoffError(response.status, "HANDOFF_SAVE_FAILED"));
  return response.json() as Promise<PatientHandoffRecord>;
}

export async function lookupPatientHandoff(patientCode: string): Promise<PatientHandoffLookupResult> {
  const normalized = normalizePatientCode(patientCode);
  if (!normalized) return { found: false };
  const response = await runtimeFetch("/v1/patient-handoff/lookup", {
    method: "POST",
    body: JSON.stringify({ patientCode }),
  });
  if (response.status === 404) return { found: false };
  if (!response.ok) throw new Error(handoffError(response.status, "HANDOFF_LOOKUP_FAILED"));
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
