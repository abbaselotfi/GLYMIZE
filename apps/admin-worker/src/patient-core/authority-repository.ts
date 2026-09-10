import type {
  PatientAllergyIntoleranceView,
  PatientCoreAllergyMutationInput,
  PatientCoreAuthorityFactWriteResult,
  PatientCoreAuthorityFamily,
  PatientCoreCollection,
  PatientCoreCollectionReconciliationInput,
  PatientCoreCollectionReconciliationResult,
  PatientCoreFactMeta,
  PatientCoreProblemMutationInput,
  PatientProblemView,
} from "@glymize/contracts/patient-core";
import { decryptClinicalPayload, encryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import {
  patientCoreAuthorityFactAad,
  patientCoreReconciliationAad,
} from "./aad";

const MAX_CURRENT_AUTHORITY_FACTS = 200;

const REVISION_TABLES = {
  allergy: "patient_core_allergy_revisions",
  problem: "patient_core_problem_revisions",
} as const;

type RevisionRow = {
  fact_id: string;
  revision: number;
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  created_by: string;
  created_at: string;
};

type ReconciliationRow = {
  revision: number;
  completeness: "partial" | "complete";
  payload_ciphertext: string;
  payload_iv: string;
  payload_auth_tag: string;
  reconciled_by: string;
  reconciled_at: string;
  created_at: string;
};

type StoredAllergyPayload = Omit<
  PatientCoreAllergyMutationInput,
  "schemaVersion" | "factId" | "expectedRevision"
>;
type StoredProblemPayload = Omit<
  PatientCoreProblemMutationInput,
  "schemaVersion" | "factId" | "expectedRevision"
>;
type StoredReconciliationPayload = Pick<
  PatientCoreCollectionReconciliationInput,
  "source"
>;

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

async function patientExistsInScope(
  context: PatientRecordV2RouteContext,
  patientId: string,
) {
  const row = await context.database
    .prepare("SELECT id FROM patient_registry WHERE id=? AND practice_id=? LIMIT 1")
    .bind(patientId, context.user.practiceId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function currentFactRevision(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientCoreAuthorityFamily,
  factId: string,
) {
  const table = REVISION_TABLES[family];
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

function conflictError() {
  return new Error("PATIENT_CORE_AUTHORITY_REVISION_CONFLICT");
}

function notFoundError() {
  return new Error("PATIENT_CORE_AUTHORITY_FACT_NOT_FOUND");
}

function decryptionError() {
  return new Error("PATIENT_CORE_AUTHORITY_DECRYPTION_FAILED");
}

function looksLikeUniqueConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /UNIQUE|constraint/i.test(message);
}

async function writeFactRevision(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientCoreAuthorityFamily,
  input: PatientCoreAllergyMutationInput | PatientCoreProblemMutationInput,
): Promise<PatientCoreAuthorityFactWriteResult | null> {
  if (!(await patientExistsInScope(context, patientId))) return null;

  const factId = input.factId ?? crypto.randomUUID();
  const current = input.factId
    ? await currentFactRevision(context, patientId, family, factId)
    : null;

  if (input.factId) {
    if (current === null) throw notFoundError();
    if (current !== input.expectedRevision) throw conflictError();
  } else if (input.expectedRevision !== undefined) {
    throw conflictError();
  }

  const revision = (current ?? 0) + 1;
  const recordedAt = new Date().toISOString();
  const payload = Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !["schemaVersion", "factId", "expectedRevision"].includes(key),
    ),
  ) as StoredAllergyPayload | StoredProblemPayload;
  const encrypted = await encryptClinicalPayload(
    payload,
    context.clinicalSecret,
    patientCoreAuthorityFactAad(
      family,
      context.user.practiceId,
      patientId,
      factId,
      revision,
    ),
  );

  const table = REVISION_TABLES[family];
  try {
    await context.database
      .prepare(
        `INSERT INTO ${table}
          (fact_id,revision,patient_id,practice_id,payload_ciphertext,payload_iv,
           payload_auth_tag,created_by,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        factId,
        revision,
        patientId,
        context.user.practiceId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        context.user.id,
        recordedAt,
      )
      .run();
  } catch (error) {
    if (looksLikeUniqueConflict(error)) throw conflictError();
    throw error;
  }

  return {
    schemaVersion: 1,
    family,
    factId,
    revision,
    recordedAt,
  };
}

export function writePatientCoreAllergy(
  context: PatientRecordV2RouteContext,
  patientId: string,
  input: PatientCoreAllergyMutationInput,
) {
  return writeFactRevision(context, patientId, "allergy", input);
}

export function writePatientCoreProblem(
  context: PatientRecordV2RouteContext,
  patientId: string,
  input: PatientCoreProblemMutationInput,
) {
  return writeFactRevision(context, patientId, "problem", input);
}

async function latestReconciliation(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientCoreAuthorityFamily,
) {
  return context.database
    .prepare(
      `SELECT revision,completeness,payload_ciphertext,payload_iv,payload_auth_tag,
              reconciled_by,reconciled_at,created_at
       FROM patient_core_collection_reconciliations
       WHERE practice_id=? AND patient_id=? AND family=?
       ORDER BY revision DESC LIMIT 1`,
    )
    .bind(context.user.practiceId, patientId, family)
    .first<ReconciliationRow>();
}

export async function reconcilePatientCoreCollection(
  context: PatientRecordV2RouteContext,
  patientId: string,
  input: PatientCoreCollectionReconciliationInput,
): Promise<PatientCoreCollectionReconciliationResult | null> {
  if (!(await patientExistsInScope(context, patientId))) return null;
  const current = await latestReconciliation(context, patientId, input.family);
  if (current) {
    if (input.expectedRevision !== current.revision) throw conflictError();
  } else if (input.expectedRevision !== undefined) {
    throw conflictError();
  }

  const revision = (current?.revision ?? 0) + 1;
  const createdAt = new Date().toISOString();
  const reconciledAt = normalizeText(input.reconciledAt) ?? createdAt;
  const payload: StoredReconciliationPayload = { source: input.source };
  const encrypted = await encryptClinicalPayload(
    payload,
    context.clinicalSecret,
    patientCoreReconciliationAad(
      context.user.practiceId,
      patientId,
      input.family,
      revision,
    ),
  );

  try {
    await context.database
      .prepare(
        `INSERT INTO patient_core_collection_reconciliations
          (practice_id,patient_id,family,revision,completeness,payload_ciphertext,
           payload_iv,payload_auth_tag,reconciled_by,reconciled_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        context.user.practiceId,
        patientId,
        input.family,
        revision,
        input.completeness,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        context.user.id,
        reconciledAt,
        createdAt,
      )
      .run();
  } catch (error) {
    if (looksLikeUniqueConflict(error)) throw conflictError();
    throw error;
  }

  return {
    schemaVersion: 1,
    family: input.family,
    revision,
    completeness: input.completeness,
    reconciledAt,
  };
}

async function latestFactRows(
  context: PatientRecordV2RouteContext,
  patientId: string,
  family: PatientCoreAuthorityFamily,
) {
  const table = REVISION_TABLES[family];
  const result = await context.database
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
      MAX_CURRENT_AUTHORITY_FACTS + 1,
    )
    .all<RevisionRow>();
  return result.results ?? [];
}

function factMeta(
  context: PatientRecordV2RouteContext,
  patientId: string,
  row: RevisionRow,
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
  family: PatientCoreAuthorityFamily,
  row: RevisionRow,
): Promise<T> {
  const payload = await decryptClinicalPayload<T>(
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
  );
  if (!payload) throw decryptionError();
  return payload;
}

function collectionEnvelope<T>(
  items: T[],
  reconciliation: ReconciliationRow | null,
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
): Promise<PatientCoreCollection<PatientAllergyIntoleranceView>> {
  const [rows, reconciliation] = await Promise.all([
    latestFactRows(context, patientId, "allergy"),
    latestReconciliation(context, patientId, "allergy"),
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
      );
      return {
        factId: row.fact_id,
        factKey: `allergy:${row.fact_id}`,
        displayName: payload.displayName.trim(),
        category: payload.category,
        status: payload.status,
        criticality: payload.criticality,
        ...(normalizeText(payload.substanceKey) ? { substanceKey: normalizeText(payload.substanceKey) } : {}),
        ...(normalizeText(payload.medicationId) ? { medicationId: normalizeText(payload.medicationId) } : {}),
        ...(payload.reactions ? { reactions: payload.reactions } : {}),
        ...(normalizeText(payload.onsetAt) ? { onsetAt: normalizeText(payload.onsetAt) } : {}),
        ...(normalizeText(payload.resolvedAt) ? { resolvedAt: normalizeText(payload.resolvedAt) } : {}),
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
): Promise<PatientCoreCollection<PatientProblemView>> {
  const [rows, reconciliation] = await Promise.all([
    latestFactRows(context, patientId, "problem"),
    latestReconciliation(context, patientId, "problem"),
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
      );
      return {
        factId: row.fact_id,
        factKey: `problem:${row.fact_id}`,
        displayName: payload.displayName.trim(),
        status: payload.status,
        ...(payload.coding ? { coding: payload.coding } : {}),
        ...(normalizeText(payload.onsetAt) ? { onsetAt: normalizeText(payload.onsetAt) } : {}),
        ...(normalizeText(payload.resolvedAt) ? { resolvedAt: normalizeText(payload.resolvedAt) } : {}),
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
