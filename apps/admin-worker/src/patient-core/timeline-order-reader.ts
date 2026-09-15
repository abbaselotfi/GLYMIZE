import type {
  CareTeamOrderFulfillmentStatus,
  PatientWorkspaceOrderState,
} from "@glymize/contracts";
import type { PatientCoreEventView } from "@glymize/contracts/patient-core";
import { patientFinalOrderAad } from "../patient-record-v2/orders";
import type { PatientRecordV2ReadContext } from "../patient-record-v2/context";
import { decryptPatientCorePayload } from "./decryption";
import {
  measureRuntimeReadDecryption,
  measureRuntimeReadQuery,
  type RuntimeReadMetricsCollector,
} from "../runtime-read-metrics";
import type { PatientCoreTimelineCursorPosition } from "./pagination";

type TimelineOrderRow = {
  order_id: string;
  encounter_id: string;
  order_kind: "medication" | "investigation";
  order_status: "active" | "cancelled";
  plan_status: "signed" | "superseded" | "void";
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  signed_at: string;
  latest_fulfillment_status: CareTeamOrderFulfillmentStatus | null;
  linked_result_count: number;
};

export interface PatientCoreTimelineOrderReadOptions {
  limit: number;
  sourceVersion: string;
  cursor?: PatientCoreTimelineCursorPosition;
  metrics?: RuntimeReadMetricsCollector;
}

function orderState(row: TimelineOrderRow): PatientWorkspaceOrderState | "superseded" | "void" {
  if (row.plan_status === "superseded") return "superseded";
  if (row.plan_status === "void") return "void";
  if (
    row.order_status === "cancelled" ||
    row.latest_fulfillment_status === "cancelled"
  ) return "cancelled";
  if (row.latest_fulfillment_status === "unable_to_process") return "unable_to_process";
  if (row.latest_fulfillment_status === "completed") return "completed";
  if (
    row.latest_fulfillment_status === "result_received" ||
    row.linked_result_count > 0
  ) return "result_received";
  if (
    row.latest_fulfillment_status === "submitted_to_payer" ||
    row.latest_fulfillment_status === "registered" ||
    row.latest_fulfillment_status === "scheduled" ||
    row.latest_fulfillment_status === "collected"
  ) return "in_progress";
  return "pending";
}

function boundedText(value: unknown, max = 220) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= max ? text : undefined;
}

function cursorSql(position: PatientCoreTimelineCursorPosition | undefined) {
  if (!position) return { sql: "", binds: [] as string[] };
  return {
    sql: `
       AND (
         p.signed_at < ?
         OR (p.signed_at = ? AND ('order:' || o.id) > ?)
       )`,
    binds: [position.effectiveAt, position.effectiveAt, position.eventId],
  };
}

/**
 * Bounded timeline-only order projection.
 *
 * Once a plan has a signed_at timestamp, its historical timeline membership is
 * stable even if the plan is later superseded or voided. Append-only
 * fulfillment/result state is frozen at sourceVersion. This reader does not
 * replace the current Workspace order authority.
 */
export async function readPatientCoreTimelineOrders(
  context: PatientRecordV2ReadContext,
  patientId: string,
  options: PatientCoreTimelineOrderReadOptions,
): Promise<PatientCoreEventView[]> {
  const cursor = cursorSql(options.cursor);
  const rows = await measureRuntimeReadQuery(
    options.metrics,
    () => context.database.prepare(
      `SELECT
         o.id AS order_id,
         o.encounter_id,
         o.order_kind,
         o.order_status,
         p.plan_status,
         o.payload_ciphertext,
         o.payload_iv,
         o.payload_auth_tag,
         p.signed_at,
         (
           SELECT f.fulfillment_status
           FROM patient_order_fulfillment_events f
           WHERE f.practice_id=o.practice_id
             AND f.order_id=o.id
             AND f.created_at<=?
           ORDER BY f.created_at DESC,f.id DESC
           LIMIT 1
         ) AS latest_fulfillment_status,
         (
           SELECT COUNT(*)
           FROM patient_investigation_result_links l
           WHERE l.order_id=o.id AND l.linked_at<=?
         ) AS linked_result_count
       FROM patient_final_orders o
       JOIN patient_final_plans p ON p.id=o.plan_id
       WHERE o.practice_id=? AND o.patient_id=?
         AND p.practice_id=o.practice_id
         AND p.patient_id=o.patient_id
         AND p.plan_status IN ('signed','superseded','void')
         AND p.signed_at IS NOT NULL
         AND p.signed_at<=?
         AND p.created_at<=?
         AND o.created_at<=?${cursor.sql}
       ORDER BY p.signed_at DESC,('order:' || o.id) ASC
       LIMIT ?`,
    ).bind(
      options.sourceVersion,
      options.sourceVersion,
      context.user.practiceId,
      patientId,
      options.sourceVersion,
      options.sourceVersion,
      options.sourceVersion,
      ...cursor.binds,
      options.limit,
    ).all<TimelineOrderRow>(),
    (result) => result.results.length,
  );

  const events: PatientCoreEventView[] = [];
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
        patientFinalOrderAad(context.user.practiceId, row.order_id),
      ),
    );
    if (!payload) throw new Error("PATIENT_FINAL_ORDER_DECRYPTION_FAILED");

    const label = row.order_kind === "medication"
      ? boundedText(payload.genericName, 180)
      : boundedText(payload.displayName, 220);
    if (!label) throw new Error("PATIENT_FINAL_ORDER_PAYLOAD_INVALID");

    events.push({
      eventId: `order:${row.order_id}`,
      eventType: "order",
      effectiveAt: row.signed_at,
      status: orderState(row),
      label,
      source: {
        sourceType: "physician_order",
        recordType: "patient_final_order",
        recordId: row.order_id,
        encounterId: row.encounter_id,
      },
    });
  }
  return events;
}
