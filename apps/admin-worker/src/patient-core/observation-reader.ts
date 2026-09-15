import type {
  PatientCoreCollection,
  PatientCoreCollectionDiagnostics,
  PatientCoreProjectionExclusionCount,
  PatientCoreVerification,
  PatientObservationView,
} from "@glymize/contracts/patient-core";
import { decryptPatientCorePayload } from "./decryption";
import {
  measureRuntimeReadDecryption,
  measureRuntimeReadQuery,
  type RuntimeReadMetricsCollector,
} from "../runtime-read-metrics";
import type { PatientRecordV2ReadContext } from "../patient-record-v2/context";
import { patientObservationAad } from "./aad";
import {
  decodePatientObservationCursor,
  encodePatientObservationCursor,
  normalizePatientCorePageSize,
  normalizePatientCoreSourceVersion,
  PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE,
  PATIENT_CORE_OBSERVATION_BYTE_BUDGET,
  type PatientCoreObservationCursorPosition,
} from "./pagination";
import { completenessFromPatientCoreDiagnostics } from "./projection-coverage";

type ObservationRow = {
  id: string;
  encounter_id: string;
  canonical_key: string;
  observed_at: string;
  verification: "unverified" | "confirmed" | "rejected";
  snapshot_revision: number;
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_at: string;
};

type ObservationCountRow = {
  source_row_count: number | null;
  rejected_count: number | null;
  raw_count: number | null;
  eligible_count: number | null;
};

export interface PatientCoreObservationReadOptions {
  cursor?: string;
  limit?: number;
  sourceVersion?: string;
  byteBudget?: number;
  metrics?: RuntimeReadMetricsCollector;
}

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

function cursorSql(position: PatientCoreObservationCursorPosition | undefined) {
  if (!position) return { sql: "", binds: [] as string[] };
  return {
    sql: `
       AND (
         o.observed_at < ?
         OR (o.observed_at = ? AND o.created_at < ?)
         OR (o.observed_at = ? AND o.created_at = ? AND o.id < ?)
       )`,
    binds: [
      position.observedAt,
      position.observedAt,
      position.createdAt,
      position.observedAt,
      position.createdAt,
      position.id,
    ],
  };
}

function numeric(value: number | null | undefined) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? Math.max(0, Math.trunc(result)) : 0;
}

function boundedByteBudget(requested: number | undefined) {
  if (requested === undefined || !Number.isFinite(requested)) {
    return PATIENT_CORE_OBSERVATION_BYTE_BUDGET;
  }
  return Math.max(16 * 1024, Math.min(1024 * 1024, Math.trunc(requested)));
}

export async function readPatientCoreObservations(
  context: PatientRecordV2ReadContext,
  patientId: string,
  options: PatientCoreObservationReadOptions = {},
): Promise<PatientCoreCollection<PatientObservationView>> {
  const scope = { practiceId: context.user.practiceId, patientId };
  const decodedCursor = options.cursor
    ? await decodePatientObservationCursor(options.cursor, scope, context.clinicalSecret)
    : undefined;
  if (
    decodedCursor &&
    options.sourceVersion &&
    decodedCursor.sourceVersion !== options.sourceVersion
  ) {
    throw new Error("PATIENT_HISTORY_SOURCE_VERSION_MISMATCH");
  }
  const sourceVersion = decodedCursor?.sourceVersion ??
    normalizePatientCoreSourceVersion(options.sourceVersion);
  const position = decodedCursor?.position;
  const limit = normalizePatientCorePageSize(
    options.limit,
    PATIENT_CORE_DEFAULT_OBSERVATION_PAGE_SIZE,
  );
  const byteBudget = boundedByteBudget(options.byteBudget);
  const cursor = cursorSql(position);
  const baseBinds = [
    context.user.practiceId,
    patientId,
    sourceVersion,
    sourceVersion,
    ...cursor.binds,
  ];

  const counts = await measureRuntimeReadQuery(
    options.metrics,
    () => context.database.prepare(
      `SELECT
         COUNT(*) AS source_row_count,
         SUM(CASE WHEN o.verification='rejected' THEN 1 ELSE 0 END) AS rejected_count,
         SUM(CASE WHEN o.verification<>'rejected' AND substr(o.canonical_key,1,4)='raw:' THEN 1 ELSE 0 END) AS raw_count,
         SUM(CASE WHEN o.verification<>'rejected' AND substr(o.canonical_key,1,4)<>'raw:' THEN 1 ELSE 0 END) AS eligible_count
       FROM patient_observations o
       WHERE o.practice_id=? AND o.patient_id=?
         AND o.created_at<=?
         AND o.snapshot_revision=(
           SELECT MAX(s.revision)
           FROM patient_encounter_snapshots s
           WHERE s.practice_id=o.practice_id
             AND s.patient_id=o.patient_id
             AND s.encounter_id=o.encounter_id
             AND s.created_at<=?
         )${cursor.sql}`,
    ).bind(...baseBinds).first<ObservationCountRow>(),
    (result) => result ? 1 : 0,
  );

  const rows = await measureRuntimeReadQuery(
    options.metrics,
    () => context.database.prepare(
      `SELECT o.id,o.encounter_id,o.canonical_key,o.observed_at,o.verification,o.snapshot_revision,
              o.payload_ciphertext,o.payload_iv,o.payload_auth_tag,o.created_at
       FROM patient_observations o
       WHERE o.practice_id=? AND o.patient_id=?
         AND o.created_at<=?
         AND o.snapshot_revision=(
           SELECT MAX(s.revision)
           FROM patient_encounter_snapshots s
           WHERE s.practice_id=o.practice_id
             AND s.patient_id=o.patient_id
             AND s.encounter_id=o.encounter_id
             AND s.created_at<=?
         )
         AND o.verification<>'rejected'
         AND substr(o.canonical_key,1,4)<>'raw:'${cursor.sql}
       ORDER BY o.observed_at DESC,o.created_at DESC,o.id DESC
       LIMIT ?`,
    ).bind(...baseBinds, limit).all<ObservationRow>(),
    (result) => result.results.length,
  );

  const items: PatientObservationView[] = [];
  let invalidSkippedCount = 0;
  let scannedEligibleCount = 0;
  let responseBytes = 0;
  let lastScannedRow: ObservationRow | undefined;

  for (const row of rows.results) {
    const payload = await measureRuntimeReadDecryption(
      options.metrics,
      () => decryptPatientCorePayload<Record<string, unknown>>(
        context,
        {
          ciphertext: row.payload_ciphertext,
          iv: row.payload_iv,
          authTag: row.payload_auth_tag,
        },
        patientObservationAad(context.user.practiceId, row.id),
      ),
    );
    if (!payload) throw new Error("PATIENT_OBSERVATION_DECRYPTION_FAILED");

    const value = observationValue(payload.value ?? payload.valueText);
    const canonicalKey = row.canonical_key.trim();
    if (value === undefined || !canonicalKey) {
      invalidSkippedCount += 1;
      scannedEligibleCount += 1;
      lastScannedRow = row;
      continue;
    }
    const unit = optionalText(payload.unit);
    const specimen = optionalText(payload.specimen);
    const abnormalFlag = optionalText(payload.interpretation ?? payload.abnormalFlag);
    const displayName = optionalText(payload.canonicalName) ??
      optionalText(payload.rawName) ?? canonicalKey;

    const item: PatientObservationView = {
      factId: row.id,
      factKey: `observation:${canonicalKey}:${unit ?? ""}:${specimen ?? ""}`,
      displayName,
      value,
      ...(unit ? { unit } : {}),
      ...(specimen ? { specimen } : {}),
      ...(abnormalFlag ? { abnormalFlag } : {}),
      observedAt: row.observed_at,
      meta: {
        scope,
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
        revision: row.snapshot_revision,
      },
    };
    const itemBytes = new TextEncoder().encode(JSON.stringify(item)).byteLength;
    if (items.length > 0 && responseBytes + itemBytes > byteBudget) break;

    items.push(item);
    responseBytes += itemBytes;
    scannedEligibleCount += 1;
    lastScannedRow = row;
  }

  const sourceRowCount = numeric(counts?.source_row_count);
  const rejectedCount = numeric(counts?.rejected_count);
  const rawCount = numeric(counts?.raw_count);
  const eligibleCount = numeric(counts?.eligible_count);
  const intentionallyExcludedCount = rejectedCount + rawCount;
  const truncatedCount = Math.max(0, eligibleCount - scannedEligibleCount);
  const exclusions: PatientCoreProjectionExclusionCount[] = [
    ...(rawCount ? [{ reason: "raw_namespace" as const, count: rawCount }] : []),
    ...(rejectedCount ? [{ reason: "rejected" as const, count: rejectedCount }] : []),
  ].sort((left, right) => left.reason.localeCompare(right.reason));
  const diagnostics: PatientCoreCollectionDiagnostics = {
    sourceScope: OBSERVATION_SOURCE_SCOPE,
    sourceRowCount,
    eligibleCount,
    includedCount: items.length,
    intentionallyExcludedCount,
    invalidSkippedCount,
    truncatedCount,
    ...(exclusions.length ? { exclusions } : {}),
  };
  const completeness = completenessFromPatientCoreDiagnostics(diagnostics);
  const hasMore = truncatedCount > 0;
  const nextCursor = hasMore && lastScannedRow
    ? await encodePatientObservationCursor(
        scope,
        sourceVersion,
        {
          observedAt: lastScannedRow.observed_at,
          createdAt: lastScannedRow.created_at,
          id: lastScannedRow.id,
        },
        context.clinicalSecret,
      )
    : undefined;

  if (hasMore && !nextCursor) {
    throw new Error("PATIENT_HISTORY_CURSOR_PROGRESS_FAILED");
  }

  return {
    completeness,
    ...(completeness === "partial" ? { gapReason: "other" as const } : {}),
    items,
    ...(items[0]?.observedAt ? { asOf: items[0].observedAt } : {}),
    diagnostics,
    continuation: {
      sourceVersion,
      pageSize: limit,
      hasMore,
      remainingCount: truncatedCount,
      ...(nextCursor ? { nextCursor } : {}),
    },
  };
}
