import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { readPatientLongitudinalModel } from "./read-model";

const LONGITUDINAL_PATH = /^\/v1\/patients\/([^/]+)\/longitudinal$/;

export async function patientClinicalCoreRoute(
  request: Request,
  context: PatientRecordV2RouteContext,
): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(LONGITUDINAL_PATH);
  if (!match || request.method !== "GET") return null;

  if (!context.user.permissions.includes("handoff.read")) {
    return context.respond({ error: "permission_denied" }, 403);
  }
  if (!(await context.authorize("patient_record.workspace.read"))) {
    return context.respond(
      {
        error: "patient_role_required",
        requiredRole: "editor",
      },
      403,
    );
  }

  let patientId: string;
  try {
    patientId = decodeURIComponent(match[1]!);
  } catch {
    return context.respond({ error: "invalid_patient_id" }, 422);
  }

  try {
    const model = await readPatientLongitudinalModel(context, patientId);
    return model
      ? context.respond(model)
      : context.respond({ error: "patient_not_found" }, 404);
  } catch (error) {
    console.error(
      "patient_core_read_failed",
      error instanceof Error ? error.message : "unknown_error",
    );
    return context.respond({ error: "patient_core_read_failed" }, 500);
  }
}
