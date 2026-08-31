"use client";

import type {
  PatientCodeKind,
  PatientEncounterClinicalSnapshot,
  PatientEncounterSummary,
  PatientHandoffRecord,
  PatientLongitudinalSummary,
  PatientRecordArchiveItem,
  PatientRecordArchivePage,
} from "@glymize/contracts";
import {
  normalizePatientCode,
  validateIranianNationalId,
} from "@glymize/contracts";
import {
  getPatientEncounter,
  getPatientWorkspace,
  resolvePatient,
} from "./patient-record-v2-client";
import {
  getPatientHandoffById as getLegacyPatientHandoffById,
  lookupPatientHandoff as lookupLegacyPatientHandoff,
} from "./patient-handoff-client";
import { runtimeFetch } from "./runtime-client";

function archiveStatus(
  status: PatientEncounterSummary["status"],
): PatientHandoffRecord["status"] {
  if (status === "draft") return "draft";
  if (status === "ready_for_physician") {
    return "ready_for_physician";
  }
  return "reviewed";
}

function identifierDisplay(
  patient: PatientLongitudinalSummary,
  kind: PatientCodeKind,
) {
  return (
    patient.identifiers.find(
      (item) => item.kind === kind,
    )?.displayMask ??
    patient.identifiers.find(
      (item) => item.isPrimary,
    )?.displayMask ??
    patient.identifiers[0]?.displayMask ??
    "••••"
  );
}

function recordFromV2Archive(input: {
  id: string;
  patient: PatientLongitudinalSummary;
  encounter: PatientEncounterSummary;
  snapshot: PatientEncounterClinicalSnapshot;
  revision: number;
  patientCodeKind: PatientCodeKind;
  patientCodeDisplay: string;
  updatedAt?: string;
}): PatientHandoffRecord {
  const {
    patient,
    encounter,
    snapshot,
  } = input;

  return {
    id: input.id,
    patientCodeKind: input.patientCodeKind,
    patientCodeDisplay: input.patientCodeDisplay,
    ...(patient.demographics?.firstName
      ? {
          firstName:
            patient.demographics.firstName,
        }
      : {}),
    ...(patient.demographics?.lastName
      ? {
          lastName:
            patient.demographics.lastName,
        }
      : {}),
    status: archiveStatus(encounter.status),
    createdAt: encounter.encounterAt,
    updatedAt:
      input.updatedAt ?? encounter.encounterAt,
    revision: input.revision,
    ...(snapshot.demographics
      ? { demographics: snapshot.demographics }
      : {}),
    ...(snapshot.patientFieldProvenance
      ? {
          patientFieldProvenance:
            snapshot.patientFieldProvenance,
        }
      : {}),
    vitals: snapshot.vitals ?? {},
    clinicalFlags: snapshot.clinicalFlags ?? {},
    labs: snapshot.labs ?? [],
    medications: snapshot.medications ?? [],
    ...(snapshot.nurseNotes !== undefined
      ? { nurseNotes: snapshot.nurseNotes }
      : {}),
    ...(snapshot.ocrText !== undefined
      ? { ocrText: snapshot.ocrText }
      : {}),
  };
}

function archiveReadError(
  response: Response,
  fallback: string,
) {
  if (response.status === 401) {
    return "HANDOFF_AUTH_REQUIRED";
  }
  if (response.status === 403) {
    return "HANDOFF_PERMISSION_DENIED";
  }
  if (response.status === 404) {
    return "HANDOFF_NOT_FOUND";
  }
  return fallback;
}

export async function listPatientRecordArchive(
  cursor?: string | null,
  limit = 50,
): Promise<PatientRecordArchivePage> {
  const query = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) {
    query.set("cursor", cursor);
  }

  const response = await runtimeFetch(
    `/v1/patients/archive?${query.toString()}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error(
      archiveReadError(
        response,
        "HANDOFF_ARCHIVE_LIST_FAILED",
      ),
    );
  }

  return response.json() as Promise<PatientRecordArchivePage>;
}

export async function openPatientRecordArchiveItem(
  item: PatientRecordArchiveItem,
): Promise<PatientHandoffRecord> {
  if (item.source === "legacy_handoff") {
    if (!item.legacyHandoffId) {
      throw new Error("HANDOFF_NOT_FOUND");
    }

    const legacy = await getLegacyPatientHandoffById(
      item.legacyHandoffId,
    );

    return {
      ...legacy,
      id: item.id,
    };
  }

  if (!item.patientId || !item.encounterId) {
    throw new Error("HANDOFF_NOT_FOUND");
  }

  try {
    const workspace = await getPatientWorkspace(
      item.patientId,
    );

    const encounter = workspace.encounters.find(
      (candidate) =>
        candidate.encounterId === item.encounterId,
    );

    if (!encounter) {
      throw new Error("HANDOFF_NOT_FOUND");
    }

    const detail = await getPatientEncounter(
      item.patientId,
      item.encounterId,
    );

    return recordFromV2Archive({
      id: item.id,
      patient: workspace.patient,
      encounter: detail.encounter,
      snapshot:
        detail.latestSnapshot?.snapshot ?? {},
      revision:
        detail.latestSnapshot?.revision ?? 0,
      patientCodeKind: item.patientCodeKind,
      patientCodeDisplay:
        item.patientCodeDisplay,
      updatedAt:
        detail.latestSnapshot?.createdAt ??
        item.updatedAt,
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "HANDOFF_ARCHIVE_OPEN_FAILED";

    if (
      code === "PATIENT_RECORD_NOT_FOUND" ||
      code === "patient_not_found" ||
      code === "encounter_not_found"
    ) {
      throw new Error("HANDOFF_NOT_FOUND");
    }

    throw error;
  }
}

export async function searchPatientRecordArchive(
  patientCode: string,
): Promise<{
  found: boolean;
  record?: PatientHandoffRecord;
}> {
  const normalized =
    normalizePatientCode(patientCode);

  if (!normalized) {
    return { found: false };
  }

  const kinds: PatientCodeKind[] = [
    "file_number",
    "other",
  ];

  if (validateIranianNationalId(normalized)) {
    kinds.unshift("national_id");
  }

  const matches: Array<{
    kind: PatientCodeKind;
    resolved: Awaited<
      ReturnType<typeof resolvePatient>
    >;
  }> = [];

  for (const kind of kinds) {
    const resolved = await resolvePatient({
      identifier: normalized,
      kind,
    });

    if (
      resolved.patient ||
      resolved.legacyHandoff
    ) {
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
      patientIds.add(
        match.resolved.patient.patientId,
      );
    }

    if (match.resolved.legacyHandoff) {
      legacyIds.add(
        match.resolved.legacyHandoff.id,
      );
    }
  }

  if (patientIds.size + legacyIds.size > 1) {
    throw new Error(
      "AMBIGUOUS_PATIENT_CODE",
    );
  }

  const patientMatch = matches.find(
    (item) => Boolean(item.resolved.patient),
  );

  if (patientMatch?.resolved.patient) {
    const patient =
      patientMatch.resolved.patient;

    const workspace =
      await getPatientWorkspace(
        patient.patientId,
      );

    const encounter =
      workspace.encounters[0];

    if (!encounter) {
      return { found: false };
    }

    const detail =
      await getPatientEncounter(
        patient.patientId,
        encounter.encounterId,
      );

    const kind =
      patientMatch.resolved
        .resolvedKind as PatientCodeKind;

    return {
      found: true,
      record: recordFromV2Archive({
        id:
          `v2:${patient.patientId}:${encounter.encounterId}`,
        patient,
        encounter: detail.encounter,
        snapshot:
          detail.latestSnapshot?.snapshot ?? {},
        revision:
          detail.latestSnapshot?.revision ?? 0,
        patientCodeKind: kind,
        patientCodeDisplay:
          patientMatch.resolved
            .matchedIdentifier
            ?.displayMask ??
          identifierDisplay(patient, kind),
        updatedAt:
          detail.latestSnapshot?.createdAt,
      }),
    };
  }

  const legacyMatch = matches.find(
    (item) =>
      Boolean(
        item.resolved.legacyHandoff,
      ),
  );

  if (
    legacyMatch?.resolved.legacyHandoff
  ) {
    const result =
      await lookupLegacyPatientHandoff(
        normalized,
        legacyMatch.kind,
      );

    if (!result.found || !result.record) {
      return { found: false };
    }

    return {
      found: true,
      record: {
        ...result.record,
        id:
          `legacy:${result.record.id}`,
      },
    };
  }

  return { found: false };
}