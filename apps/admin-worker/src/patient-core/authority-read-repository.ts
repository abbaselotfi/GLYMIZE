import type {
  PatientAllergyIntoleranceView,
  PatientCoreCollection,
  PatientCoreFactMeta,
  PatientProblemView,
} from "@glymize/contracts/patient-core";
import {
  measureRuntimeReadDecryption,
  type RuntimeReadMetricsCollector,
} from "../runtime-read-metrics";
import { decryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { patientCoreAuthorityFactAad } from "./aad";
import {
  latestAuthorityFactRows,
  latestAuthorityReconciliation,
  type AuthorityReconciliationRow,
  type AuthorityRevisionRow,
  type StoredAllergyPayload,
  type StoredProblemPayload,
} from "./authority-storage";

const MAX_CURRENT_AUTHORITY_FACTS = 200;

export interface PatientCoreAuthorityReadOptions {
  metrics?: RuntimeReadMetricsCollector;
}

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function factMeta(
  context: PatientRecordV2RouteContext,
  patientId: string,
  row: AuthorityRevisionRow,
  payload: StoredAllergyPayload | StoredProblemPayload,
): PatientCoreFactMeta {
  return {
    scope: { practiceId: context.user.practiceId, patientId },
    source: payload.source,
    ...(payload.effectiveAt ? { effectiveAt: payload.effectiveAt } : {}),
    recordedAt: row.created_at,
    freshness: "unknown",
    verification: payload.verification,
    revision: row.revision,
  };
}

async function decryptFactPayload<T>(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: "allergy" | "problem",
  row: AuthorityRevisionRow,
  metrics?: RuntimeReadMetricsCollector,
): Promise<T> {
  const payload = await measureRuntimeReadDecryption(
    metrics,
    () => decryptClinicalPayload<T>(
      {
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
      },
      context.clinicalSecret,
      patientCoreAuthorityFactAad(
        family,
        context.user.practiceId,
        patientId,
        row.fact_id,
        row.revision,
      ),
    ),
  );
  if (!payload) throw new Error("PATIENT_CORE_AUTHORITY_DECRYPTION_FAILED");
  return payload;
}

function collectionEnvelope<T>(
  items: T[],
  reconciliation: AuthorityReconciliationRow | null,
  truncated: boolean,
  changedAfterReconciliation: boolean,
  fallbackAsOf?: string,
): PatientCoreCollection<T> {
  if (!reconciliation) {
    return items.length === 0
      ? {
          completeness: "not_available",
          gapReason: "not_collected",
          items,
          ...(fallbackAsOf ? { asOf: fallbackAsOf } : {}),
        }
      : {
          completeness: "partial",
          gapReason: "not_collected",
          items,
          ...(fallbackAsOf ? { asOf: fallbackAsOf } : {}),
        };
  }
  if (
    reconciliation.completeness === "partial" ||
    truncated ||
    changedAfterReconciliation
  ) {
    return {
      completeness: "partial",
      gapReason: truncated || changedAfterReconciliation ? "other" : "not_collected",
      items,
      asOf: reconciliation.reconciled_at,
    };
  }
  return {
    completeness: "complete",
    items,
    asOf: reconciliation.reconciled_at,
  };
}

export async function readPatientCoreAllergies(
  context: PatientRecordV2RouteContext,
  patientId: string,
  options: PatientCoreAuthorityReadOptions = {},
): Promise<PatientCoreCollection<PatientAllergyIntoleranceView>> {
  const [rows, reconciliation] = await Promise.all([
    latestAuthorityFactRows(
      context,
      patientId,
      "allergy",
      MAX_CURRENT_AUTHORITY_FACTS + 1,
      options.metrics,
    ),
    latestAuthorityReconciliation(
      context,
      patientId,
      "allergy",
      options.metrics,
    ),
  ]);
  const truncated = rows.length > MAX_CURRENT_AUTHORITY_FACTS;
  const visibleRows = rows.slice(0, MAX_CURRENT_AUTHORITY_FACTS);
  const changedAfterReconciliation = Boolean(
    reconciliation && visibleRows.some((row) => row.created_at > reconciliation.created_at),
  );
  const items = await Promise.all(
    visibleRows.map(async (row) => {
      const payload = await decryptFactPayload<StoredAllergyPayload>(
        context,
        patientId,
        "allergy",
        row,
        options.metrics,
      );
      const substanceKey = normalizeText(payload.substanceKey);
      const medicationId = normalizeText(payload.medicationId);
      const onsetAt = normalizeText(payload.onsetAt);
      const resolvedAt = normalizeText(payload.resolvedAt);
      return {
        factId: row.fact_id,
        factKey: `allergy:${row.fact_id}`,
        displayName: payload.displayName.trim(),
        category: payload.category,
        status: payload.status,
        criticality: payload.criticality,
        ...(substanceKey ? { substanceKey } : {}),
        ...(medicationId ? { medicationId } : {}),
        ...(payload.reactions ? { reactions: payload.reactions } : {}),
        ...(onsetAt ? { onsetAt } : {}),
        ...(resolvedAt ? { resolvedAt } : {}),
        meta: factMeta(context, patientId, row, payload),
      } satisfies PatientAllergyIntoleranceView;
    }),
  );
  return collectionEnvelope(
    items,
    reconciliation,
    truncated,
    changedAfterReconciliation,
    visibleRows[0]?.created_at,
  );
}

export async function readPatientCoreProblems(
  context: PatientRecordV2RouteContext,
  patientId: string,
  options: PatientCoreAuthorityReadOptions = {},
): Promise<PatientCoreCollection<PatientProblemView>> {
  const [rows, reconciliation] = await Promise.all([
    latestAuthorityFactRows(
      context,
      patientId,
      "problem",
      MAX_CURRENT_AUTHORITY_FACTS + 1,
      options.metrics,
    ),
    latestAuthorityReconciliation(
      context,
      patientId,
      "problem",
      options.metrics,
    ),
  ]);
  const truncated = rows.length > MAX_CURRENT_AUTHORITY_FACTS;
  const visibleRows = rows.slice(0, MAX_CURRENT_AUTHORITY_FACTS);
  const changedAfterReconciliation = Boolean(
    reconciliation && visibleRows.some((row) => row.created_at > reconciliation.created_at),
  );
  const items = await Promise.all(
    visibleRows.map(async (row) => {
      const payload = await decryptFactPayload<StoredProblemPayload>(
        context,
        patientId,
        "problem",
        row,
        options.metrics,
      );
      const onsetAt = normalizeText(payload.onsetAt);
      const resolvedAt = normalizeText(payload.resolvedAt);
      return {
        factId: row.fact_id,
        factKey: `problem:${row.fact_id}`,
        displayName: payload.displayName.trim(),
        status: payload.status,
        ...(payload.coding ? { coding: payload.coding } : {}),
        ...(onsetAt ? { onsetAt } : {}),
        ...(resolvedAt ? { resolvedAt } : {}),
        ...(payload.relatedProblemFactIds
          ? { relatedProblemFactIds: payload.relatedProblemFactIds }
          : {}),
        meta: factMeta(context, patientId, row, payload),
      } satisfies PatientProblemView;
    }),
  );
  return collectionEnvelope(
    items,
    reconciliation,
    truncated,
    changedAfterReconciliation,
    visibleRows[0]?.created_at,
  );
}
