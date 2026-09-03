import type {
  CareRelationshipStatus,
  CareRelationshipSummary,
  PracticeCareRelationshipSummary,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { requirePatientAccountSession } from "./platform-patient-identity";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";
import { hmacHex } from "./runtime-security";

const ACTIVE_STATES: readonly CareRelationshipStatus[] = ["requested", "active", "paused"];
const TERMINAL_STATES: readonly CareRelationshipStatus[] = ["ended", "revoked", "rejected"];
const RATE_WINDOW_MS = 15 * 60 * 1000;

type RelationshipRow = {
  id: string;
  patient_account_id: string;
  practice_id: string;
  assigned_physician_user_id: string | null;
  local_patient_id: string | null;
  status: CareRelationshipStatus;
  provider_display_name: string;
  specialty_name: string;
  practice_display_name: string;
  activated_at: string | null;
  terminal_at: string | null;
  created_at: string;
  updated_at: string;
  patient_proofing_status?: "unverified" | "pending" | "verified" | "rejected";
  patient_identity_mask?: string | null;
};

type RedemptionSource = {
  id: string;
  status: "pending_care_relationship" | "converted" | "cancelled" | "rejected";
  patient_account_id: string;
  practice_id: string;
  intended_physician_user_id: string;
  provider_display_name: string;
  specialty_name: string;
  practice_display_name: string;
};

function enabled(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true";
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

function safeReason(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const reason = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z][a-z0-9_]{0,39}$/.test(reason) ? reason : undefined;
}

function summary(row: RelationshipRow): CareRelationshipSummary {
  return {
    id: row.id,
    status: row.status,
    provider: {
      displayName: row.provider_display_name,
      specialtyName: row.specialty_name,
      practiceDisplayName: row.practice_display_name,
    },
    ...(row.assigned_physician_user_id
      ? { assignedPhysicianUserId: row.assigned_physician_user_id }
      : {}),
    linkedLocalRecord: Boolean(row.local_patient_id),
    ...(row.activated_at ? { activatedAt: row.activated_at } : {}),
    ...(row.terminal_at ? { terminalAt: row.terminal_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function practiceSummary(row: RelationshipRow): PracticeCareRelationshipSummary {
  return {
    ...summary(row),
    patientAccountId: row.patient_account_id,
    patientProofingStatus: row.patient_proofing_status ?? "unverified",
    ...(row.patient_identity_mask ? { patientIdentityMask: row.patient_identity_mask } : {}),
    ...(row.local_patient_id ? { localPatientId: row.local_patient_id } : {}),
  };
}

async function consumePatientRate(env: V3Env, patientAccountId: string) {
  const key = await hmacHex(env.SESSION_SECRET, `care-relationship-rate:${patientAccountId}`);
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
  return Boolean(row && row.count <= 30);
}

function relationshipSelect(alias?: string) {
  const prefix = alias ? `${alias}.` : "";
  return `${prefix}id,${prefix}patient_account_id,${prefix}practice_id,
          ${prefix}assigned_physician_user_id,${prefix}local_patient_id,${prefix}status,
          ${prefix}provider_display_name,${prefix}specialty_name,
          ${prefix}practice_display_name,${prefix}activated_at,${prefix}terminal_at,
          ${prefix}created_at,${prefix}updated_at`;
}

async function relationshipByPatientPractice(
  env: V3Env,
  patientAccountId: string,
  practiceId: string,
) {
  return v3db(env).prepare(
    `SELECT ${relationshipSelect()} FROM care_relationships
     WHERE patient_account_id=? AND practice_id=?`,
  ).bind(patientAccountId, practiceId).first<RelationshipRow>();
}

async function relationshipFromProvenance(
  env: V3Env,
  redemptionId: string,
  patientAccountId: string,
) {
  return v3db(env).prepare(
    `SELECT ${relationshipSelect("c")}
     FROM care_relationship_provenance p
     JOIN care_relationships c ON c.id=p.care_relationship_id
     WHERE p.referral_redemption_id=? AND c.patient_account_id=?`,
  ).bind(redemptionId, patientAccountId).first<RelationshipRow>();
}

async function attachRequest(
  env: V3Env,
  source: RedemptionSource,
  relationship: RelationshipRow,
) {
  const now = v3now();
  const database = v3db(env);
  const reopening = TERMINAL_STATES.includes(relationship.status);
  const nextStatus = reopening ? "requested" : relationship.status;
  const eventType = reopening ? "requested" : "referral_attached";
  const statements: D1PreparedStatement[] = [];
  if (reopening) {
    statements.push(
      database.prepare(
        `UPDATE care_relationships
         SET assigned_physician_user_id=?,local_patient_id=NULL,status='requested',
             provider_display_name=?,specialty_name=?,practice_display_name=?,
             activated_at=NULL,terminal_at=NULL,updated_at=?
         WHERE id=? AND patient_account_id=? AND practice_id=?
           AND status IN ('ended','revoked','rejected')`,
      ).bind(
        source.intended_physician_user_id,
        source.provider_display_name,
        source.specialty_name,
        source.practice_display_name,
        now,
        relationship.id,
        source.patient_account_id,
        source.practice_id,
      ),
    );
  }
  statements.push(
    database.prepare(
      `INSERT INTO care_relationship_provenance
       (id,care_relationship_id,provenance_type,referral_redemption_id,created_at)
       SELECT ?,c.id,'referral_redemption',?,?
       FROM care_relationships c
       WHERE c.id=? AND c.patient_account_id=? AND c.practice_id=? AND c.status=?`,
    ).bind(
      crypto.randomUUID(),
      source.id,
      now,
      relationship.id,
      source.patient_account_id,
      source.practice_id,
      nextStatus,
    ),
    database.prepare(
      `UPDATE referral_redemptions SET status='converted',updated_at=?
       WHERE id=? AND patient_account_id=? AND status='pending_care_relationship'
         AND EXISTS(SELECT 1 FROM care_relationship_provenance
                    WHERE referral_redemption_id=?)`,
    ).bind(now, source.id, source.patient_account_id, source.id),
    database.prepare(
      `INSERT INTO care_relationship_events
       (id,care_relationship_id,practice_id,from_status,to_status,event_type,
        actor_type,actor_id,reason_code,created_at)
       SELECT ?,c.id,c.practice_id,?,?,?,'patient',?,NULL,?
       FROM care_relationships c
       JOIN care_relationship_provenance p ON p.care_relationship_id=c.id
       WHERE p.referral_redemption_id=?`,
    ).bind(
      crypto.randomUUID(),
      relationship.status,
      nextStatus,
      eventType,
      source.patient_account_id,
      now,
      source.id,
    ),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,NULL,c.practice_id,?,'care_relationship',c.id,?,?
       FROM care_relationships c
       JOIN care_relationship_provenance p ON p.care_relationship_id=c.id
       WHERE p.referral_redemption_id=?`,
    ).bind(
      crypto.randomUUID(),
      `care_relationship.${eventType}`,
      JSON.stringify({ referralRedemptionId: source.id, patientAccountId: source.patient_account_id }),
      now,
      source.id,
    ),
    database.prepare(
      `INSERT INTO patient_account_security_events
       (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
       SELECT ?,? ,?,'patient',?,?,?
       FROM care_relationship_provenance p WHERE p.referral_redemption_id=?`,
    ).bind(
      crypto.randomUUID(),
      source.patient_account_id,
      `patient_account.care_relationship_${eventType}`,
      source.patient_account_id,
      JSON.stringify({ careRelationshipId: relationship.id, practiceId: source.practice_id }),
      now,
      source.id,
    ),
  );
  await database.batch(statements);
  const next = await relationshipFromProvenance(env, source.id, source.patient_account_id);
  if (!next) throw new Error("relationship_request_conflict");
  return next;
}

async function requestRelationship(request: Request, env: V3Env) {
  if (!enabled(env.PATIENT_IDENTITY_V2_ENABLED)) {
    return reply(request, env, { error: "patient_identity_required" }, 403);
  }
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  if (patient.proofingStatus === "rejected") {
    return reply(request, env, { error: "patient_identity_ineligible" }, 403);
  }
  if (!(await consumePatientRate(env, patient.patientAccountId))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const redemptionId = safeId(body.referralRedemptionId);
  if (!redemptionId) return reply(request, env, { error: "relationship_request_unavailable" }, 404);

  const existingProvenance = await relationshipFromProvenance(
    env,
    redemptionId,
    patient.patientAccountId,
  );
  if (existingProvenance) {
    return reply(request, env, { relationship: summary(existingProvenance) });
  }

  const source = await v3db(env).prepare(
    `SELECT d.id,d.status,d.patient_account_id,d.practice_id,d.intended_physician_user_id,
            r.provider_display_name,r.specialty_name,r.practice_display_name
     FROM referral_redemptions d
     JOIN referral_invites r ON r.id=d.referral_id
     WHERE d.id=? AND d.patient_account_id=? AND d.status='pending_care_relationship'`,
  ).bind(redemptionId, patient.patientAccountId).first<RedemptionSource>();
  if (!source) return reply(request, env, { error: "relationship_request_unavailable" }, 404);

  const current = await relationshipByPatientPractice(
    env,
    patient.patientAccountId,
    source.practice_id,
  );
  try {
    if (current) {
      if (
        ACTIVE_STATES.includes(current.status) &&
        current.assigned_physician_user_id !== source.intended_physician_user_id
      ) {
        return reply(request, env, { error: "relationship_provider_conflict" }, 409);
      }
      const relationship = await attachRequest(env, source, current);
      return reply(request, env, { relationship: summary(relationship) }, 201);
    }

    const id = crypto.randomUUID();
    const now = v3now();
    const database = v3db(env);
    const results = await database.batch<RelationshipRow>([
      database.prepare(
        `INSERT INTO care_relationships
         (id,patient_account_id,practice_id,assigned_physician_user_id,local_patient_id,
          status,provider_display_name,specialty_name,practice_display_name,
          activated_at,terminal_at,created_at,updated_at)
         VALUES(?,?,?,?,NULL,'requested',?,?,?,NULL,NULL,?,?)
         RETURNING ${relationshipSelect()}`,
      ).bind(
        id,
        patient.patientAccountId,
        source.practice_id,
        source.intended_physician_user_id,
        source.provider_display_name,
        source.specialty_name,
        source.practice_display_name,
        now,
        now,
      ),
      database.prepare(
        `INSERT INTO care_relationship_provenance
         (id,care_relationship_id,provenance_type,referral_redemption_id,created_at)
         VALUES(? ,?,'referral_redemption',?,?)`,
      ).bind(crypto.randomUUID(), id, source.id, now),
      database.prepare(
        `UPDATE referral_redemptions SET status='converted',updated_at=?
         WHERE id=? AND patient_account_id=? AND status='pending_care_relationship'`,
      ).bind(now, source.id, patient.patientAccountId),
      database.prepare(
        `INSERT INTO care_relationship_events
         (id,care_relationship_id,practice_id,from_status,to_status,event_type,
          actor_type,actor_id,reason_code,created_at)
         VALUES(?,?,?,NULL,'requested','requested','patient',?,NULL,?)`,
      ).bind(crypto.randomUUID(), id, source.practice_id, patient.patientAccountId, now),
      database.prepare(
        `INSERT INTO audit_log
         (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
         VALUES(?,NULL,?,'care_relationship.requested','care_relationship',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        source.practice_id,
        id,
        JSON.stringify({ referralRedemptionId: source.id, patientAccountId: patient.patientAccountId }),
        now,
      ),
      database.prepare(
        `INSERT INTO patient_account_security_events
         (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
         VALUES(?,?,'patient_account.care_relationship_requested','patient',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        patient.patientAccountId,
        patient.patientAccountId,
        JSON.stringify({ careRelationshipId: id, practiceId: source.practice_id }),
        now,
      ),
    ]);
    const relationship = results[0]?.results[0];
    if (!relationship) throw new Error("relationship_insert_missing");
    return reply(request, env, { relationship: summary(relationship) }, 201);
  } catch {
    const concurrent = await relationshipFromProvenance(
      env,
      redemptionId,
      patient.patientAccountId,
    );
    return concurrent
      ? reply(request, env, { relationship: summary(concurrent) })
      : reply(request, env, { error: "relationship_request_conflict" }, 409);
  }
}

async function listPatientRelationships(request: Request, env: V3Env) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  const rows = await v3db(env).prepare(
    `SELECT ${relationshipSelect()} FROM care_relationships
     WHERE patient_account_id=? ORDER BY updated_at DESC,id DESC LIMIT 100`,
  ).bind(patient.patientAccountId).all<RelationshipRow>();
  return reply(request, env, { relationships: rows.results.map(summary) });
}

async function practiceManager(request: Request, env: V3Env) {
  const auth = await v3RequireRuntime(request, env);
  if (!auth) return null;
  return auth.user.role === "physician" || auth.user.permissions.includes("care_relationships.manage")
    ? auth
    : null;
}

async function listPracticeRelationships(request: Request, env: V3Env) {
  const auth = await practiceManager(request, env);
  if (!auth) return reply(request, env, { error: "care_relationship_management_forbidden" }, 403);
  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus && [
    "requested", "active", "paused", "ended", "revoked", "rejected",
  ].includes(requestedStatus) ? requestedStatus : null;
  if (requestedStatus && !status) {
    return reply(request, env, { error: "invalid_relationship_status" }, 400);
  }
  const rows = await v3db(env).prepare(
    `SELECT c.id,c.patient_account_id,c.practice_id,c.assigned_physician_user_id,
            c.local_patient_id,c.status,c.provider_display_name,c.specialty_name,
            c.practice_display_name,c.activated_at,c.terminal_at,c.created_at,c.updated_at,
            a.proofing_status AS patient_proofing_status,
            (SELECT i.display_mask FROM patient_account_identities i
             WHERE i.patient_account_id=c.patient_account_id AND i.is_primary=1
             ORDER BY i.created_at LIMIT 1) AS patient_identity_mask
     FROM care_relationships c
     JOIN patient_accounts a ON a.id=c.patient_account_id
     WHERE c.practice_id=? AND (? IS NULL OR c.status=?)
     ORDER BY c.updated_at DESC,c.id DESC LIMIT 100`,
  ).bind(auth.user.practiceId, status, status).all<RelationshipRow>();
  return reply(request, env, { relationships: rows.results.map(practiceSummary) });
}

async function loadPracticeRelationship(
  env: V3Env,
  relationshipId: string,
  practiceId: string,
) {
  return v3db(env).prepare(
    `SELECT c.id,c.patient_account_id,c.practice_id,c.assigned_physician_user_id,
            c.local_patient_id,c.status,c.provider_display_name,c.specialty_name,
            c.practice_display_name,c.activated_at,c.terminal_at,c.created_at,c.updated_at,
            a.proofing_status AS patient_proofing_status
     FROM care_relationships c JOIN patient_accounts a ON a.id=c.patient_account_id
     WHERE c.id=? AND c.practice_id=?`,
  ).bind(relationshipId, practiceId).first<RelationshipRow>();
}

type PhysicianTransition = "accept" | "reject" | "pause" | "resume" | "end";

const TRANSITIONS: Record<PhysicianTransition, {
  from: readonly CareRelationshipStatus[];
  to: CareRelationshipStatus;
  event: "accepted" | "rejected" | "paused" | "resumed" | "ended";
}> = {
  accept: { from: ["requested"], to: "active", event: "accepted" },
  reject: { from: ["requested"], to: "rejected", event: "rejected" },
  pause: { from: ["active"], to: "paused", event: "paused" },
  resume: { from: ["paused"], to: "active", event: "resumed" },
  end: { from: ["active", "paused"], to: "ended", event: "ended" },
};

async function physicianTransition(
  request: Request,
  env: V3Env,
  relationshipId: string,
  action: PhysicianTransition,
) {
  const auth = await v3RequireRuntime(request, env);
  if (!auth || auth.user.role !== "physician") {
    return reply(request, env, { error: "physician_authority_required" }, 403);
  }
  const physician = await v3db(env).prepare(
    `SELECT irimc_status FROM runtime_users WHERE id=? AND status='active'`,
  ).bind(auth.user.id).first<{ irimc_status: string }>();
  if (physician?.irimc_status !== "verified") {
    return reply(request, env, { error: "verified_physician_required" }, 403);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const reason = safeReason(body.reasonCode);
  if (reason === undefined) return reply(request, env, { error: "invalid_reason_code" }, 400);
  const current = await loadPracticeRelationship(env, relationshipId, auth.user.practiceId);
  if (!current) return reply(request, env, { error: "care_relationship_not_found" }, 404);
  if (current.assigned_physician_user_id !== auth.user.id) {
    return reply(request, env, { error: "assigned_physician_required" }, 403);
  }
  const transition = TRANSITIONS[action];
  if (!transition.from.includes(current.status)) {
    return reply(request, env, { error: "invalid_care_relationship_transition" }, 409);
  }
  if (action === "accept" && current.patient_proofing_status !== "verified") {
    return reply(request, env, { error: "verified_patient_identity_required" }, 409);
  }
  const now = v3now();
  const terminal = TERMINAL_STATES.includes(transition.to);
  const database = v3db(env);
  const placeholders = transition.from.map(() => "?").join(",");
  const results = await database.batch<RelationshipRow>([
    database.prepare(
      `UPDATE care_relationships
       SET status=?,activated_at=CASE WHEN ?='active' THEN COALESCE(activated_at,?) ELSE activated_at END,
           terminal_at=CASE WHEN ?=1 THEN ? ELSE NULL END,updated_at=?
       WHERE id=? AND practice_id=? AND assigned_physician_user_id=?
         AND status IN (${placeholders})
       RETURNING ${relationshipSelect()}`,
    ).bind(
      transition.to,
      transition.to,
      now,
      terminal ? 1 : 0,
      now,
      now,
      relationshipId,
      auth.user.practiceId,
      auth.user.id,
      ...transition.from,
    ),
    database.prepare(
      `INSERT INTO care_relationship_events
       (id,care_relationship_id,practice_id,from_status,to_status,event_type,
        actor_type,actor_id,reason_code,created_at)
       SELECT ?,c.id,c.practice_id,?,?,?,'runtime_user',?,?,?
       FROM care_relationships c WHERE c.id=? AND c.practice_id=?
         AND c.status=? AND c.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      current.status,
      transition.to,
      transition.event,
      auth.user.id,
      reason,
      now,
      relationshipId,
      auth.user.practiceId,
      transition.to,
      now,
    ),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,?,? ,?,'care_relationship',c.id,?,?
       FROM care_relationships c WHERE c.id=? AND c.practice_id=?
         AND c.status=? AND c.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      auth.user.id,
      auth.user.practiceId,
      `care_relationship.${transition.event}`,
      JSON.stringify({ from: current.status, to: transition.to, reasonCode: reason }),
      now,
      relationshipId,
      auth.user.practiceId,
      transition.to,
      now,
    ),
  ]);
  const updated = results[0]?.results[0];
  return updated
    ? reply(request, env, { relationship: practiceSummary({ ...updated, patient_proofing_status: current.patient_proofing_status }) })
    : reply(request, env, { error: "care_relationship_update_conflict" }, 409);
}

async function patientRevoke(request: Request, env: V3Env, relationshipId: string) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  if (!(await consumePatientRate(env, patient.patientAccountId))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const reason = safeReason(body.reasonCode);
  if (reason === undefined) return reply(request, env, { error: "invalid_reason_code" }, 400);
  const current = await v3db(env).prepare(
    `SELECT ${relationshipSelect()} FROM care_relationships
     WHERE id=? AND patient_account_id=?`,
  ).bind(relationshipId, patient.patientAccountId).first<RelationshipRow>();
  if (!current) return reply(request, env, { error: "care_relationship_not_found" }, 404);
  if (!ACTIVE_STATES.includes(current.status)) {
    return reply(request, env, { error: "invalid_care_relationship_transition" }, 409);
  }
  const now = v3now();
  const database = v3db(env);
  const results = await database.batch<RelationshipRow>([
    database.prepare(
      `UPDATE care_relationships SET status='revoked',terminal_at=?,updated_at=?
       WHERE id=? AND patient_account_id=? AND status IN ('requested','active','paused')
       RETURNING ${relationshipSelect()}`,
    ).bind(now, now, relationshipId, patient.patientAccountId),
    database.prepare(
      `INSERT INTO care_relationship_events
       (id,care_relationship_id,practice_id,from_status,to_status,event_type,
        actor_type,actor_id,reason_code,created_at)
       SELECT ?,c.id,c.practice_id,?,'revoked','revoked','patient',?,?,?
       FROM care_relationships c WHERE c.id=? AND c.patient_account_id=?
         AND c.status='revoked' AND c.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      current.status,
      patient.patientAccountId,
      reason,
      now,
      relationshipId,
      patient.patientAccountId,
      now,
    ),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,NULL,c.practice_id,'care_relationship.revoked','care_relationship',c.id,?,?
       FROM care_relationships c WHERE c.id=? AND c.patient_account_id=?
         AND c.status='revoked' AND c.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      JSON.stringify({ actor: "patient", reasonCode: reason }),
      now,
      relationshipId,
      patient.patientAccountId,
      now,
    ),
    database.prepare(
      `INSERT INTO patient_account_security_events
       (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
       SELECT ?,?,'patient_account.care_relationship_revoked','patient',?,?,?
       FROM care_relationships c WHERE c.id=? AND c.patient_account_id=?
         AND c.status='revoked' AND c.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      patient.patientAccountId,
      patient.patientAccountId,
      JSON.stringify({ careRelationshipId: relationshipId, practiceId: current.practice_id }),
      now,
      relationshipId,
      patient.patientAccountId,
      now,
    ),
  ]);
  const updated = results[0]?.results[0];
  return updated
    ? reply(request, env, { relationship: summary(updated) })
    : reply(request, env, { error: "care_relationship_update_conflict" }, 409);
}

async function localRecordMutation(
  request: Request,
  env: V3Env,
  relationshipId: string,
  unlink: boolean,
) {
  const auth = await practiceManager(request, env);
  const canManageRecord = auth && (
    auth.user.role === "physician" || (
      auth.user.permissions.includes("handoff.read") &&
      auth.user.permissions.includes("handoff.write")
    )
  );
  if (!auth || !canManageRecord) {
    return reply(request, env, { error: "local_record_link_forbidden" }, 403);
  }
  if (!unlink && !enabled(env.PATIENT_RECORD_LINKING_ENABLED)) {
    return reply(request, env, { error: "patient_record_linking_disabled" }, 403);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const current = await loadPracticeRelationship(env, relationshipId, auth.user.practiceId);
  if (!current) return reply(request, env, { error: "care_relationship_not_found" }, 404);
  if (!unlink && (current.status !== "active" || current.patient_proofing_status !== "verified")) {
    return reply(request, env, { error: "active_verified_relationship_required" }, 409);
  }
  if (unlink && !current.local_patient_id) {
    return reply(request, env, { relationship: practiceSummary(current) });
  }
  const patientId = unlink ? null : safeId(body.patientId);
  if (!unlink && !patientId) return reply(request, env, { error: "verified_local_record_required" }, 404);
  if (!unlink) {
    const verified = await v3db(env).prepare(
      `SELECT p.id
       FROM patient_registry p
       JOIN portal_users u ON u.patient_id=p.id AND u.practice_id=p.practice_id
       JOIN portal_user_account_links l ON l.portal_user_id=u.id
       WHERE p.id=? AND p.practice_id=? AND p.status='active' AND u.status='active'
         AND l.patient_account_id=? AND l.link_status='verified'`,
    ).bind(patientId, auth.user.practiceId, current.patient_account_id).first<{ id: string }>();
    if (!verified) return reply(request, env, { error: "verified_local_record_required" }, 404);
  }
  const now = v3now();
  const event = unlink ? "local_record_unlinked" : "local_record_linked";
  const updateGuard = unlink ? "local_patient_id IS NOT NULL" : "status='active'";
  const database = v3db(env);
  const results = await database.batch<RelationshipRow>([
    database.prepare(
      `UPDATE care_relationships SET local_patient_id=?,updated_at=?
       WHERE id=? AND practice_id=? AND ${updateGuard}
       RETURNING ${relationshipSelect()}`,
    ).bind(patientId, now, relationshipId, auth.user.practiceId),
    database.prepare(
      `INSERT INTO care_relationship_events
       (id,care_relationship_id,practice_id,from_status,to_status,event_type,
        actor_type,actor_id,reason_code,created_at)
       SELECT ?,c.id,c.practice_id,?,?,?,'runtime_user',?,NULL,?
       FROM care_relationships c WHERE c.id=? AND c.practice_id=?
         AND c.status=? AND c.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      current.status,
      current.status,
      event,
      auth.user.id,
      now,
      relationshipId,
      auth.user.practiceId,
      current.status,
      now,
    ),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,?,?,?,'care_relationship',c.id,?,?
       FROM care_relationships c WHERE c.id=? AND c.practice_id=?
         AND c.status=? AND c.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      auth.user.id,
      auth.user.practiceId,
      `care_relationship.${event}`,
      JSON.stringify({ localPatientId: patientId }),
      now,
      relationshipId,
      auth.user.practiceId,
      current.status,
      now,
    ),
  ]);
  const updated = results[0]?.results[0];
  return updated
    ? reply(request, env, { relationship: practiceSummary({ ...updated, patient_proofing_status: current.patient_proofing_status }) })
    : reply(request, env, { error: "care_relationship_update_conflict" }, 409);
}

export async function careRelationshipRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/care-relationships" && !url.pathname.startsWith("/v1/care-relationships/")) {
    return null;
  }
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (url.pathname === "/v1/care-relationships/capabilities" && request.method === "GET") {
    const careRelationships = enabled(env.CARE_RELATIONSHIPS_ENABLED) &&
      enabled(env.PATIENT_IDENTITY_V2_ENABLED);
    return reply(request, env, {
      careRelationships,
      localRecordLinking: careRelationships && enabled(env.PATIENT_RECORD_LINKING_ENABLED),
      clinicalAuthorization: false,
    });
  }
  if (!enabled(env.CARE_RELATIONSHIPS_ENABLED) || !enabled(env.PATIENT_IDENTITY_V2_ENABLED)) {
    return reply(request, env, { error: "care_relationships_disabled" }, 403);
  }
  if (url.pathname === "/v1/care-relationships/patient" && request.method === "GET") {
    return listPatientRelationships(request, env);
  }
  if (url.pathname === "/v1/care-relationships/requests" && request.method === "POST") {
    return requestRelationship(request, env);
  }
  if (url.pathname === "/v1/care-relationships/practice" && request.method === "GET") {
    return listPracticeRelationships(request, env);
  }
  const transition = url.pathname.match(
    /^\/v1\/care-relationships\/([^/]+)\/(accept|reject|pause|resume|end)$/,
  );
  if (transition && request.method === "POST") {
    const id = safeId(transition[1]);
    if (!id) return reply(request, env, { error: "invalid_care_relationship_id" }, 400);
    return physicianTransition(request, env, id, transition[2] as PhysicianTransition);
  }
  const patientRevokeMatch = url.pathname.match(
    /^\/v1\/care-relationships\/([^/]+)\/patient-revoke$/,
  );
  if (patientRevokeMatch && request.method === "POST") {
    const id = safeId(patientRevokeMatch[1]);
    if (!id) return reply(request, env, { error: "invalid_care_relationship_id" }, 400);
    return patientRevoke(request, env, id);
  }
  const localRecord = url.pathname.match(
    /^\/v1\/care-relationships\/([^/]+)\/(link-local-record|unlink-local-record)$/,
  );
  if (localRecord && request.method === "POST") {
    const id = safeId(localRecord[1]);
    if (!id) return reply(request, env, { error: "invalid_care_relationship_id" }, 400);
    return localRecordMutation(request, env, id, localRecord[2] === "unlink-local-record");
  }
  return reply(request, env, { error: "not_found" }, 404);
}
