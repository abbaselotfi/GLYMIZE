import type {
  PatientCoreCollection,
  PatientCoreCollectionDiagnostics,
  PatientCoreProjectionExclusionCount,
  PatientCoreVerification,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import { decryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { patientObservationAad } from "./aad";
import { completenessFromPatientCoreDiagnostics } from "./projection-coverage";

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

const OBSERVATION_SOURCE_SCOPE = "latest_snapshot_revision_per_encounter";

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

function incrementExclusion(
  counts: Map<PatientCoreProjectionExclusionCount["reason"], number>,
  reason: PatientCoreProjectionExclusionCount["reason"],
) {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
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
  const exclusions = new Map<PatientCoreProjectionExclusionCount["reason"], number>();
  let eligibleCount = 0;
  let invalidSkippedCount = 0;

  for (const row of rows.results) {
    // Rejected observations and the raw namespace are intentionally outside the
    // canonical longitudinal observation universe. They remain auditable in the
    // source store but do not make this projection partial.
    if (row.verification === "rejected") {
      incrementExclusion(exclusions, "rejected");
      continue;
    }
    if (row.canonical_key.startsWith("raw:")) {
      incrementExclusion(exclusions, "raw_namespace");
      continue;
    }

    eligibleCount += 1;
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
    const canonicalKey = row.canonical_key.trim();
    if (value === undefined || !canonicalKey) {
      invalidSkippedCount += 1;
      continue;
    }
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

  const intentionallyExcludedCount = [...exclusions.values()].reduce(
    (total, count) => total + count,
    0,
  );
  const diagnostics: PatientCoreCollectionDiagnostics = {
    sourceScope: OBSERVATION_SOURCE_SCOPE,
    sourceRowCount: rows.results.length,
    eligibleCount,
    includedCount: items.length,
    intentionallyExcludedCount,
    invalidSkippedCount,
    truncatedCount: 0,
    ...(exclusions.size
      ? {
          exclusions: [...exclusions.entries()]
            .map(([reason, count]) => ({ reason, count }))
            .sort((left, right) => left.reason.localeCompare(right.reason)),
        }
      : {}),
  };
  const completeness = completenessFromPatientCoreDiagnostics(diagnostics);

  return {
    completeness,
    ...(completeness === "partial" ? { gapReason: "other" as const } : {}),
    items,
    ...(items[0]?.observedAt ? { asOf: items[0].observedAt } : {}),
    diagnostics,
  };
}
