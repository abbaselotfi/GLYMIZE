import type {
  CareTeamOrderFulfillmentStatus,
  PatientWorkspaceOrderState,
  PatientWorkspaceOrderSummary,
  PhysicianInvestigationOrder,
  PhysicianMedicationOrder,
} from "@glymize/contracts";
import { decryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "./context";

type OrderRow = {
  order_id: string;
  plan_id: string;
  encounter_id: string;
  order_kind: "medication" | "investigation";
  order_status: "active" | "cancelled";
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  plan_version: number;
  signed_at: string;
  latest_fulfillment_status: CareTeamOrderFulfillmentStatus | null;
  latest_fulfillment_at: string | null;
  linked_result_count: number;
};

export function patientFinalOrderAad(
  practiceId: string,
  orderId: string,
) {
  return `patient-final-order:${practiceId}:${orderId}`;
}

function orderState(
  row: Pick<
    OrderRow,
    | "order_status"
    | "latest_fulfillment_status"
    | "linked_result_count"
  >,
): PatientWorkspaceOrderState {
  if (
    row.order_status === "cancelled" ||
    row.latest_fulfillment_status === "cancelled"
  ) {
    return "cancelled";
  }
  if (row.latest_fulfillment_status === "unable_to_process") {
    return "unable_to_process";
  }
  if (row.latest_fulfillment_status === "completed") {
    return "completed";
  }
  if (
    row.latest_fulfillment_status === "result_received" ||
    row.linked_result_count > 0
  ) {
    return "result_received";
  }
  if (
    row.latest_fulfillment_status === "submitted_to_payer" ||
    row.latest_fulfillment_status === "registered" ||
    row.latest_fulfillment_status === "scheduled" ||
    row.latest_fulfillment_status === "collected"
  ) {
    return "in_progress";
  }
  return "pending";
}

function text(value: unknown, max = 500) {
  const result = String(value ?? "").trim();
  return result && result.length <= max ? result : undefined;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function medicationOrder(
  row: OrderRow,
  payload: Record<string, unknown>,
): PhysicianMedicationOrder | null {
  const genericName = text(payload.genericName, 180);
  if (!genericName) return null;

  return {
    id: row.order_id,
    status: row.order_status,
    ...(text(payload.genericMedicationId, 160)
      ? { genericMedicationId: text(payload.genericMedicationId, 160)! }
      : {}),
    ...(text(payload.marketProductId, 160)
      ? { marketProductId: text(payload.marketProductId, 160)! }
      : {}),
    genericName,
    ...(text(payload.brandName, 180)
      ? { brandName: text(payload.brandName, 180)! }
      : {}),
    ...(text(payload.route, 80) ? { route: text(payload.route, 80)! } : {}),
    ...(text(payload.formulation, 120)
      ? { formulation: text(payload.formulation, 120)! }
      : {}),
    ...(text(payload.strengthPresentation, 120)
      ? { strengthPresentation: text(payload.strengthPresentation, 120)! }
      : {}),
    ...(finite(payload.doseAmount) !== undefined
      ? { doseAmount: finite(payload.doseAmount)! }
      : {}),
    ...(text(payload.doseUnit, 40)
      ? { doseUnit: text(payload.doseUnit, 40)! }
      : {}),
    ...(finite(payload.frequencyPerDay) !== undefined
      ? { frequencyPerDay: finite(payload.frequencyPerDay)! }
      : {}),
    ...(text(payload.frequencyCode, 80)
      ? { frequencyCode: text(payload.frequencyCode, 80)! }
      : {}),
    ...(finite(payload.durationDays) !== undefined
      ? { durationDays: finite(payload.durationDays)! }
      : {}),
    ...(finite(payload.quantity) !== undefined
      ? { quantity: finite(payload.quantity)! }
      : {}),
    ...(text(payload.quantityUnit, 40)
      ? { quantityUnit: text(payload.quantityUnit, 40)! }
      : {}),
    ...(text(payload.notes, 2_000)
      ? { notes: text(payload.notes, 2_000)! }
      : {}),
  };
}

function investigationOrder(
  row: OrderRow,
  payload: Record<string, unknown>,
): PhysicianInvestigationOrder | null {
  const displayName = text(payload.displayName, 220);
  const kind = text(payload.kind, 40);
  const timing = text(payload.timing, 40);
  const priority = text(payload.priority, 40);
  if (
    !displayName ||
    !kind ||
    !["laboratory", "imaging", "procedure", "other"].includes(kind) ||
    !timing ||
    !["now", "before_next_visit", "at_next_visit", "routine"].includes(timing) ||
    !priority ||
    !["routine", "priority", "urgent"].includes(priority)
  ) {
    return null;
  }

  return {
    id: row.order_id,
    status: row.order_status,
    kind: kind as PhysicianInvestigationOrder["kind"],
    displayName,
    timing: timing as PhysicianInvestigationOrder["timing"],
    priority: priority as PhysicianInvestigationOrder["priority"],
    ...(text(payload.canonicalLabKey, 160)
      ? { canonicalLabKey: text(payload.canonicalLabKey, 160)! }
      : {}),
    ...(text(payload.investigationCode, 160)
      ? { investigationCode: text(payload.investigationCode, 160)! }
      : {}),
    ...(text(payload.specimen, 120)
      ? { specimen: text(payload.specimen, 120)! }
      : {}),
    ...(typeof payload.fastingRequired === "boolean"
      ? { fastingRequired: payload.fastingRequired }
      : {}),
    ...(text(payload.instructions, 2_000)
      ? { instructions: text(payload.instructions, 2_000)! }
      : {}),
    ...(text(payload.reasonCode, 160)
      ? { reasonCode: text(payload.reasonCode, 160)! }
      : {}),
    ...(text(payload.sourceRuleId, 160)
      ? { sourceRuleId: text(payload.sourceRuleId, 160)! }
      : {}),
    ...(text(payload.sourceRulePackVersion, 160)
      ? { sourceRulePackVersion: text(payload.sourceRulePackVersion, 160)! }
      : {}),
    ...(text(payload.sourceDecisionRecordId, 160)
      ? { sourceDecisionRecordId: text(payload.sourceDecisionRecordId, 160)! }
      : {}),
  };
}

/**
 * Reads only currently signed physician plans. Superseded/void/draft plans do
 * not remain active Workspace orders. Fulfillment is append-only and the most
 * recent event is projected without mutating physician-authored order data.
 */
export async function readPatientWorkspaceOrders(
  context: PatientRecordV2RouteContext,
  patientId: string,
): Promise<PatientWorkspaceOrderSummary[]> {
  const rows = await context.database.prepare(
    `SELECT
       o.id AS order_id,
       o.plan_id,
       o.encounter_id,
       o.order_kind,
       o.order_status,
       o.payload_ciphertext,
       o.payload_iv,
       o.payload_auth_tag,
       p.plan_version,
       p.signed_at,
       (
         SELECT f.fulfillment_status
         FROM patient_order_fulfillment_events f
         WHERE f.practice_id=o.practice_id AND f.order_id=o.id
         ORDER BY f.created_at DESC,f.id DESC
         LIMIT 1
       ) AS latest_fulfillment_status,
       (
         SELECT f.created_at
         FROM patient_order_fulfillment_events f
         WHERE f.practice_id=o.practice_id AND f.order_id=o.id
         ORDER BY f.created_at DESC,f.id DESC
         LIMIT 1
       ) AS latest_fulfillment_at,
       (
         SELECT COUNT(*)
         FROM patient_investigation_result_links l
         WHERE l.order_id=o.id
       ) AS linked_result_count
     FROM patient_final_orders o
     JOIN patient_final_plans p ON p.id=o.plan_id
     WHERE o.practice_id=? AND o.patient_id=?
       AND p.practice_id=o.practice_id
       AND p.patient_id=o.patient_id
       AND p.plan_status='signed'
       AND p.signed_at IS NOT NULL
     ORDER BY p.signed_at DESC,p.plan_version DESC,o.sort_order ASC,o.created_at ASC`,
  ).bind(
    context.user.practiceId,
    patientId,
  ).all<OrderRow>();

  const result: PatientWorkspaceOrderSummary[] = [];
  for (const row of rows.results) {
    const payload = await decryptClinicalPayload<Record<string, unknown>>(
      {
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
      },
      context.clinicalSecret,
      patientFinalOrderAad(context.user.practiceId, row.order_id),
    );
    if (!payload) {
      throw new Error("PATIENT_FINAL_ORDER_DECRYPTION_FAILED");
    }

    const order = row.order_kind === "medication"
      ? medicationOrder(row, payload)
      : investigationOrder(row, payload);
    if (!order) {
      throw new Error("PATIENT_FINAL_ORDER_PAYLOAD_INVALID");
    }

    result.push({
      orderId: row.order_id,
      planId: row.plan_id,
      encounterId: row.encounter_id,
      planVersion: row.plan_version,
      signedAt: row.signed_at,
      orderKind: row.order_kind,
      order,
      state: orderState(row),
      ...(row.latest_fulfillment_status
        ? { latestFulfillmentStatus: row.latest_fulfillment_status }
        : {}),
      ...(row.latest_fulfillment_at
        ? { latestFulfillmentAt: row.latest_fulfillment_at }
        : {}),
      hasLinkedResult: row.linked_result_count > 0,
    });
  }

  return result;
}
