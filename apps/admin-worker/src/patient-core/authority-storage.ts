import type {
  PatientCoreAllergyMutationInput,
  PatientCoreAuthorityFamily,
  PatientCoreCollectionReconciliationInput,
  PatientCoreProblemMutationInput,
} from "@glymize/contracts/patient-core";
import {
  measureRuntimeReadQuery,
  type RuntimeReadMetricsCollector,
} from "../runtime-read-metrics";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";

export const AUTHORITY_REVISION_TABLES = {
  allergy: "patient_core_allergy_revisions",
  problem: "patient_core_problem_revisions",
} as const;

export type AuthorityRevisionRow = {
  fact_id: string;
  revision: number;
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_by: string;
  created_at: string;
};

export type AuthorityReconciliationRow = {
  revision: number;
  completeness: "partial" | "complete";
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  reconciled_by: string;
  reconciled_at: string;
  created_at: string;
};

export type StoredAllergyPayload = Omit<
  PatientCoreAllergyMutationInput,
  "schemaVersion" | "factId" | "expectedRevision"
>;
export type StoredProblemPayload = Omit<
  PatientCoreProblemMutationInput,
  "schemaVersion" | "factId" | "expectedRevision"
>;
export type StoredReconciliationPayload = Pick<
  PatientCoreCollectionReconciliationInput,
  "source"
>;

export async function patientExistsInAuthorityScope(
  context: PatientRecordV2RouteContext,
  patientId: string,
) {
  const row = await context.database
    .prepare("SELECT id FROM patient_registry WHERE id=? AND practice_id=? LIMIT 1")
    .bind(patientId, context.user.practiceId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function currentAuthorityFactRevision(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientCoreAuthorityFamily,
  factId: string,
) {
  const table = AUTHORITY_REVISION_TABLES[family];
  const row = await context.database
    .prepare(
      `SELECT MAX(revision) AS revision
       FROM ${table}
       WHERE fact_id=? AND patient_id=? AND practice_id=?`,
    )
    .bind(factId, patientId, context.user.practiceId)
    .first<{ revision: number | null }>();
  return row?.revision ?? null;
}

export async function latestAuthorityReconciliation(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientCoreAuthorityFamily,
  metrics?: RuntimeReadMetricsCollector,
) {
  return measureRuntimeReadQuery(
    metrics,
    () => context.database
      .prepare(
        `SELECT revision,completeness,payload_ciphertext,payload_iv,payload_auth_tag,
                reconciled_by,reconciled_at,created_at
         FROM patient_core_collection_reconciliations
         WHERE practice_id=? AND patient_id=? AND family=?
         ORDER BY revision DESC LIMIT 1`,
      )
      .bind(context.user.practiceId, patientId, family)
      .first<AuthorityReconciliationRow>(),
    (row) => row ? 1 : 0,
  );
}

export async function latestAuthorityFactRows(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientCoreAuthorityFamily,
  limit: number,
  metrics?: RuntimeReadMetricsCollector,
) {
  const table = AUTHORITY_REVISION_TABLES[family];
  return measureRuntimeReadQuery(
    metrics,
    () => context.database
      .prepare(
        `WITH latest AS (
           SELECT fact_id, MAX(revision) AS revision
           FROM ${table}
           WHERE practice_id=? AND patient_id=?
           GROUP BY fact_id
         )
         SELECT r.fact_id,r.revision,r.payload_ciphertext,r.payload_iv,r.payload_auth_tag,
                r.created_by,r.created_at
         FROM ${table} r
         JOIN latest l ON l.fact_id=r.fact_id AND l.revision=r.revision
         WHERE r.practice_id=? AND r.patient_id=?
         ORDER BY r.created_at DESC, r.fact_id ASC
         LIMIT ?`,
      )
      .bind(
        context.user.practiceId,
        patientId,
        context.user.practiceId,
        patientId,
        limit,
      )
      .all<AuthorityRevisionRow>(),
    (result) => result.results?.length ?? 0,
  ).then((result) => result.results ?? []);
}
