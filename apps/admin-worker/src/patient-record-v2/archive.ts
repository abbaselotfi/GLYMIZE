import type { PatientIdentifierKind } from "../patient-record-v2-policy";
import type { PatientRecordV2RouteContext } from "./context";

type PatientArchiveRow = {
  record_key: string;
  source: "patient_record_v2" | "legacy_handoff";
  patient_id: string | null;
  encounter_id: string | null;
  legacy_handoff_id: string | null;
  patient_code_kind: PatientIdentifierKind;
  patient_code_display: string;
  status: "draft" | "ready_for_physician" | "reviewed";
  revision: number;
  created_at: string;
  updated_at: string;
};

function validPatientArchiveRecordKey(value: string) {
  return /^(?:v2:[0-9a-f-]{36}:[0-9a-f-]{36}|legacy:[A-Za-z0-9-]{8,80})$/i.test(value);
}

export function parsePatientArchiveCursor(raw: string) {
  const separator = raw.indexOf("|");
  if (separator <= 0 || separator >= raw.length - 1) {
    return null;
  }

  const updatedAt = raw.slice(0, separator);
  const recordKey = raw.slice(separator + 1);

  if (Number.isNaN(Date.parse(updatedAt)) || !validPatientArchiveRecordKey(recordKey)) {
    return null;
  }

  return {
    updatedAt,
    recordKey,
  };
}

export async function listPatientArchive(request: Request, context: PatientRecordV2RouteContext) {
  if (!context.user.permissions.includes("handoff.read")) {
    return context.respond({ error: "permission_denied" }, 403);
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const pageSize = Number.isFinite(requestedLimit)
    ? Math.max(10, Math.min(100, Math.trunc(requestedLimit)))
    : 50;

  const rawCursor = url.searchParams.get("cursor")?.trim() ?? "";
  const cursor = rawCursor ? parsePatientArchiveCursor(rawCursor) : null;

  if (rawCursor && !cursor) {
    return context.respond({ error: "invalid_archive_cursor" }, 422);
  }

  const result = cursor
    ? await context.database
        .prepare(
          `WITH archive AS (
           SELECT
             ('v2:' || e.patient_id || ':' || e.id) AS record_key,
             'patient_record_v2' AS source,
             e.patient_id AS patient_id,
             e.id AS encounter_id,
             NULL AS legacy_handoff_id,
             COALESCE(
               (
                 SELECT i.identifier_kind
                 FROM patient_identifiers i
                 WHERE i.practice_id=e.practice_id
                   AND i.patient_id=e.patient_id
                 ORDER BY i.is_primary DESC,i.created_at ASC
                 LIMIT 1
               ),
               'other'
             ) AS patient_code_kind,
             COALESCE(
               (
                 SELECT i.display_mask
                 FROM patient_identifiers i
                 WHERE i.practice_id=e.practice_id
                   AND i.patient_id=e.patient_id
                 ORDER BY i.is_primary DESC,i.created_at ASC
                 LIMIT 1
               ),
               '••••'
             ) AS patient_code_display,
             CASE
               WHEN e.status='draft' THEN 'draft'
               WHEN e.status='ready_for_physician'
                 THEN 'ready_for_physician'
               ELSE 'reviewed'
             END AS status,
             COALESCE(
               (
                 SELECT MAX(s.revision)
                 FROM patient_encounter_snapshots s
                 WHERE s.practice_id=e.practice_id
                   AND s.encounter_id=e.id
               ),
               0
             ) AS revision,
             e.created_at AS created_at,
             e.updated_at AS updated_at
           FROM patient_encounters e
           WHERE e.practice_id=?

           UNION ALL

           SELECT
             ('legacy:' || h.id) AS record_key,
             'legacy_handoff' AS source,
             NULL AS patient_id,
             NULL AS encounter_id,
             h.id AS legacy_handoff_id,
             h.patient_code_kind AS patient_code_kind,
             h.patient_code_display AS patient_code_display,
             h.status AS status,
             h.revision AS revision,
             h.created_at AS created_at,
             h.updated_at AS updated_at
           FROM patient_handoffs h
           WHERE h.practice_id=?
             AND NOT EXISTS (
               SELECT 1
               FROM patient_handoff_legacy_links l
               WHERE l.legacy_handoff_id=h.id
             )
         )
         SELECT record_key,source,patient_id,encounter_id,
                legacy_handoff_id,patient_code_kind,
                patient_code_display,status,revision,
                created_at,updated_at
         FROM archive
         WHERE updated_at < ?
            OR (
              updated_at = ?
              AND record_key < ?
            )
         ORDER BY updated_at DESC,record_key DESC
         LIMIT ?`,
        )
        .bind(
          context.user.practiceId,
          context.user.practiceId,
          cursor.updatedAt,
          cursor.updatedAt,
          cursor.recordKey,
          pageSize + 1,
        )
        .all<PatientArchiveRow>()
    : await context.database
        .prepare(
          `WITH archive AS (
           SELECT
             ('v2:' || e.patient_id || ':' || e.id) AS record_key,
             'patient_record_v2' AS source,
             e.patient_id AS patient_id,
             e.id AS encounter_id,
             NULL AS legacy_handoff_id,
             COALESCE(
               (
                 SELECT i.identifier_kind
                 FROM patient_identifiers i
                 WHERE i.practice_id=e.practice_id
                   AND i.patient_id=e.patient_id
                 ORDER BY i.is_primary DESC,i.created_at ASC
                 LIMIT 1
               ),
               'other'
             ) AS patient_code_kind,
             COALESCE(
               (
                 SELECT i.display_mask
                 FROM patient_identifiers i
                 WHERE i.practice_id=e.practice_id
                   AND i.patient_id=e.patient_id
                 ORDER BY i.is_primary DESC,i.created_at ASC
                 LIMIT 1
               ),
               '••••'
             ) AS patient_code_display,
             CASE
               WHEN e.status='draft' THEN 'draft'
               WHEN e.status='ready_for_physician'
                 THEN 'ready_for_physician'
               ELSE 'reviewed'
             END AS status,
             COALESCE(
               (
                 SELECT MAX(s.revision)
                 FROM patient_encounter_snapshots s
                 WHERE s.practice_id=e.practice_id
                   AND s.encounter_id=e.id
               ),
               0
             ) AS revision,
             e.created_at AS created_at,
             e.updated_at AS updated_at
           FROM patient_encounters e
           WHERE e.practice_id=?

           UNION ALL

           SELECT
             ('legacy:' || h.id) AS record_key,
             'legacy_handoff' AS source,
             NULL AS patient_id,
             NULL AS encounter_id,
             h.id AS legacy_handoff_id,
             h.patient_code_kind AS patient_code_kind,
             h.patient_code_display AS patient_code_display,
             h.status AS status,
             h.revision AS revision,
             h.created_at AS created_at,
             h.updated_at AS updated_at
           FROM patient_handoffs h
           WHERE h.practice_id=?
             AND NOT EXISTS (
               SELECT 1
               FROM patient_handoff_legacy_links l
               WHERE l.legacy_handoff_id=h.id
             )
         )
         SELECT record_key,source,patient_id,encounter_id,
                legacy_handoff_id,patient_code_kind,
                patient_code_display,status,revision,
                created_at,updated_at
         FROM archive
         ORDER BY updated_at DESC,record_key DESC
         LIMIT ?`,
        )
        .bind(context.user.practiceId, context.user.practiceId, pageSize + 1)
        .all<PatientArchiveRow>();

  const hasMore = result.results.length > pageSize;
  const visible = result.results.slice(0, pageSize);

  const items = visible.map((row) => ({
    id: row.record_key,
    source: row.source,
    ...(row.patient_id ? { patientId: row.patient_id } : {}),
    ...(row.encounter_id ? { encounterId: row.encounter_id } : {}),
    ...(row.legacy_handoff_id ? { legacyHandoffId: row.legacy_handoff_id } : {}),
    patientCodeKind: row.patient_code_kind,
    patientCodeDisplay: row.patient_code_display,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const last = visible[visible.length - 1];
  const nextCursor = hasMore && last ? `${last.updated_at}|${last.record_key}` : null;

  return context.respond({
    items,
    nextCursor,
  });
}
