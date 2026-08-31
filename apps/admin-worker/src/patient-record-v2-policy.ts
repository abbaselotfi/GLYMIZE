
import {
  normalizePatientCode,
  validateIranianNationalId,
  type PatientIdentifierKind,
} from "@glymize/contracts";

export type { PatientIdentifierKind } from "@glymize/contracts";

export const MAX_FILE_NUMBER =
  999_999_999_999_999_999n;

export function resolveSmartPatientIdentifierKind(
  value: string,
  explicitKind?: unknown,
): PatientIdentifierKind | null {
  if (
    explicitKind !== undefined &&
    explicitKind !== null &&
    explicitKind !== ""
  ) {
    const kind = String(explicitKind);
    return kind === "file_number" ||
      kind === "national_id" ||
      kind === "other"
      ? kind
      : null;
  }

  return validateIranianNationalId(value)
    ? "national_id"
    : "file_number";
}

export function parseNumericFileNumber(value: string) {
  const normalized = normalizePatientCode(value);
  if (!/^\d{1,18}$/.test(normalized)) return null;

  const number = BigInt(normalized);
  if (
    number < 0n ||
    number > MAX_FILE_NUMBER
  ) {
    return null;
  }

  return {
    normalized,
    number,
    width: normalized.length,
  };
}

export function nextNumericFileNumber(
  lastAllocated: string,
  displayWidth: number,
) {
  const parsed = parseNumericFileNumber(lastAllocated);
  if (
    !parsed ||
    !Number.isInteger(displayWidth) ||
    displayWidth < 1 ||
    displayWidth > 18
  ) {
    return null;
  }

  const next = parsed.number + 1n;
  if (next > MAX_FILE_NUMBER) return null;

  return next.toString().padStart(displayWidth, "0");
}

export function normalizeEncounterTimestamp(
  value: unknown,
  fallbackIso: string,
) {
  const text = String(value ?? "").trim();
  if (!text) return fallbackIso;

  const parsed = Date.parse(text);
  return Number.isNaN(parsed)
    ? null
    : new Date(parsed).toISOString();
}

export function observationIndexKey(
  canonicalKey: unknown,
  rawName: unknown,
) {
  const canonical = String(canonicalKey ?? "").trim();
  if (canonical) return canonical.slice(0, 120);

  const raw = String(rawName ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);

  return raw ? `raw:${raw}` : "raw:unmapped";
}
