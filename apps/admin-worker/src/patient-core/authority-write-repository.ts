import type {
  PatientCoreAllergyMutationInput,
  PatientCoreAuthorityFactWriteResult,
  PatientCoreAuthorityFamily,
  PatientCoreCollectionReconciliationInput,
  PatientCoreCollectionReconciliationResult,
  PatientCoreProblemMutationInput,
} from "@glymize/contracts/patient-core";
import { encryptClinicalPayload } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import {
  patientCoreAuthorityFactAad,
  patientCoreReconciliationAad,
} from "./aad";
import {
  AUTHORITY_REVISION_TABLES,
  currentAuthorityFactRevision,
  latestAuthorityReconciliation,
  patientExistsInAuthorityScope,
  type StoredAllergyPayload,
  type StoredProblemPayload,
  type StoredReconciliationPayload,
} from "./authority-storage";

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function conflictError() {
  return new Error("PATIENT_CORE_AUTHORITY_REVISION_CONFLICT");
}

function notFoundError() {
  return new Error("PATIENT_CORE_AUTHORITY_FACT_NOT_FOUND");
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
  if (!(await patientExistsInAuthorityScope(context, patientId))) return null;

  const factId = input.factId ?? crypto.randomUUID();
  const current = input.factId
    ? await currentAuthorityFactRevision(context, patientId, family, factId)
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

  try {
    await context.database
      .prepare(
        `INSERT INTO ${AUTHORITY_REVISION_TABLES[family]}
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

export async function reconcilePatientCoreCollection(
  context: PatientRecordV2RouteContext,
  patientId: string,
  input: PatientCoreCollectionReconciliationInput,
): Promise<PatientCoreCollectionReconciliationResult | null> {
  if (!(await patientExistsInAuthorityScope(context, patientId))) return null;
  const current = await latestAuthorityReconciliation(
    context,
    patientId,
    input.family,
  );
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
