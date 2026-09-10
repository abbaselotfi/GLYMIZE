import type {
  PatientCoreAllergyMutationInput,
  PatientCoreCollectionReconciliationInput,
  PatientCoreProblemMutationInput,
} from "@glymize/contracts/patient-core";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import {
  reconcilePatientCoreCollection,
  writePatientCoreAllergy,
  writePatientCoreProblem,
} from "./authority-repository";
import {
  parsePatientCoreAllergyMutation,
  parsePatientCoreCollectionReconciliation,
  parsePatientCoreProblemMutation,
} from "./authority-validation";

const FACT_PATH = /^\/v1\/patients\/([^/]+)\/patient-core\/(allergies|problems)$/;
const RECONCILIATION_PATH = /^\/v1\/patients\/([^/]+)\/patient-core\/reconciliation$/;
const MAX_BODY_BYTES = 64 * 1024;

function decodePatientId(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

async function jsonBody(request: Request) {
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("PATIENT_CORE_AUTHORITY_INPUT_INVALID");
  }
}

async function sourceEncounterMatchesScope(
  context: PatientRecordV2RouteContext,
  patientId: string,
  input:
    | PatientCoreAllergyMutationInput
    | PatientCoreProblemMutationInput
    | PatientCoreCollectionReconciliationInput,
) {
  const encounterId = input.source.encounterId;
  if (!encounterId) return true;
  const row = await context.database
    .prepare(
      "SELECT id FROM patient_encounters WHERE id=? AND patient_id=? AND practice_id=? LIMIT 1",
    )
    .bind(encounterId, patientId, context.user.practiceId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function authorizeWrite(
  context: PatientRecordV2RouteContext,
  requiresVerificationAuthority: boolean,
) {
  if (!context.user.permissions.includes("handoff.write")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!(await context.authorize("patient_record.clinical_fact.write"))) {
    return context.respond(
      { error: "patient_role_required", requiredRole: "editor" },
      403,
    );
  }
  if (
    requiresVerificationAuthority &&
    !(await context.authorize("patient_record.clinical_fact.verify"))
  ) {
    return context.respond(
      { error: "patient_role_required", requiredRole: "approver" },
      403,
    );
  }
  return null;
}

async function authorizeReconciliation(context: PatientRecordV2RouteContext) {
  if (!context.user.permissions.includes("handoff.write")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!(await context.authorize("patient_record.clinical_fact.reconcile"))) {
    return context.respond(
      { error: "patient_role_required", requiredRole: "approver" },
      403,
    );
  }
  return null;
}

function authorityError(context: PatientRecordV2RouteContext, error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "PATIENT_CORE_AUTHORITY_INPUT_INVALID") {
    return context.respond({ error: code }, 422);
  }
  if (code === "PATIENT_CORE_AUTHORITY_REVISION_CONFLICT") {
    return context.respond({ error: code }, 409);
  }
  if (code === "PATIENT_CORE_AUTHORITY_FACT_NOT_FOUND") {
    return context.respond({ error: code }, 404);
  }
  console.error("patient_core_authority_write_failed", code || "unknown_error");
  return context.respond({ error: "patient_core_authority_write_failed" }, 500);
}

export async function patientCoreAuthorityRoute(
  request: Request,
  context: PatientRecordV2RouteContext,
): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const url = new URL(request.url);
  const factMatch = url.pathname.match(FACT_PATH);
  const reconciliationMatch = url.pathname.match(RECONCILIATION_PATH);
  if (!factMatch && !reconciliationMatch) return null;

  const rawPatientId = (factMatch ?? reconciliationMatch)![1]!;
  const patientId = decodePatientId(rawPatientId);
  if (!patientId) return context.respond({ error: "invalid_patient_id" }, 422);

  try {
    const body = await jsonBody(request);

    if (reconciliationMatch) {
      const denied = await authorizeReconciliation(context);
      if (denied) return denied;
      const input = parsePatientCoreCollectionReconciliation(body);
      if (!(await sourceEncounterMatchesScope(context, patientId, input))) {
        return context.respond({ error: "patient_core_source_scope_mismatch" }, 422);
      }
      const result = await reconcilePatientCoreCollection(context, patientId, input);
      if (!result) return context.respond({ error: "patient_not_found" }, 404);
      await context.audit(
        "patient_core.collection.reconcile",
        "patient_core_collection",
        `${patientId}:${input.family}`,
        {
          family: input.family,
          revision: result.revision,
          completeness: result.completeness,
          sourceType: input.source.sourceType,
        },
      );
      return context.respond(result, 201);
    }

    const family = factMatch![2]!;
    const input = family === "allergies"
      ? parsePatientCoreAllergyMutation(body)
      : parsePatientCoreProblemMutation(body);
    const denied = await authorizeWrite(context, input.verification === "verified");
    if (denied) return denied;
    if (!(await sourceEncounterMatchesScope(context, patientId, input))) {
      return context.respond({ error: "patient_core_source_scope_mismatch" }, 422);
    }

    const result = family === "allergies"
      ? await writePatientCoreAllergy(
          context,
          patientId,
          input as PatientCoreAllergyMutationInput,
        )
      : await writePatientCoreProblem(
          context,
          patientId,
          input as PatientCoreProblemMutationInput,
        );
    if (!result) return context.respond({ error: "patient_not_found" }, 404);

    await context.audit(
      result.revision === 1
        ? `patient_core.${result.family}.create`
        : `patient_core.${result.family}.revise`,
      `patient_core_${result.family}`,
      result.factId,
      {
        patientId,
        revision: result.revision,
        verification: input.verification,
        sourceType: input.source.sourceType,
      },
    );
    return context.respond(result, 201);
  } catch (error) {
    return authorityError(context, error);
  }
}
