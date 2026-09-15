import type {
  PatientCoreCollection,
  PatientCoreEventView,
} from "@glymize/contracts/patient-core";
import type { PatientRecordV2ReadContext } from "../patient-record-v2/context";
import {
  measureRuntimeReadQuery,
  type RuntimeReadMetricsCollector,
} from "../runtime-read-metrics";
import {
  decodePatientTimelineCursor,
  encodePatientTimelineCursor,
  normalizePatientCorePageSize,
  normalizePatientCoreSourceVersion,
  PATIENT_CORE_DEFAULT_TIMELINE_PAGE_SIZE,
  type PatientCoreTimelineCursorPosition,
} from "./pagination";
import { readPatientCoreTimelineOrders } from "./timeline-order-reader";

type EncounterRow = {
  id: string;
  encounter_at: string;
  encounter_kind: string;
  status: string;
};

export interface PatientCoreTimelineReadOptions {
  cursor?: string;
  limit?: number;
  sourceVersion?: string;
  metrics?: RuntimeReadMetricsCollector;
}

function encounterCursorSql(position: PatientCoreTimelineCursorPosition | undefined) {
  if (!position) return { sql: "", binds: [] as string[] };
  return {
    sql: `
       AND (
         encounter_at < ?
         OR (encounter_at = ? AND ('encounter:' || id) > ?)
       )`,
    binds: [position.effectiveAt, position.effectiveAt, position.eventId],
  };
}

export async function readPatientCoreTimeline(
  context: PatientRecordV2ReadContext,
  patientId: string,
  options: PatientCoreTimelineReadOptions = {},
): Promise<PatientCoreCollection<PatientCoreEventView>> {
  const scope = { practiceId: context.user.practiceId, patientId };
  const decodedCursor = options.cursor
    ? await decodePatientTimelineCursor(options.cursor, scope, context.clinicalSecret)
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
    PATIENT_CORE_DEFAULT_TIMELINE_PAGE_SIZE,
  );
  const candidateLimit = limit + 1;
  const encounterCursor = encounterCursorSql(position);

  const [encounters, orderEvents] = await Promise.all([
    measureRuntimeReadQuery(
      options.metrics,
      () => context.database.prepare(
        `SELECT id,encounter_at,encounter_kind,status
         FROM patient_encounters
         WHERE practice_id=? AND patient_id=?
           AND created_at<=?${encounterCursor.sql}
         ORDER BY encounter_at DESC,('encounter:' || id) ASC
         LIMIT ?`,
      ).bind(
        context.user.practiceId,
        patientId,
        sourceVersion,
        ...encounterCursor.binds,
        candidateLimit,
      ).all<EncounterRow>(),
      (result) => result.results.length,
    ),
    readPatientCoreTimelineOrders(context, patientId, {
      limit: candidateLimit,
      sourceVersion,
      ...(position ? { cursor: position } : {}),
      metrics: options.metrics,
    }),
  ]);

  const candidates: PatientCoreEventView[] = encounters.results.map((row) => ({
    eventId: `encounter:${row.id}`,
    eventType: "encounter",
    effectiveAt: row.encounter_at,
    status: row.status,
    label: row.encounter_kind,
    source: {
      sourceType: "patient_record_v2",
      recordType: "patient_encounter",
      recordId: row.id,
      encounterId: row.id,
    },
  }));
  candidates.push(...orderEvents);

  candidates.sort((left, right) =>
    right.effectiveAt.localeCompare(left.effectiveAt) ||
    left.eventId.localeCompare(right.eventId),
  );
  const items = candidates.slice(0, limit);
  const hasMore = candidates.length > limit;
  const lastItem = items.at(-1);
  const nextCursor = hasMore && lastItem
    ? await encodePatientTimelineCursor(
        scope,
        sourceVersion,
        {
          effectiveAt: lastItem.effectiveAt,
          eventId: lastItem.eventId,
        },
        context.clinicalSecret,
      )
    : undefined;

  if (hasMore && !nextCursor) {
    throw new Error("PATIENT_HISTORY_CURSOR_PROGRESS_FAILED");
  }

  return {
    // Encounters + signed orders are a bounded but intentionally incomplete
    // subset of the full medical story. Referrals/documents/notes remain other
    // services, so pagination can never turn this collection globally complete.
    completeness: "partial",
    gapReason: "source_not_exposed",
    items,
    ...(items[0]?.effectiveAt ? { asOf: items[0].effectiveAt } : {}),
    continuation: {
      sourceVersion,
      pageSize: limit,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
    },
  };
}
