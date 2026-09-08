import type {
  PatientCoreCollection,
  PatientCoreEventView,
} from "@glymize/contracts/patient-core";
import { readPatientWorkspaceOrders } from "../patient-record-v2/orders";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";

type EncounterRow = {
  id: string;
  encounter_at: string;
  encounter_kind: string;
  status: string;
};

export async function readPatientCoreTimeline(
  context: PatientRecordV2RouteContext,
  patientId: string,
): Promise<PatientCoreCollection<PatientCoreEventView>> {
  const [encounters, orders] = await Promise.all([
    context.database.prepare(
      `SELECT id,encounter_at,encounter_kind,status
       FROM patient_encounters
       WHERE practice_id=? AND patient_id=?
       ORDER BY encounter_at DESC,created_at DESC,id DESC
       LIMIT 100`,
    ).bind(context.user.practiceId, patientId).all<EncounterRow>(),
    readPatientWorkspaceOrders(context, patientId),
  ]);

  const items: PatientCoreEventView[] = encounters.results.map((row) => ({
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

  for (const order of orders) {
    const label = "genericName" in order.order
      ? order.order.genericName
      : order.order.displayName;
    items.push({
      eventId: `order:${order.orderId}`,
      eventType: "order",
      effectiveAt: order.signedAt,
      status: order.state,
      label,
      source: {
        sourceType: "physician_order",
        recordType: "patient_final_order",
        recordId: order.orderId,
        encounterId: order.encounterId,
      },
    });
  }

  items.sort((left, right) =>
    right.effectiveAt.localeCompare(left.effectiveAt) ||
    left.eventId.localeCompare(right.eventId),
  );

  return {
    // B3 intentionally starts with encounters + signed orders. Referrals,
    // documents and notes remain separate services and make this timeline
    // explicitly partial instead of silently looking exhaustive.
    completeness: "partial",
    gapReason: "source_not_exposed",
    items,
    ...(items[0]?.effectiveAt ? { asOf: items[0].effectiveAt } : {}),
  };
}
