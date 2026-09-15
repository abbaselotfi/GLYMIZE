import { RuntimeReadMetricsCollector } from "../runtime-read-metrics";
import { createClinicalPayloadDecryptor } from "../runtime-security";
import type { PatientRecordV2RouteContext } from "../patient-record-v2/context";
import { patientCoreAuthorityRoute } from "./authority-route";
import { decodePatientObservationCursor, decodePatientTimelineCursor } from "./pagination";
import { createPatientCoreReadSession } from "./read-session";
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

export interface PatientClinicalCoreRouteOptions {
  allergyProblemAuthorityEnabled?: boolean;
  d1ReadSessionsEnabled?: boolean;
  cryptoKeyReuseEnabled?: boolean;
  historyScopeLookupEnabled?: boolean;
}

export async function patientClinicalCoreRoute(
  request: Request,
  context: PatientRecordV2RouteContext,
  options: PatientClinicalCoreRouteOptions = {},
): Promise<Response | null> {
  const authorityEnabled = options.allergyProblemAuthorityEnabled === true;
  const authorityResponse = await patientCoreAuthorityRoute(
    request,
    context,
    authorityEnabled,
  );
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

    const sessionsEnabled = options.d1ReadSessionsEnabled === true;
    const metrics = new RuntimeReadMetricsCollector(
      sessionsEnabled ? "first-primary" : "direct-primary",
    );
    try {
      // Preflight before creating a session; readers retain their own validation.
      // This deliberately adds one bounded cursor verification while opt-in.
      if (sessionsEnabled) {
        const decode = family === "observations"
          ? decodePatientObservationCursor : decodePatientTimelineCursor;
        await decode(cursor, { practiceId: context.user.practiceId, patientId }, context.clinicalSecret);
      }
      const readSession = sessionsEnabled ? createPatientCoreReadSession(context.database) : undefined;
      const page = await readPatientLongitudinalHistoryPage(
        {
          database: readSession?.database ?? context.database,
          user: context.user,
          clinicalSecret: context.clinicalSecret,
          ...(options.cryptoKeyReuseEnabled === true
            ? { decryptClinical: createClinicalPayloadDecryptor(context.clinicalSecret) } : {}),
        },
        patientId,
        family,
        cursor,
        { metrics, historyScopeLookupEnabled: options.historyScopeLookupEnabled === true },
      );
      // A does not transport, persist or log bookmark bytes.
      if (readSession) await readSession.finish();
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
        "read_failed",
      );
      return context.respond({ error: "patient_core_read_failed" }, 500);
    }
  }

  const metrics = new RuntimeReadMetricsCollector();
  try {
    const model = await readPatientLongitudinalModel(context, patientId, {
      metrics,
      allergyProblemAuthorityEnabled: authorityEnabled,
    });
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
