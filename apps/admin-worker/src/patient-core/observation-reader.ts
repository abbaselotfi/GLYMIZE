import type {
  PatientCoreCollection,
  PatientCoreVerification,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import { decryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { patientObservationAad } from "./aad";

type ObservationRow = {
  id: string;
  encounter_id: string;
  canonical_key: string;
  observed_at: string;
  verification: "unverified" | "confirmed" | "rejected";
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_at: string;
};

function verification(value: ObservationRow["verification"]): PatientCoreVerification {
  if (value === "confirmed") return "verified";
  if (value === "rejected") return "rejected";
  return "unverified";
}

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function observationValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export async function readPatientCoreObservations(
  context: PatientRecordV2RouteContext,
  patientId: string,
): Promise<PatientCoreCollection<PatientObservationView>> {
  const rows = await context.database.prepare(
    `SELECT o.id,o.encounter_id,o.canonical_key,o.observed_at,o.verification,
            o.payload_ciphertext,o.payload_iv,o.payload_auth_tag,o.created_at
     FROM patient_observations o
     WHERE o.practice_id=? AND o.patient_id=?
       AND o.verification<>'rejected'
       AND o.canonical_key NOT LIKE 'raw:%'
       AND o.snapshot_revision=(
         SELECT MAX(s.revision)
         FROM patient_encounter_snapshots s
         WHERE s.practice_id=o.practice_id
           AND s.patient_id=o.patient_id
           AND s.encounter_id=o.encounter_id
       )
     ORDER BY o.observed_at DESC,o.created_at DESC,o.id DESC`,
  ).bind(context.user.practiceId, patientId).all<ObservationRow>();

  const items: PatientObservationView[] = [];
  for (const row of rows.results) {
    const payload = await decryptClinicalPayload<Record<string, unknown>>(
      {
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
      },
      context.clinicalSecret,
      patientObservationAad(context.user.practiceId, row.id),
    );
    if (!payload) throw new Error("PATIENT_OBSERVATION_DECRYPTION_FAILED");

    const value = observationValue(payload.value ?? payload.valueText);
    if (value === undefined) continue;
    const canonicalKey = row.canonical_key.trim();
    if (!canonicalKey) continue;
    const unit = optionalText(payload.unit);
    const specimen = optionalText(payload.specimen);
    const abnormalFlag = optionalText(payload.interpretation ?? payload.abnormalFlag);
    const displayName = optionalText(payload.canonicalName) ??
      optionalText(payload.rawName) ?? canonicalKey;

    items.push({
      factId: row.id,
      factKey: `observation:${canonicalKey}:${unit ?? ""}:${specimen ?? ""}`,
      displayName,
      value,
      ...(unit ? { unit } : {}),
      ...(specimen ? { specimen } : {}),
      ...(abnormalFlag ? { abnormalFlag } : {}),
      observedAt: row.observed_at,
      meta: {
        scope: { practiceId: context.user.practiceId, patientId },
        source: {
          sourceType: "patient_record_v2",
          recordType: "patient_observation",
          recordId: row.id,
          encounterId: row.encounter_id,
        },
        effectiveAt: row.observed_at,
        recordedAt: row.created_at,
        freshness: "unknown",
        verification: verification(row.verification),
      },
    });
  }

  return {
    completeness: "complete",
    items,
    ...(rows.results[0]?.observed_at ? { asOf: rows.results[0].observed_at } : {}),
  };
}
