"use client";

import type {
  PatientCodeKind,
  PatientHandoffCodeStatus,
  PatientHandoffRecord,
  PatientHandoffUpsertInput,
  PatientLongitudinalSummary,
  PatientEncounterClinicalSnapshot,
  PatientEncounterSummary,
} from "@glymize/contracts";
import {
  normalizePatientCode,
  validateIranianNationalId,
} from "@glymize/contracts";
export {
  normalizePatientCode,
  toAsciiDigits,
  validateIranianNationalId,
} from "@glymize/contracts";
import {
  createCareTeamPatientIntake,
  createPatientEncounter,
  getPatientEncounter,
  getPatientFileNumberAllocator,
  getPatientWorkspace,
  promoteLegacyHandoff,
  resolvePatient,
  revisePatientEncounter,
} from "./patient-record-v2-client";

const NEW_ENCOUNTER_PREFIX = "new-care-team:";

export class PatientHandoffCodeConflictError extends Error {
  readonly codeStatus?: PatientHandoffCodeStatus;

  constructor(codeStatus?: PatientHandoffCodeStatus) {
    super("PATIENT_CODE_EXISTS");
    this.name = "PatientHandoffCodeConflictError";
    this.codeStatus = codeStatus;
  }
}

function asLegacyStatus(status: PatientEncounterSummary["status"]): PatientHandoffRecord["status"] {
  if (status === "draft") return "draft";
  if (status === "ready_for_physician") return "ready_for_physician";
  return "reviewed";
}

function displayIdentifier(
  patient: PatientLongitudinalSummary,
  patientCodeKind: PatientCodeKind,
  patientCode: string,
) {
  const stored = patient.identifiers.find(
    (item) => item.kind === patientCodeKind,
  )?.displayMask;
  if (stored) return stored;
  const visible = patientCode.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(8, patientCode.length - visible.length)))}${visible}`;
}

function snapshotFromInput(input: PatientHandoffUpsertInput): PatientEncounterClinicalSnapshot {
  return {
    vitals: input.vitals ?? {},
    clinicalFlags: input.clinicalFlags ?? {},
    labs: input.labs ?? [],
    medications: input.medications ?? [],
    patientFieldProvenance: input.patientFieldProvenance ?? {},
    ...(input.demographics ? { demographics: input.demographics } : {}),
    ...(input.nurseNotes !== undefined ? { nurseNotes: input.nurseNotes } : {}),
    ...(input.ocrText !== undefined ? { ocrText: input.ocrText } : {}),
  };
}

function recordFromSnapshot(input: {
  patient: PatientLongitudinalSummary;
  encounter: PatientEncounterSummary;
  snapshot: PatientEncounterClinicalSnapshot;
  revision: number;
  patientCode: string;
  patientCodeKind: PatientCodeKind;
  updatedAt?: string;
}): PatientHandoffRecord {
  const { patient, encounter, snapshot } = input;
  return {
    id: encounter.encounterId,
    patientCodeKind: input.patientCodeKind,
    patientCodeDisplay: displayIdentifier(patient, input.patientCodeKind, input.patientCode),
    ...(patient.demographics?.firstName ? { firstName: patient.demographics.firstName } : {}),
    ...(patient.demographics?.lastName ? { lastName: patient.demographics.lastName } : {}),
    status: asLegacyStatus(encounter.status),
    createdAt: encounter.encounterAt,
    updatedAt: input.updatedAt ?? encounter.encounterAt,
    revision: input.revision,
    ...(snapshot.demographics ? { demographics: snapshot.demographics } : {}),
    ...(snapshot.patientFieldProvenance ? { patientFieldProvenance: snapshot.patientFieldProvenance } : {}),
    vitals: snapshot.vitals ?? {},
    clinicalFlags: snapshot.clinicalFlags ?? {},
    labs: snapshot.labs ?? [],
    medications: snapshot.medications ?? [],
    ...(snapshot.nurseNotes !== undefined ? { nurseNotes: snapshot.nurseNotes } : {}),
    ...(snapshot.ocrText !== undefined ? { ocrText: snapshot.ocrText } : {}),
  };
}

function blankRecord(
  patient: PatientLongitudinalSummary,
  patientCode: string,
  patientCodeKind: PatientCodeKind,
): PatientHandoffRecord {
  const now = new Date().toISOString();
  return {
    id: `${NEW_ENCOUNTER_PREFIX}${patient.patientId}`,
    patientCodeKind,
    patientCodeDisplay: displayIdentifier(patient, patientCodeKind, patientCode),
    ...(patient.demographics?.firstName ? { firstName: patient.demographics.firstName } : {}),
    ...(patient.demographics?.lastName ? { lastName: patient.demographics.lastName } : {}),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    revision: 0,
    vitals: {},
    clinicalFlags: {},
    labs: [],
    medications: [],
  };
}

function latestEditableCareTeamEncounter(encounters: PatientEncounterSummary[]) {
  return encounters
    .filter(
      (item) =>
        item.source === "care_team" &&
        (item.status === "draft" || item.status === "ready_for_physician"),
    )
    .sort((a, b) => b.encounterAt.localeCompare(a.encounterAt))[0];
}

async function recordForPatient(
  patient: PatientLongitudinalSummary,
  patientCode: string,
  patientCodeKind: PatientCodeKind,
  preferredEncounterId?: string,
): Promise<PatientHandoffRecord> {
  if (preferredEncounterId) {
    const detail = await getPatientEncounter(patient.patientId, preferredEncounterId);
    if (detail.encounter.source !== "care_team") {
      throw new Error("HANDOFF_UPDATE_TARGET_MISMATCH");
    }
    return recordFromSnapshot({
      patient,
      encounter: detail.encounter,
      snapshot: detail.latestSnapshot?.snapshot ?? {},
      revision: detail.latestSnapshot?.revision ?? 0,
      patientCode,
      patientCodeKind,
      updatedAt: detail.latestSnapshot?.createdAt,
    });
  }

  const workspace = await getPatientWorkspace(patient.patientId);
  const encounter = latestEditableCareTeamEncounter(workspace.encounters);
  if (!encounter) return blankRecord(patient, patientCode, patientCodeKind);

  const detail = await getPatientEncounter(patient.patientId, encounter.encounterId);
  return recordFromSnapshot({
    patient,
    encounter: detail.encounter,
    snapshot: detail.latestSnapshot?.snapshot ?? {},
    revision: detail.latestSnapshot?.revision ?? 0,
    patientCode,
    patientCodeKind,
    updatedAt: detail.latestSnapshot?.createdAt,
  });
}

async function resolveOrPromote(
  patientCode: string,
  patientCodeKind: PatientCodeKind,
) {
  const normalized = normalizePatientCode(patientCode);
  if (!normalized) return null;

  let resolved = await resolvePatient({
    identifier: normalized,
    kind: patientCodeKind,
  });

  if (resolved.patient) {
    return {
      patient: resolved.patient,
      patientCode: normalized,
      patientCodeKind: resolved.resolvedKind as PatientCodeKind,
    };
  }

  if (!resolved.legacyHandoff) return null;

  const promotion = await promoteLegacyHandoff({
    legacyHandoffId: resolved.legacyHandoff.id,
    expectedLegacyRevision: resolved.legacyHandoff.revision,
    identifier: {
      kind: resolved.legacyHandoff.kind,
      value: normalized,
      isPrimary: true,
    },
  });

  resolved = await resolvePatient({
    identifier: normalized,
    kind: resolved.legacyHandoff.kind,
  });
  if (!resolved.patient) {
    throw new Error("PATIENT_PROMOTION_RESOLVE_FAILED");
  }

  return {
    patient: resolved.patient,
    patientCode: normalized,
    patientCodeKind: resolved.resolvedKind as PatientCodeKind,
    promotedEncounterId: promotion.encounterId,
  };
}

export async function lookupPatientHandoff(
  patientCode: string,
  patientCodeKind?: PatientCodeKind,
): Promise<{ found: boolean; record?: PatientHandoffRecord }> {
  const normalized = normalizePatientCode(patientCode);
  if (!normalized) return { found: false };
  const kind = patientCodeKind ?? "file_number";
  const resolved = await resolveOrPromote(normalized, kind);
  if (!resolved) return { found: false };

  return {
    found: true,
    record: await recordForPatient(
      resolved.patient,
      resolved.patientCode,
      resolved.patientCodeKind,
      resolved.promotedEncounterId,
    ),
  };
}

export async function lookupPatientHandoffForReview(
  patientCode: string,
) {
  const normalized = normalizePatientCode(patientCode);
  if (!normalized) {
    return {
      found: false,
      resolution: "none" as const,
    };
  }

  try {
    const kinds: PatientCodeKind[] = [
      "file_number",
      "other",
    ];
    if (validateIranianNationalId(normalized)) {
      kinds.unshift("national_id");
    }

    const matches: Array<{
      kind: PatientCodeKind;
      resolved: Awaited<ReturnType<typeof resolvePatient>>;
    }> = [];

    for (const kind of kinds) {
      const resolved = await resolvePatient({
        identifier: normalized,
        kind,
      });

      if (resolved.patient || resolved.legacyHandoff) {
        matches.push({
          kind,
          resolved,
        });
      }
    }

    const patientIds = new Set<string>();
    const legacyIds = new Set<string>();

    for (const match of matches) {
      if (match.resolved.patient) {
        patientIds.add(match.resolved.patient.patientId);
      }
      if (match.resolved.legacyHandoff) {
        legacyIds.add(match.resolved.legacyHandoff.id);
      }
    }

    if (patientIds.size + legacyIds.size > 1) {
      throw new Error("AMBIGUOUS_PATIENT_CODE");
    }

    const patientMatch = matches.find(
      (item) => Boolean(item.resolved.patient),
    );

    if (patientMatch?.resolved.patient) {
      const patient = patientMatch.resolved.patient;
      const workspace = await getPatientWorkspace(
        patient.patientId,
      );

      const encounter = workspace.encounters.find(
        (item) =>
          item.source === "care_team" &&
          item.status === "ready_for_physician",
      );

      if (!encounter) {
        return {
          found: false,
          resolution: "patient_record_v2" as const,
          patientCodeKind: patientMatch.kind,
        };
      }

      const detail = await getPatientEncounter(
        patient.patientId,
        encounter.encounterId,
      );

      return {
        found: true,
        resolution: "patient_record_v2" as const,
        patientCodeKind: patientMatch.kind,
        record: recordFromSnapshot({
          patient,
          encounter: detail.encounter,
          snapshot: detail.latestSnapshot?.snapshot ?? {},
          revision: detail.latestSnapshot?.revision ?? 0,
          patientCode: normalized,
          patientCodeKind: patientMatch.kind,
          updatedAt: detail.latestSnapshot?.createdAt,
        }),
      };
    }

    const legacyMatch = matches.find(
      (item) => Boolean(item.resolved.legacyHandoff),
    );

    if (legacyMatch?.resolved.legacyHandoff) {
      return {
        found: false,
        resolution: "legacy" as const,
        patientCodeKind: legacyMatch.kind,
      };
    }

    return {
      found: false,
      resolution: "none" as const,
    };
  } catch (error) {
    translatePatientRecordError(error);
  }
}
async function codeStatusFromResolved(
  patientCode: string,
  patientCodeKind: PatientCodeKind,
): Promise<PatientHandoffCodeStatus> {
  const normalized = normalizePatientCode(patientCode);
  if (!normalized) {
    return { available: true, patientCodeKind };
  }

  const resolved = await resolvePatient({
    identifier: normalized,
    kind: patientCodeKind,
  });
  if (!resolved.found && !resolved.patient && !resolved.legacyHandoff) {
    return { available: true, patientCodeKind: resolved.resolvedKind as PatientCodeKind };
  }

  let existing: PatientHandoffCodeStatus["existing"];
  if (resolved.patient) {
    const record = await recordForPatient(
      resolved.patient,
      normalized,
      resolved.resolvedKind as PatientCodeKind,
    );
    existing = {
      id: record.id,
      patientCodeKind: record.patientCodeKind,
      patientCodeDisplay: record.patientCodeDisplay,
      ...(record.firstName ? { firstName: record.firstName } : {}),
      ...(record.lastName ? { lastName: record.lastName } : {}),
      ...(record.demographics ? { demographics: record.demographics } : {}),
      revision: record.revision,
      updatedAt: record.updatedAt,
    };
  } else if (resolved.legacyHandoff) {
    existing = {
      id: resolved.legacyHandoff.id,
      patientCodeKind: resolved.legacyHandoff.kind as PatientCodeKind,
      patientCodeDisplay: resolved.legacyHandoff.displayMask,
      revision: resolved.legacyHandoff.revision,
      updatedAt: resolved.legacyHandoff.updatedAt,
    };
  }

  let suggestion: PatientHandoffCodeStatus["suggestion"];
  if (patientCodeKind === "file_number") {
    const allocator = await getPatientFileNumberAllocator();
    if (allocator.status === "ready" && allocator.nextProposedNumber) {
      suggestion = {
        lastOccupiedCode: allocator.lastAllocatedNumber ?? normalized,
        suggestedCode: allocator.nextProposedNumber,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  return {
    available: false,
    patientCodeKind: resolved.resolvedKind as PatientCodeKind,
    ...(existing ? { existing } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}

export async function checkPatientHandoffCode(
  patientCode: string,
  patientCodeKind: PatientCodeKind,
): Promise<PatientHandoffCodeStatus> {
  return codeStatusFromResolved(patientCode, patientCodeKind);
}

function translatePatientRecordError(error: unknown): never {
  const code = error instanceof Error ? error.message : "PATIENT_RECORD_FAILED";
  if (code === "ENCOUNTER_REVISION_CONFLICT") {
    throw new Error("HANDOFF_REVISION_CONFLICT");
  }
  if (
    code === "PATIENT_RECORD_NOT_FOUND" ||
    code === "patient_not_found" ||
    code === "encounter_not_found"
  ) {
    throw new Error("HANDOFF_UPDATE_TARGET_MISMATCH");
  }
  if (
    code === "PATIENT_RECORD_AUTH_REQUIRED" ||
    code === "PATIENT_RECORD_PERMISSION_DENIED" ||
    code === "permission_denied" ||
    code === "assistant_required"
  ) {
    throw new Error("HANDOFF_UNAUTHORIZED");
  }
  if (
    code === "invalid_patient_identifier" ||
    code === "invalid_national_id" ||
    code === "PATIENT_RECORD_INPUT_INVALID"
  ) {
    throw new Error("HANDOFF_INPUT_INVALID");
  }
  throw error instanceof Error ? error : new Error(code);
}

export async function savePatientHandoff(
  input: PatientHandoffUpsertInput,
): Promise<PatientHandoffRecord> {
  const normalized = normalizePatientCode(input.patientCode);
  if (!normalized) throw new Error("HANDOFF_INPUT_INVALID");
  const snapshot = snapshotFromInput(input);

  try {
    if (input.writeMode === "update") {
      if (!input.expectedRecordId || input.expectedRevision === undefined) {
        throw new Error("HANDOFF_INPUT_INVALID");
      }

      const resolved = await resolvePatient({
        identifier: normalized,
        kind: input.patientCodeKind,
      });
      if (!resolved.patient) {
        throw new Error("HANDOFF_UPDATE_TARGET_MISMATCH");
      }

      if (input.expectedRecordId === `${NEW_ENCOUNTER_PREFIX}${resolved.patient.patientId}`) {
        if (input.expectedRevision !== 0) {
          throw new Error("HANDOFF_UPDATE_TARGET_MISMATCH");
        }
        const created = await createPatientEncounter(resolved.patient.patientId, {
          status: "ready_for_physician",
          snapshot,
        });
        return recordFromSnapshot({
          patient: resolved.patient,
          encounter: created.encounter,
          snapshot,
          revision: created.encounter.latestSnapshotRevision ?? 1,
          patientCode: normalized,
          patientCodeKind: resolved.resolvedKind as PatientCodeKind,
        });
      }

      const workspace = await getPatientWorkspace(resolved.patient.patientId);
      const belongsToPatient = workspace.encounters.some(
        (item: PatientEncounterSummary) => item.encounterId === input.expectedRecordId,
      );
      if (!belongsToPatient) {
        throw new Error("HANDOFF_UPDATE_TARGET_MISMATCH");
      }

      const revised = await revisePatientEncounter(
        resolved.patient.patientId,
        input.expectedRecordId,
        {
          expectedRevision: input.expectedRevision,
          snapshot,
          status: "ready_for_physician",
        },
      );
      return recordFromSnapshot({
        patient: resolved.patient,
        encounter: revised.encounter,
        snapshot,
        revision: revised.revision,
        patientCode: normalized,
        patientCodeKind: resolved.resolvedKind as PatientCodeKind,
      });
    }

    const collision = await resolvePatient({
      identifier: normalized,
      kind: input.patientCodeKind,
    });
    if (collision.found || collision.patient || collision.legacyHandoff) {
      throw new PatientHandoffCodeConflictError(
        await codeStatusFromResolved(normalized, input.patientCodeKind),
      );
    }

    const created = await createCareTeamPatientIntake({
      identifier: {
        kind: input.patientCodeKind,
        value: normalized,
        isPrimary: true,
      },
      demographics: {
        ...(input.firstName?.trim() ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName?.trim() ? { lastName: input.lastName.trim() } : {}),
      },
      snapshot,
    });

    return recordFromSnapshot({
      patient: created.patient,
      encounter: created.encounter,
      snapshot,
      revision: created.encounter.latestSnapshotRevision ?? 1,
      patientCode: normalized,
      patientCodeKind: input.patientCodeKind,
    });
  } catch (error) {
    if (error instanceof PatientHandoffCodeConflictError) throw error;
    const code = error instanceof Error ? error.message : "PATIENT_RECORD_FAILED";
    if (
      code === "PATIENT_IDENTIFIER_EXISTS" ||
      code === "PATIENT_IDENTIFIER_LEGACY_EXISTS" ||
      code === "PATIENT_RECORD_CONFLICT"
    ) {
      throw new PatientHandoffCodeConflictError(
        await codeStatusFromResolved(normalized, input.patientCodeKind),
      );
    }
    translatePatientRecordError(error);
  }
}
