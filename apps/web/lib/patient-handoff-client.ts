"use client";

import type {
  PatientHandoffLookupResult,
  PatientHandoffRecord,
  PatientHandoffUpsertInput,
} from "@glymize/contracts";

const remoteApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const handoffToken = process.env.NEXT_PUBLIC_PATIENT_HANDOFF_TOKEN ?? "";

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

function requireLocalPreviewApi() {
  if (!remoteApiUrl || !handoffToken) throw new Error("HANDOFF_API_NOT_CONFIGURED");
  return remoteApiUrl;
}

function apiHeaders() {
  return {
    "content-type": "application/json",
    "x-glymize-handoff-token": handoffToken,
  };
}

export async function savePatientHandoff(input: PatientHandoffUpsertInput): Promise<PatientHandoffRecord> {
  const apiUrl = requireLocalPreviewApi();
  const response = await fetch(`${apiUrl}/v1/patient-handoff/upsert`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const code = response.status === 401
      ? "HANDOFF_UNAUTHORIZED"
      : response.status === 400
        ? "HANDOFF_INPUT_INVALID"
        : "HANDOFF_SAVE_FAILED";
    throw new Error(code);
  }
  return response.json() as Promise<PatientHandoffRecord>;
}

export async function lookupPatientHandoff(patientCode: string): Promise<PatientHandoffLookupResult> {
  const normalized = normalizePatientCode(patientCode);
  if (!normalized) return { found: false };
  const apiUrl = requireLocalPreviewApi();
  const response = await fetch(`${apiUrl}/v1/patient-handoff/lookup`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ patientCode }),
  });
  if (response.status === 404) return { found: false };
  if (!response.ok) {
    const code = response.status === 401
      ? "HANDOFF_UNAUTHORIZED"
      : response.status === 409
        ? "AMBIGUOUS_PATIENT_CODE"
        : "HANDOFF_LOOKUP_FAILED";
    throw new Error(code);
  }
  return response.json() as Promise<PatientHandoffLookupResult>;
}
