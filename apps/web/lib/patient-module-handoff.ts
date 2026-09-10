"use client";

import {
  PATIENT_MODULE_HANDOFF_SCHEMA_VERSION,
  type PatientModuleHandoffIntent,
  type PatientModuleSourceRevision,
} from "@glymize/contracts/clinical-modules";

const storageKey = "glymize-patient-module-handoff-v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | null {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

function nonEmptyText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseSourceRevision(value: unknown): PatientModuleSourceRevision | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const factId = nonEmptyText(candidate.factId);
  if (!factId || !validRevision(candidate.revision)) return null;
  if (
    candidate.verification !== "verified" &&
    candidate.verification !== "unverified" &&
    candidate.verification !== "rejected" &&
    candidate.verification !== "unknown"
  ) {
    return null;
  }
  if (
    candidate.freshness !== "current" &&
    candidate.freshness !== "stale" &&
    candidate.freshness !== "unknown"
  ) {
    return null;
  }
  return {
    factId,
    revision: candidate.revision,
    verification: candidate.verification,
    freshness: candidate.freshness,
  };
}

export function patientModuleSourceRevisionFingerprint(
  revisions: readonly PatientModuleSourceRevision[],
) {
  const fingerprint = revisions
    .map((item) =>
      `${item.factId}@${item.revision}:${item.verification}:${item.freshness}`,
    )
    .sort((left, right) => left.localeCompare(right))
    .join("|");
  return fingerprint || "none";
}

export function createPatientModuleHandoffIntent(input: {
  moduleId: string;
  practiceId: string;
  patientId: string;
  sourceRevisions: readonly PatientModuleSourceRevision[];
}): PatientModuleHandoffIntent {
  const sourceRevisions = [...input.sourceRevisions].sort((left, right) =>
    left.factId.localeCompare(right.factId),
  );
  return {
    schemaVersion: PATIENT_MODULE_HANDOFF_SCHEMA_VERSION,
    moduleId: input.moduleId,
    scope: {
      practiceId: input.practiceId,
      patientId: input.patientId,
    },
    sourceRevisionFingerprint:
      patientModuleSourceRevisionFingerprint(sourceRevisions),
    sourceRevisions,
  };
}

export function writePatientModuleHandoffIntent(
  intent: PatientModuleHandoffIntent,
  storage: StorageLike | null = browserStorage(),
) {
  if (!storage) return false;
  storage.setItem(storageKey, JSON.stringify(intent));
  return true;
}

export function clearPatientModuleHandoffIntent(
  storage: StorageLike | null = browserStorage(),
) {
  storage?.removeItem(storageKey);
}

export function readPatientModuleHandoffIntent(
  expectedModuleId: string,
  storage: StorageLike | null = browserStorage(),
): PatientModuleHandoffIntent | null {
  if (!storage) return null;
  const raw = storage.getItem(storageKey);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    storage.removeItem(storageKey);
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const scope = candidate.scope && typeof candidate.scope === "object"
    ? candidate.scope as Record<string, unknown>
    : null;
  const moduleId = nonEmptyText(candidate.moduleId);
  const practiceId = scope ? nonEmptyText(scope.practiceId) : undefined;
  const patientId = scope ? nonEmptyText(scope.patientId) : undefined;
  const fingerprint = nonEmptyText(candidate.sourceRevisionFingerprint);
  const rawRevisions = Array.isArray(candidate.sourceRevisions)
    ? candidate.sourceRevisions
    : null;
  const revisions = rawRevisions?.map(parseSourceRevision) ?? [];

  if (
    candidate.schemaVersion !== PATIENT_MODULE_HANDOFF_SCHEMA_VERSION ||
    moduleId !== expectedModuleId ||
    !practiceId ||
    !patientId ||
    !fingerprint ||
    !rawRevisions ||
    revisions.some((item) => item === null)
  ) {
    storage.removeItem(storageKey);
    return null;
  }

  const sourceRevisions = revisions as PatientModuleSourceRevision[];
  if (patientModuleSourceRevisionFingerprint(sourceRevisions) !== fingerprint) {
    storage.removeItem(storageKey);
    return null;
  }

  return {
    schemaVersion: PATIENT_MODULE_HANDOFF_SCHEMA_VERSION,
    moduleId,
    scope: { practiceId, patientId },
    sourceRevisionFingerprint: fingerprint,
    sourceRevisions,
  };
}
