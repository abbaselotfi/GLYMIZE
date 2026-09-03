import type {
  CareRelationshipStatus,
  PatientPracticeContext,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { requirePatientAccountSession } from "./platform-patient-identity";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { hmacHex } from "./runtime-security";

const RATE_WINDOW_MS = 15 * 60 * 1000;

type ContextRow = {
  id: string;
  practice_id: string;
  status: CareRelationshipStatus;
  provider_display_name: string;
  specialty_name: string;
  practice_display_name: string;
  local_patient_id: string | null;
  patient_proofing_status: "unverified" | "pending" | "verified" | "rejected";
  legacy_portal_bridge_available: number;
  updated_at: string;
};

function enabled(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function serviceEnabled(env: V3Env) {
  return enabled(env.MULTI_PRACTICE_PATIENT_ENABLED) &&
    enabled(env.CARE_RELATIONSHIPS_ENABLED) &&
    enabled(env.PATIENT_IDENTITY_V2_ENABLED);
}

function reply(request: Request, env: V3Env, body: unknown, status = 200) {
  const origin = request.headers.get("origin");
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(isRuntimeOriginAllowed(origin, env)
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "authorization, content-type",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            vary: "Origin",
          }
        : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function safeId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function contextView(row: ContextRow, linkingEnabled: boolean): PatientPracticeContext {
  const selectable = row.status === "requested" || row.status === "active" || row.status === "paused";
  return {
    id: row.id,
    practiceId: row.practice_id,
    provider: {
      displayName: row.provider_display_name,
      specialtyName: row.specialty_name,
      practiceDisplayName: row.practice_display_name,
    },
    relationshipStatus: row.status,
    selectable,
    linkedLocalRecord: Boolean(row.local_patient_id),
    legacyPortalBridgeAvailable:
      linkingEnabled &&
      row.status === "active" &&
      row.patient_proofing_status === "verified" &&
      row.legacy_portal_bridge_available === 1,
    updatedAt: row.updated_at,
  };
}

async function consumeSelectionRate(env: V3Env, patientAccountId: string) {
  const key = await hmacHex(env.SESSION_SECRET, `practice-context-select:${patientAccountId}`);
  const now = v3now();
  const cutoff = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const row = await v3db(env).prepare(
    `INSERT INTO auth_rate_limits(key,window_started_at,count)
     VALUES(?,?,1)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN auth_rate_limits.window_started_at<? THEN 1 ELSE auth_rate_limits.count+1 END,
       window_started_at=CASE WHEN auth_rate_limits.window_started_at<? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END
     RETURNING count`,
  ).bind(key, now, cutoff, cutoff).first<{ count: number }>();
  return Boolean(row && row.count <= 60);
}

function contextSelect(where: string) {
  return `SELECT c.id,c.practice_id,c.status,c.provider_display_name,c.specialty_name,
                 c.practice_display_name,c.local_patient_id,c.updated_at,
                 a.proofing_status AS patient_proofing_status,
                 CASE WHEN c.local_patient_id IS NOT NULL AND EXISTS(
                   SELECT 1
                   FROM portal_users u
                   JOIN portal_user_account_links l ON l.portal_user_id=u.id
                   WHERE u.practice_id=c.practice_id AND u.patient_id=c.local_patient_id
                     AND u.status='active' AND l.patient_account_id=c.patient_account_id
                     AND l.link_status='verified'
                 ) THEN 1 ELSE 0 END AS legacy_portal_bridge_available
          FROM care_relationships c
          JOIN patient_accounts a ON a.id=c.patient_account_id
          WHERE ${where}`;
}

async function listContexts(request: Request, env: V3Env) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  const rows = await v3db(env).prepare(
    `${contextSelect("c.patient_account_id=?")}
     ORDER BY CASE c.status
       WHEN 'active' THEN 0 WHEN 'requested' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
       c.updated_at DESC,c.id DESC LIMIT 100`,
  ).bind(patient.patientAccountId).all<ContextRow>();
  const linkingEnabled = enabled(env.PATIENT_RECORD_LINKING_ENABLED);
  return reply(request, env, {
    contexts: rows.results.map((row) => contextView(row, linkingEnabled)),
  });
}

async function selectContext(request: Request, env: V3Env) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  if (!(await consumeSelectionRate(env, patient.patientAccountId))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const contextId = safeId(body.contextId);
  if (!contextId) return reply(request, env, { error: "patient_practice_context_not_found" }, 404);
  const row = await v3db(env).prepare(
    contextSelect("c.id=? AND c.patient_account_id=?"),
  ).bind(contextId, patient.patientAccountId).first<ContextRow>();
  if (!row) return reply(request, env, { error: "patient_practice_context_not_found" }, 404);
  const context = contextView(row, enabled(env.PATIENT_RECORD_LINKING_ENABLED));
  if (!context.selectable) {
    return reply(request, env, { error: "patient_practice_context_inactive" }, 409);
  }
  await v3db(env).prepare(
    `INSERT INTO patient_account_security_events
     (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
     VALUES(?,?,'patient_account.practice_context_selected','patient',?,?,?)`,
  ).bind(
    crypto.randomUUID(),
    patient.patientAccountId,
    patient.patientAccountId,
    JSON.stringify({ careRelationshipId: context.id, practiceId: context.practiceId }),
    v3now(),
  ).run();
  return reply(request, env, {
    selection: {
      context,
      grantsClinicalAccess: false,
      grantsCrossPracticeAccess: false,
    },
  });
}

export async function patientPracticeContextRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname !== "/v1/patient-practice-contexts" &&
    !url.pathname.startsWith("/v1/patient-practice-contexts/")
  ) {
    return null;
  }
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (url.pathname === "/v1/patient-practice-contexts/capabilities" && request.method === "GET") {
    return reply(request, env, {
      multiPracticePatient: serviceEnabled(env),
      contextSelectionGrantsAccess: false,
    });
  }
  if (!serviceEnabled(env)) {
    return reply(request, env, { error: "multi_practice_patient_disabled" }, 403);
  }
  if (url.pathname === "/v1/patient-practice-contexts" && request.method === "GET") {
    return listContexts(request, env);
  }
  if (url.pathname === "/v1/patient-practice-contexts/select" && request.method === "POST") {
    return selectContext(request, env);
  }
  return reply(request, env, { error: "not_found" }, 404);
}
