import {
  base64UrlToBytes,
  bytesToBase64Url,
  constantTimeEqual,
  hmacHex,
} from "../runtime-security";

export const PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE = 80;
export const PATIENT_CORE_DEFAULT_TIMELINE_PAGE_SIZE = 60;
export const PATIENT_CORE_MAX_PAGE_SIZE = 200;
export const PATIENT_CORE_OBSERVATION_BYTE_BUDGET = 192 * 1024;

export type PatientCorePageScope = {
  practiceId: string;
  patientId: string;
};

export type PatientCoreObservationCursorPosition = {
  observedAt: string;
  createdAt: string;
  id: string;
};

export type PatientCoreTimelineCursorPosition = {
  effectiveAt: string;
  eventId: string;
};

type CursorFamily = "observations" | "timeline";
type CursorBase = {
  v: 1;
  practiceId: string;
  patientId: string;
  sourceVersion: string;
};

type ObservationCursorPayload = CursorBase & {
  family: "observations";
  position: PatientCoreObservationCursorPosition;
};

type TimelineCursorPayload = CursorBase & {
  family: "timeline";
  position: PatientCoreTimelineCursorPosition;
};

const MAX_CURSOR_LENGTH = 4_096;
const CURSOR_MAC_CONTEXT = "patient-history-cursor-v1";

function validText(value: unknown, max = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function validTimestamp(value: unknown): value is string {
  return validText(value, 64) && !Number.isNaN(Date.parse(value));
}

function encodePayload(payload: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(encoded: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
  } catch {
    throw new Error("PATIENT_HISTORY_CURSOR_INVALID");
  }
}

async function signEncodedPayload(encoded: string, secret: string) {
  return hmacHex(secret, `${CURSOR_MAC_CONTEXT}:${encoded}`);
}

async function encodeCursor(payload: unknown, secret: string) {
  const encoded = encodePayload(payload);
  const signature = await signEncodedPayload(encoded, secret);
  return `${encoded}.${signature}`;
}

async function decodeCursor(cursor: string, secret: string): Promise<unknown> {
  if (!validText(cursor, MAX_CURSOR_LENGTH)) {
    throw new Error("PATIENT_HISTORY_CURSOR_INVALID");
  }
  const parts = cursor.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("PATIENT_HISTORY_CURSOR_INVALID");
  }
  const [encoded, receivedSignature] = parts;
  const expectedSignature = await signEncodedPayload(encoded, secret);
  if (!(await constantTimeEqual(expectedSignature, receivedSignature))) {
    throw new Error("PATIENT_HISTORY_CURSOR_INVALID");
  }
  return decodePayload(encoded);
}

function assertBase(
  value: unknown,
  family: CursorFamily,
  scope: PatientCorePageScope,
): CursorBase & { family: CursorFamily; position: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("PATIENT_HISTORY_CURSOR_INVALID");
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.v !== 1 ||
    payload.family !== family ||
    payload.practiceId !== scope.practiceId ||
    payload.patientId !== scope.patientId ||
    !validTimestamp(payload.sourceVersion)
  ) {
    throw new Error("PATIENT_HISTORY_CURSOR_SCOPE_MISMATCH");
  }
  return payload as CursorBase & { family: CursorFamily; position: unknown };
}

export function normalizePatientCorePageSize(
  requested: number | undefined,
  fallback: number,
) {
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.max(1, Math.min(PATIENT_CORE_MAX_PAGE_SIZE, Math.trunc(requested)));
}

export function normalizePatientCoreSourceVersion(value?: string) {
  const candidate = value ?? new Date().toISOString();
  if (!validTimestamp(candidate)) {
    throw new Error("PATIENT_HISTORY_SOURCE_VERSION_INVALID");
  }
  return candidate;
}

export async function encodePatientObservationCursor(
  scope: PatientCorePageScope,
  sourceVersion: string,
  position: PatientCoreObservationCursorPosition,
  secret: string,
) {
  const payload: ObservationCursorPayload = {
    v: 1,
    family: "observations",
    ...scope,
    sourceVersion: normalizePatientCoreSourceVersion(sourceVersion),
    position,
  };
  return encodeCursor(payload, secret);
}

export async function decodePatientObservationCursor(
  cursor: string,
  scope: PatientCorePageScope,
  secret: string,
) {
  const payload = assertBase(
    await decodeCursor(cursor, secret),
    "observations",
    scope,
  );
  const position = payload.position as Record<string, unknown> | null;
  if (
    !position ||
    !validTimestamp(position.observedAt) ||
    !validTimestamp(position.createdAt) ||
    !validText(position.id)
  ) {
    throw new Error("PATIENT_HISTORY_CURSOR_INVALID");
  }
  return {
    sourceVersion: payload.sourceVersion,
    position: {
      observedAt: position.observedAt,
      createdAt: position.createdAt,
      id: position.id,
    },
  };
}

export async function encodePatientTimelineCursor(
  scope: PatientCorePageScope,
  sourceVersion: string,
  position: PatientCoreTimelineCursorPosition,
  secret: string,
) {
  const payload: TimelineCursorPayload = {
    v: 1,
    family: "timeline",
    ...scope,
    sourceVersion: normalizePatientCoreSourceVersion(sourceVersion),
    position,
  };
  return encodeCursor(payload, secret);
}

export async function decodePatientTimelineCursor(
  cursor: string,
  scope: PatientCorePageScope,
  secret: string,
) {
  const payload = assertBase(
    await decodeCursor(cursor, secret),
    "timeline",
    scope,
  );
  const position = payload.position as Record<string, unknown> | null;
  if (
    !position ||
    !validTimestamp(position.effectiveAt) ||
    !validText(position.eventId)
  ) {
    throw new Error("PATIENT_HISTORY_CURSOR_INVALID");
  }
  return {
    sourceVersion: payload.sourceVersion,
    position: {
      effectiveAt: position.effectiveAt,
      eventId: position.eventId,
    },
  };
}
