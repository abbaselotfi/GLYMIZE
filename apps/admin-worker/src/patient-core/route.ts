import { RuntimeReadMetricsCollector } from "../runtime-read-metrics";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { patientCoreAuthorityRoute } from "./authority-route";
import {
  readPatientLongitudinalHistoryPage,
  readPatientLongitudinalModel,
} from "./read-model";

const LONGITUDINAL_PATH = /^\/v1\/patients\/([^/]+)\/longitudinal$/;
const HISTORY_PATH = /^\/v1\/patients\/([^/]+)\/longitudinal\/history$/;

async function authorizePatientCoreRead(context: PatientRecordV2RouteContext) {
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
  return null;
}

function decodePatientId(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function historyInputError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return code.startsWith("PATIENT_HISTORY_") ||
    code === "PATIENT_HISTORY_CONTINUATION_MISSING";
}

function logMetrics(
  route: "summary" | "history",
  metrics: RuntimeReadMetricsCollector,
  payload: unknown,
) {
  console.info(
    "patient_core_read_metrics",
    JSON.stringify({ route, ...metrics.finish(payload) }),
  );
}

export async function patientClinicalCoreRoute(
  request: Request,
  context: PatientRecordV2RouteContext,
): Promise<Response | null> {
  const authorityResponse = await patientCoreAuthorityRoute(request, context);
  if (authorityResponse) return authorityResponse;

  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const summaryMatch = url.pathname.match(LONGITUDINAL_PATH);
  const historyMatch = url.pathname.match(HISTORY_PATH);
  if (!summaryMatch && !historyMatch) return null;

  const denied = await authorizePatientCoreRead(context);
  if (denied) return denied;

  const patientId = decodePatientId((summaryMatch ?? historyMatch)![1]!);
  if (!patientId) return context.respond({ error: "invalid_patient_id" }, 422);

  if (historyMatch) {
    const family = url.searchParams.get("family");
    const cursor = url.searchParams.get("cursor");
    if (
      (family !== "observations" && family !== "timeline") ||
      !cursor
    ) {
      return context.respond({ error: "patient_history_request_invalid" }, 422);
    }

    const metrics = new RuntimeReadMetricsCollector();
    try {
      const page = await readPatientLongitudinalHistoryPage(
        context,
        patientId,
        family,
        cursor,
        { metrics },
      );
      if (!page) return context.respond({ error: "patient_not_found" }, 404);
      logMetrics("history", metrics, page);
      return context.respond(page);
    } catch (error) {
      if (historyInputError(error)) {
        return context.respond(
          { error: error instanceof Error ? error.message : "PATIENT_HISTORY_CURSOR_INVALID" },
          422,
        );
      }
      console.error(
        "patient_core_history_read_failed",
        error instanceof Error ? error.message : "unknown_error",
      );
      return context.respond({ error: "patient_core_read_failed" }, 500);
    }
  }

  const metrics = new RuntimeReadMetricsCollector();
  try {
    const model = await readPatientLongitudinalModel(context, patientId, { metrics });
    if (!model) return context.respond({ error: "patient_not_found" }, 404);
    logMetrics("summary", metrics, model);
    return context.respond(model);
  } catch (error) {
    console.error(
      "patient_core_read_failed",
      error instanceof Error ? error.message : "unknown_error",
    );
    return context.respond({ error: "patient_core_read_failed" }, 500);
  }
}
