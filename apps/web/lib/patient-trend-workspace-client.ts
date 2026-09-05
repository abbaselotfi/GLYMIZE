"use client";

import type {
  PatientHandoffRecord,
  PatientHandoffStatus,
  PatientRecordArchiveItem,
  PatientWorkspaceSnapshot,
} from "@glymize/contracts";
import { openPatientRecordArchiveItem } from "./patient-record-archive-client";
import {
  buildPatientVisitChangeSummary,
  type PatientVisitChangeSummary,
} from "./patient-visit-change-summary";
import { getPatientWorkspace } from "./patient-record-v2-client";

function handoffStatus(
  status: PatientWorkspaceSnapshot["encounters"][number]["status"],
): PatientHandoffStatus {
  if (status === "draft") return "draft";
  if (status === "ready_for_physician") return "ready_for_physician";
  return "reviewed";
}

function v2PatientIdFromRecord(record: PatientHandoffRecord) {
  const match = record.id.match(
    /^v2:([0-9a-f-]{36}):([0-9a-f-]{36})$/i,
  );
  return match?.[1] ?? null;
}

export async function loadPatientTrendWorkspaceForArchiveItem(
  item: PatientRecordArchiveItem,
): Promise<PatientWorkspaceSnapshot | null> {
  if (item.source !== "patient_record_v2" || !item.patientId) {
    return null;
  }
  return getPatientWorkspace(item.patientId);
}

export async function loadPatientTrendWorkspaceForRecord(
  record: PatientHandoffRecord,
): Promise<PatientWorkspaceSnapshot | null> {
  const patientId = v2PatientIdFromRecord(record);
  return patientId ? getPatientWorkspace(patientId) : null;
}

/**
 * Reuses the existing v2 archive bridge to open an exact source encounter.
 * No trend projection becomes a new clinical-record authority.
 */
export async function openPatientTrendSourceEncounter(input: {
  workspace: PatientWorkspaceSnapshot;
  encounterId: string;
  patientCodeKind: PatientHandoffRecord["patientCodeKind"];
  patientCodeDisplay: string;
}) {
  const encounter = input.workspace.encounters.find(
    (candidate) => candidate.encounterId === input.encounterId,
  );
  if (!encounter) {
    throw new Error("HANDOFF_NOT_FOUND");
  }

  const archiveItem: PatientRecordArchiveItem = {
    id: `v2:${input.workspace.patient.patientId}:${encounter.encounterId}`,
    source: "patient_record_v2",
    patientId: input.workspace.patient.patientId,
    encounterId: encounter.encounterId,
    patientCodeKind: input.patientCodeKind,
    patientCodeDisplay: input.patientCodeDisplay,
    status: handoffStatus(encounter.status),
    revision: encounter.latestSnapshotRevision ?? 0,
    createdAt: encounter.encounterAt,
    updatedAt: encounter.encounterAt,
  };

  return openPatientRecordArchiveItem(archiveItem);
}

export async function loadLatestPatientVisitChangeSummary(input: {
  workspace: PatientWorkspaceSnapshot;
  patientCodeKind: PatientHandoffRecord["patientCodeKind"];
  patientCodeDisplay: string;
}): Promise<PatientVisitChangeSummary | null> {
  const encounters = [...input.workspace.encounters]
    .sort((left, right) =>
      right.encounterAt.localeCompare(left.encounterAt),
    )
    .slice(0, 2);
  const currentEncounter = encounters[0];
  const previousEncounter = encounters[1];
  if (!currentEncounter || !previousEncounter) return null;

  const [current, previous] = await Promise.all([
    openPatientTrendSourceEncounter({
      workspace: input.workspace,
      encounterId: currentEncounter.encounterId,
      patientCodeKind: input.patientCodeKind,
      patientCodeDisplay: input.patientCodeDisplay,
    }),
    openPatientTrendSourceEncounter({
      workspace: input.workspace,
      encounterId: previousEncounter.encounterId,
      patientCodeKind: input.patientCodeKind,
      patientCodeDisplay: input.patientCodeDisplay,
    }),
  ]);

  return {
    ...buildPatientVisitChangeSummary(current, previous),
    currentAt: currentEncounter.encounterAt,
    previousAt: previousEncounter.encounterAt,
  };
}
