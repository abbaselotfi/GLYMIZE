import type {
  PatientEncounterClinicalSnapshot,
  PatientEncounterSnapshotKind,
} from "@glymize/contracts";
import { decryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { patientSnapshotAad } from "./aad";

type SnapshotRow = {
  encounter_id: string;
  encounter_at: string;
  encounter_status: string;
  snapshot_id: string;
  revision: number;
  snapshot_kind: PatientEncounterSnapshotKind;
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_at: string;
};

export interface PatientCoreEncounterSnapshotSource {
  encounterId: string;
  encounterAt: string;
  encounterStatus: string;
  snapshotId: string;
  revision: number;
  snapshotKind: PatientEncounterSnapshotKind;
  createdAt: string;
  snapshot: PatientEncounterClinicalSnapshot;
}

export async function readRecentPatientCoreSnapshots(
  context: PatientRecordV2RouteContext,
  patientId: string,
  requestedLimit = 2,
): Promise<PatientCoreEncounterSnapshotSource[]> {
  const limit = Math.max(1, Math.min(10, Math.trunc(requestedLimit)));
  const rows = await context.database.prepare(
    `SELECT e.id AS encounter_id,e.encounter_at,e.status AS encounter_status,
            s.id AS snapshot_id,s.revision,s.snapshot_kind,
            s.payload_ciphertext,s.payload_iv,s.payload_auth_tag,s.created_at
     FROM patient_encounters e
     JOIN patient_encounter_snapshots s
       ON s.practice_id=e.practice_id
      AND s.patient_id=e.patient_id
      AND s.encounter_id=e.id
      AND s.revision=(
        SELECT MAX(s2.revision)
        FROM patient_encounter_snapshots s2
        WHERE s2.practice_id=e.practice_id
          AND s2.patient_id=e.patient_id
          AND s2.encounter_id=e.id
      )
     WHERE e.practice_id=? AND e.patient_id=?
     ORDER BY e.encounter_at DESC,e.created_at DESC,e.id DESC
     LIMIT ?`,
  ).bind(context.user.practiceId, patientId, limit).all<SnapshotRow>();

  const snapshots: PatientCoreEncounterSnapshotSource[] = [];
  for (const row of rows.results) {
    const snapshot = await decryptClinicalPayload<PatientEncounterClinicalSnapshot>(
      {
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
      },
      context.clinicalSecret,
      patientSnapshotAad(
        context.user.practiceId,
        row.encounter_id,
        row.revision,
      ),
    );
    if (!snapshot) throw new Error("PATIENT_SNAPSHOT_DECRYPTION_FAILED");

    snapshots.push({
      encounterId: row.encounter_id,
      encounterAt: row.encounter_at,
      encounterStatus: row.encounter_status,
      snapshotId: row.snapshot_id,
      revision: row.revision,
      snapshotKind: row.snapshot_kind,
      createdAt: row.created_at,
      snapshot,
    });
  }
  return snapshots;
}
