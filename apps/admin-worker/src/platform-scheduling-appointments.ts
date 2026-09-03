import {
  type AppointmentStatus,
  type ManagedAppointment,
  type SchedulingConfirmationPolicy,
  type SchedulingVisitMode,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { requirePatientAccountSession } from "./platform-patient-identity";
import { appointmentBookingEnabled } from "./platform-scheduling-slots";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";
import { hmacHex } from "./runtime-security";

type AppointmentRow = {
  id: string;
  provider_profile_id: string;
  practice_id: string;
  physician_user_id: string;
  patient_account_id: string;
  care_relationship_id: string;
  rescheduled_from_appointment_id: string | null;
  replacement_appointment_id: string | null;
  starts_at: string;
  ends_at: string;
  visit_mode: SchedulingVisitMode;
  confirmation_policy: SchedulingConfirmationPolicy;
  policy_revision: number;
  status: AppointmentStatus;
  version: number;
  fee_amount_minor: number | null;
  currency_code: string | null;
  pricing_policy_version: string | null;
  payment_required: number;
  payment_state: "not_required" | "pending" | "authorized" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";
  captured_at: string;
  created_at: string;
  updated_at: string;
};

type AppointmentStateRow = AppointmentRow & {
  cancellation_notice_minutes: number;
  reschedule_notice_minutes: number;
};

type BookingHoldRow = {
  id: string;
  scheduling_policy_id: string;
  practice_id: string;
  physician_user_id: string;
  patient_account_id: string;
  care_relationship_id: string;
  starts_at: string;
  ends_at: string;
  lock_starts_at: string;
  lock_ends_at: string;
  visit_mode: SchedulingVisitMode;
  policy_revision: number;
  confirmation_policy: SchedulingConfirmationPolicy;
};

type PatientActor = {
  kind: "patient";
  id: string;
  proofingStatus: string;
};

type RuntimeActor = {
  kind: "runtime_user";
  id: string;
  practiceId: string;
  role: "physician" | "assistant";
  permissions: readonly string[];
};

type AppointmentActor = PatientActor | RuntimeActor;
type StaffTransition = "confirm" | "start" | "complete" | "no-show";

const PATIENT_RATE_WINDOW_MS = 15 * 60 * 1000;

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
      "x-content-type-options": "nosniff",
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
  const reason = String(value).trim().toLowerCase();
  return reason.length <= 80 && /^[a-z0-9][a-z0-9_.-]*$/.test(reason) ? reason : undefined;
}

function appointmentSelect(alias = "a") {
  return `${alias}.id,p.id AS provider_profile_id,${alias}.practice_id,
    ${alias}.physician_user_id,${alias}.patient_account_id,${alias}.care_relationship_id,
    ${alias}.rescheduled_from_appointment_id,
    (SELECT next.id FROM appointments next WHERE next.rescheduled_from_appointment_id=${alias}.id)
      AS replacement_appointment_id,
    ${alias}.starts_at,${alias}.ends_at,${alias}.visit_mode,${alias}.confirmation_policy,
    ${alias}.policy_revision,${alias}.status,${alias}.version,
    f.fee_amount_minor,f.currency_code,f.pricing_policy_version,f.payment_required,
    f.payment_state,f.captured_at,${alias}.created_at,${alias}.updated_at`;
}

function managed(row: AppointmentRow): ManagedAppointment {
  return {
    id: row.id,
    providerProfileId: row.provider_profile_id,
    practiceId: row.practice_id,
    physicianUserId: row.physician_user_id,
    patientAccountId: row.patient_account_id,
    careRelationshipId: row.care_relationship_id,
    rescheduledFromAppointmentId: row.rescheduled_from_appointment_id ?? undefined,
    replacementAppointmentId: row.replacement_appointment_id ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    visitMode: row.visit_mode,
    confirmationPolicy: row.confirmation_policy,
    policyRevision: row.policy_revision,
    status: row.status,
    version: row.version,
    financialSnapshot: {
      feeAmountMinor: row.fee_amount_minor ?? undefined,
      currency: row.currency_code ?? undefined,
      pricingPolicyVersion: row.pricing_policy_version ?? undefined,
      paymentRequired: row.payment_required === 1,
      paymentState: row.payment_state,
      capturedAt: row.captured_at,
    },
    grantsClinicalAccess: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function consumePatientRate(env: V3Env, patientAccountId: string) {
  const key = await hmacHex(env.SESSION_SECRET, `appointment-rate:${patientAccountId}`);
  const now = v3now();
  const cutoff = new Date(Date.now() - PATIENT_RATE_WINDOW_MS).toISOString();
  const row = await v3db(env).prepare(
    `INSERT INTO auth_rate_limits(key,window_started_at,count) VALUES(?,?,1)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN auth_rate_limits.window_started_at<? THEN 1 ELSE auth_rate_limits.count+1 END,
       window_started_at=CASE WHEN auth_rate_limits.window_started_at<? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END
     RETURNING count`,
  ).bind(key, now, cutoff, cutoff).first<{ count: number }>();
  return Boolean(row && row.count <= 30);
}

async function requireActor(request: Request, env: V3Env): Promise<AppointmentActor | null> {
  const patient = await requirePatientAccountSession(request, env);
  if (patient) {
    return {
      kind: "patient",
      id: patient.patientAccountId,
      proofingStatus: patient.proofingStatus,
    };
  }
  const runtime = await v3RequireRuntime(request, env);
  return runtime
    ? {
        kind: "runtime_user",
        id: runtime.user.id,
        practiceId: runtime.user.practiceId,
        role: runtime.user.role,
        permissions: runtime.user.permissions,
      }
    : null;
}

function canManage(actor: RuntimeActor, appointment: AppointmentRow) {
  return actor.practiceId === appointment.practice_id && (
    (actor.role === "physician" && actor.id === appointment.physician_user_id) ||
    (actor.role === "assistant" && actor.permissions.includes("appointments.manage"))
  );
}

async function appointmentById(env: V3Env, appointmentId: string) {
  return v3db(env).prepare(
    `SELECT ${appointmentSelect()},s.cancellation_notice_minutes,s.reschedule_notice_minutes
     FROM appointments a
     JOIN provider_scheduling_policies s ON s.id=a.scheduling_policy_id
     JOIN provider_profiles p
       ON p.practice_id=a.practice_id AND p.physician_user_id=a.physician_user_id
     JOIN appointment_financial_snapshots f ON f.appointment_id=a.id
     WHERE a.id=?`,
  ).bind(appointmentId).first<AppointmentStateRow>();
}

async function bookingHold(
  env: V3Env,
  holdId: string,
  patientAccountId: string,
  now: string,
) {
  return v3db(env).prepare(
    `SELECT h.id,h.scheduling_policy_id,h.practice_id,h.physician_user_id,
            h.patient_account_id,h.care_relationship_id,h.starts_at,h.ends_at,
            h.lock_starts_at,h.lock_ends_at,h.visit_mode,h.policy_revision,
            s.confirmation_policy
     FROM appointment_slot_holds h
     JOIN provider_scheduling_policies s ON s.id=h.scheduling_policy_id
     JOIN care_relationships c ON c.id=h.care_relationship_id
     WHERE h.id=? AND h.patient_account_id=? AND h.status='held' AND h.expires_at>?
       AND s.status='published' AND c.status='active'
       AND c.patient_account_id=h.patient_account_id AND c.practice_id=h.practice_id
       AND c.assigned_physician_user_id=h.physician_user_id`,
  ).bind(holdId, patientAccountId, now).first<BookingHoldRow>();
}

async function bookAppointment(request: Request, env: V3Env) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  if (patient.proofingStatus !== "verified") {
    return reply(request, env, { error: "patient_proofing_required" }, 403);
  }
  if (!(await consumePatientRate(env, patient.patientAccountId))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const holdId = safeId(body.slotHoldId);
  if (!holdId) return reply(request, env, { error: "invalid_slot_hold_id" }, 400);
  const now = v3now();
  const hold = await bookingHold(env, holdId, patient.patientAccountId, now);
  if (!hold) return reply(request, env, { error: "slot_hold_not_bookable" }, 409);
  const appointmentId = crypto.randomUUID();
  const status: AppointmentStatus = hold.confirmation_policy === "auto_confirm"
    ? "confirmed"
    : "requested";
  const database = v3db(env);
  try {
    const results = await database.batch<AppointmentRow>([
      database.prepare(
        `INSERT INTO appointments
         (id,scheduling_policy_id,slot_hold_id,practice_id,physician_user_id,
          patient_account_id,care_relationship_id,rescheduled_from_appointment_id,
          starts_at,ends_at,lock_starts_at,lock_ends_at,visit_mode,
          confirmation_policy,policy_revision,status,version,requested_at,
          confirmed_at,cancelled_at,rescheduled_at,checked_in_at,started_at,
          completed_at,no_show_at,created_at,updated_at)
         SELECT ?,h.scheduling_policy_id,h.id,h.practice_id,h.physician_user_id,
                h.patient_account_id,h.care_relationship_id,NULL,h.starts_at,h.ends_at,
                h.lock_starts_at,h.lock_ends_at,h.visit_mode,?,h.policy_revision,?,1,?,
                ?,NULL,NULL,NULL,NULL,NULL,NULL,?,?
         FROM appointment_slot_holds h
         WHERE h.id=? AND h.patient_account_id=? AND h.status='held' AND h.expires_at>?
           AND NOT EXISTS(
             SELECT 1 FROM appointments a
             WHERE a.physician_user_id=h.physician_user_id
               AND a.status IN ('requested','confirmed','checked_in','in_progress')
               AND a.lock_starts_at<h.lock_ends_at AND a.lock_ends_at>h.lock_starts_at
           ) RETURNING *`,
      ).bind(
        appointmentId, hold.confirmation_policy, status, now,
        status === "confirmed" ? now : null, now, now,
        holdId, patient.patientAccountId, now,
      ),
      database.prepare(
        `UPDATE appointment_slot_holds SET status='consumed',consumed_at=?,updated_at=?
         WHERE id=? AND status='held'
           AND EXISTS(SELECT 1 FROM appointments WHERE id=? AND slot_hold_id=?)`,
      ).bind(now, now, holdId, appointmentId, holdId),
      database.prepare(
        `INSERT INTO appointment_financial_snapshots
         (appointment_id,fee_amount_minor,currency_code,pricing_policy_version,
          payment_required,payment_state,captured_at)
         SELECT id,NULL,NULL,NULL,0,'not_required',? FROM appointments WHERE id=?`,
      ).bind(now, appointmentId),
      database.prepare(
        `INSERT INTO appointment_participants
         (id,appointment_id,participant_type,patient_account_id,runtime_user_id,
          participant_role,created_at)
         SELECT ?,id,'patient',patient_account_id,NULL,'patient',?
         FROM appointments WHERE id=?`,
      ).bind(crypto.randomUUID(), now, appointmentId),
      database.prepare(
        `INSERT INTO appointment_participants
         (id,appointment_id,participant_type,patient_account_id,runtime_user_id,
          participant_role,created_at)
         SELECT ?,id,'runtime_user',NULL,physician_user_id,'physician',?
         FROM appointments WHERE id=?`,
      ).bind(crypto.randomUUID(), now, appointmentId),
      database.prepare(
        `INSERT INTO appointment_events
         (id,appointment_id,practice_id,from_status,to_status,event_type,actor_type,
          actor_id,reason_code,replacement_appointment_id,created_at)
         SELECT ?,id,practice_id,NULL,status,?,'patient',patient_account_id,NULL,NULL,?
         FROM appointments WHERE id=?`,
      ).bind(crypto.randomUUID(), status === "confirmed" ? "confirmed" : "requested", now, appointmentId),
      database.prepare(
        `INSERT INTO appointment_slot_hold_events
         (id,slot_hold_id,practice_id,event_type,actor_type,actor_id,created_at)
         SELECT ?,id,practice_id,'consumed','patient',patient_account_id,?
         FROM appointment_slot_holds WHERE id=? AND status='consumed' AND consumed_at=?`,
      ).bind(crypto.randomUUID(), now, holdId, now),
      database.prepare(
        `INSERT INTO patient_account_security_events
         (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
         SELECT ?,patient_account_id,'appointment.booked','patient',patient_account_id,
                json_object('appointmentId',id,'practiceId',practice_id,'status',status),?
         FROM appointments WHERE id=?`,
      ).bind(crypto.randomUUID(), now, appointmentId),
    ]);
    if (!results[0]?.results[0]) {
      return reply(request, env, { error: "appointment_booking_conflict" }, 409);
    }
    const created = await appointmentById(env, appointmentId);
    return created
      ? reply(request, env, { appointment: managed(created) }, 201)
      : reply(request, env, { error: "appointment_booking_failed" }, 500);
  } catch {
    return reply(request, env, { error: "appointment_booking_conflict" }, 409);
  }
}

async function listPatientAppointments(request: Request, env: V3Env) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  const rows = await v3db(env).prepare(
    `SELECT ${appointmentSelect()}
     FROM appointments a
     JOIN provider_profiles p
       ON p.practice_id=a.practice_id AND p.physician_user_id=a.physician_user_id
     JOIN appointment_financial_snapshots f ON f.appointment_id=a.id
     WHERE a.patient_account_id=? ORDER BY a.starts_at DESC,a.id DESC LIMIT 200`,
  ).bind(patient.patientAccountId).all<AppointmentRow>();
  return reply(request, env, { appointments: rows.results.map(managed) });
}

async function listPracticeAppointments(request: Request, env: V3Env) {
  const runtime = await v3RequireRuntime(request, env);
  if (!runtime) return reply(request, env, { error: "runtime_auth_required" }, 401);
  const canList = runtime.user.role === "physician" ||
    runtime.user.permissions.includes("appointments.manage");
  if (!canList) return reply(request, env, { error: "appointment_management_required" }, 403);
  const rows = await v3db(env).prepare(
    `SELECT ${appointmentSelect()}
     FROM appointments a
     JOIN provider_profiles p
       ON p.practice_id=a.practice_id AND p.physician_user_id=a.physician_user_id
     JOIN appointment_financial_snapshots f ON f.appointment_id=a.id
     WHERE a.practice_id=?
       AND (?='assistant' OR a.physician_user_id=?)
     ORDER BY a.starts_at DESC,a.id DESC LIMIT 200`,
  ).bind(runtime.user.practiceId, runtime.user.role, runtime.user.id).all<AppointmentRow>();
  return reply(request, env, { appointments: rows.results.map(managed) });
}

async function transitionAppointment(
  request: Request,
  env: V3Env,
  appointmentId: string,
  action: "cancel" | "check-in" | StaffTransition,
) {
  const actor = await requireActor(request, env);
  if (!actor) return reply(request, env, { error: "appointment_auth_required" }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const reason = safeReason(body.reasonCode);
  if (reason === undefined) return reply(request, env, { error: "invalid_reason_code" }, 400);
  const current = await appointmentById(env, appointmentId);
  if (!current) return reply(request, env, { error: "appointment_not_found" }, 404);

  let nextStatus: AppointmentStatus;
  let eventType: "confirmed" | "cancelled" | "checked_in" | "started" | "completed" | "no_show";
  let allowedFrom: readonly AppointmentStatus[];
  if (action === "cancel") {
    nextStatus = "cancelled";
    eventType = "cancelled";
    allowedFrom = actor.kind === "patient"
      ? ["requested", "confirmed"]
      : ["requested", "confirmed", "checked_in"];
  } else if (action === "check-in") {
    nextStatus = "checked_in";
    eventType = "checked_in";
    allowedFrom = ["confirmed"];
  } else if (action === "confirm") {
    nextStatus = "confirmed";
    eventType = "confirmed";
    allowedFrom = ["requested"];
  } else if (action === "start") {
    nextStatus = "in_progress";
    eventType = "started";
    allowedFrom = ["confirmed", "checked_in"];
  } else if (action === "complete") {
    nextStatus = "completed";
    eventType = "completed";
    allowedFrom = ["in_progress"];
  } else {
    nextStatus = "no_show";
    eventType = "no_show";
    allowedFrom = ["confirmed", "checked_in"];
  }

  if (!allowedFrom.includes(current.status)) {
    return reply(request, env, { error: "invalid_appointment_transition" }, 409);
  }
  if (actor.kind === "patient") {
    if (current.patient_account_id !== actor.id) {
      return reply(request, env, { error: "appointment_not_found" }, 404);
    }
    if (!(await consumePatientRate(env, actor.id))) {
      return reply(request, env, { error: "rate_limited" }, 429);
    }
    if (action !== "cancel" && action !== "check-in") {
      return reply(request, env, { error: "appointment_management_required" }, 403);
    }
    if (action === "cancel" &&
      Date.parse(current.starts_at) - Date.now() < current.cancellation_notice_minutes * 60_000) {
      return reply(request, env, { error: "cancellation_notice_elapsed" }, 409);
    }
    if (action === "check-in" &&
      (Date.now() < Date.parse(current.starts_at) - 30 * 60_000 || Date.now() >= Date.parse(current.ends_at))) {
      return reply(request, env, { error: "appointment_check_in_window_closed" }, 409);
    }
  } else {
    if (!canManage(actor, current)) {
      return reply(request, env, { error: "appointment_management_required" }, 403);
    }
    if ((action === "start" || action === "complete") &&
      (actor.role !== "physician" || actor.id !== current.physician_user_id)) {
      return reply(request, env, { error: "assigned_physician_required" }, 403);
    }
    if (action === "check-in") {
      return reply(request, env, { error: "patient_check_in_required" }, 403);
    }
    if (action === "no-show" && Date.now() < Date.parse(current.starts_at)) {
      return reply(request, env, { error: "appointment_not_started" }, 409);
    }
  }

  const now = v3now();
  const timestampColumn = nextStatus === "confirmed" ? "confirmed_at"
    : nextStatus === "cancelled" ? "cancelled_at"
      : nextStatus === "checked_in" ? "checked_in_at"
        : nextStatus === "in_progress" ? "started_at"
          : nextStatus === "completed" ? "completed_at"
            : "no_show_at";
  const database = v3db(env);
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `UPDATE appointments SET status=?,${timestampColumn}=?,version=version+1,updated_at=?
       WHERE id=? AND status=? AND version=?`,
    ).bind(nextStatus, now, now, appointmentId, current.status, current.version),
    database.prepare(
      `INSERT INTO appointment_events
       (id,appointment_id,practice_id,from_status,to_status,event_type,actor_type,
        actor_id,reason_code,replacement_appointment_id,created_at)
       SELECT ?,id,practice_id,?,?,?,?,?, ?,NULL,?
       FROM appointments WHERE id=? AND status=? AND version=? AND updated_at=?`,
    ).bind(
      crypto.randomUUID(), current.status, nextStatus, eventType, actor.kind,
      actor.id, reason, now, appointmentId, nextStatus, current.version + 1, now,
    ),
  ];
  if (actor.kind === "runtime_user") {
    statements.push(database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,?,practice_id,?,'appointment',id,?,?
       FROM appointments WHERE id=? AND status=? AND version=? AND updated_at=?`,
    ).bind(
      crypto.randomUUID(), actor.id, `appointment.${eventType}`,
      JSON.stringify({ from: current.status, to: nextStatus, reasonCode: reason }),
      now, appointmentId, nextStatus, current.version + 1, now,
    ));
  } else {
    statements.push(database.prepare(
      `INSERT INTO patient_account_security_events
       (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
       SELECT ?,patient_account_id,?,'patient',patient_account_id,
              json_object('appointmentId',id,'fromStatus',?,'toStatus',?),?
       FROM appointments WHERE id=? AND status=? AND version=? AND updated_at=?`,
    ).bind(
      crypto.randomUUID(), `appointment.${eventType}`, current.status, nextStatus,
      now, appointmentId, nextStatus, current.version + 1, now,
    ));
  }
  const results = await database.batch(statements);
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    return reply(request, env, { error: "appointment_update_conflict" }, 409);
  }
  const updated = await appointmentById(env, appointmentId);
  return updated
    ? reply(request, env, { appointment: managed(updated) })
    : reply(request, env, { error: "appointment_update_failed" }, 500);
}

async function rescheduleAppointment(request: Request, env: V3Env, appointmentId: string) {
  const actor = await requireActor(request, env);
  if (!actor) return reply(request, env, { error: "appointment_auth_required" }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const holdId = safeId(body.slotHoldId);
  const reason = safeReason(body.reasonCode);
  if (!holdId) return reply(request, env, { error: "invalid_slot_hold_id" }, 400);
  if (reason === undefined) return reply(request, env, { error: "invalid_reason_code" }, 400);
  const current = await appointmentById(env, appointmentId);
  if (!current) return reply(request, env, { error: "appointment_not_found" }, 404);
  if (!["requested", "confirmed"].includes(current.status)) {
    return reply(request, env, { error: "invalid_appointment_transition" }, 409);
  }
  if (actor.kind === "patient") {
    if (current.patient_account_id !== actor.id) {
      return reply(request, env, { error: "appointment_not_found" }, 404);
    }
    if (!(await consumePatientRate(env, actor.id))) {
      return reply(request, env, { error: "rate_limited" }, 429);
    }
    if (Date.parse(current.starts_at) - Date.now() < current.reschedule_notice_minutes * 60_000) {
      return reply(request, env, { error: "reschedule_notice_elapsed" }, 409);
    }
  } else if (!canManage(actor, current)) {
    return reply(request, env, { error: "appointment_management_required" }, 403);
  }
  const now = v3now();
  const hold = await bookingHold(env, holdId, current.patient_account_id, now);
  if (!hold || hold.practice_id !== current.practice_id ||
    hold.physician_user_id !== current.physician_user_id ||
    hold.care_relationship_id !== current.care_relationship_id ||
    hold.starts_at === current.starts_at) {
    return reply(request, env, { error: "replacement_slot_hold_not_bookable" }, 409);
  }
  const replacementId = crypto.randomUUID();
  const replacementStatus: AppointmentStatus = hold.confirmation_policy === "auto_confirm"
    ? "confirmed"
    : "requested";
  const database = v3db(env);
  try {
    const results = await database.batch<AppointmentRow>([
      database.prepare(
        `INSERT INTO appointments
         (id,scheduling_policy_id,slot_hold_id,practice_id,physician_user_id,
          patient_account_id,care_relationship_id,rescheduled_from_appointment_id,
          starts_at,ends_at,lock_starts_at,lock_ends_at,visit_mode,
          confirmation_policy,policy_revision,status,version,requested_at,
          confirmed_at,cancelled_at,rescheduled_at,checked_in_at,started_at,
          completed_at,no_show_at,created_at,updated_at)
         SELECT ?,h.scheduling_policy_id,h.id,h.practice_id,h.physician_user_id,
                h.patient_account_id,h.care_relationship_id,old.id,h.starts_at,h.ends_at,
                h.lock_starts_at,h.lock_ends_at,h.visit_mode,?,h.policy_revision,?,1,?,
                ?,NULL,NULL,NULL,NULL,NULL,NULL,?,?
         FROM appointment_slot_holds h JOIN appointments old ON old.id=?
         WHERE h.id=? AND h.patient_account_id=old.patient_account_id
           AND h.practice_id=old.practice_id AND h.physician_user_id=old.physician_user_id
           AND h.care_relationship_id=old.care_relationship_id
           AND h.status='held' AND h.expires_at>? AND h.starts_at<>old.starts_at
           AND old.status=? AND old.version=?
           AND NOT EXISTS(
             SELECT 1 FROM appointments conflict
             WHERE conflict.id<>old.id AND conflict.physician_user_id=h.physician_user_id
               AND conflict.status IN ('requested','confirmed','checked_in','in_progress')
               AND conflict.lock_starts_at<h.lock_ends_at
               AND conflict.lock_ends_at>h.lock_starts_at
           ) RETURNING *`,
      ).bind(
        replacementId, hold.confirmation_policy, replacementStatus, now,
        replacementStatus === "confirmed" ? now : null, now, now,
        appointmentId, holdId, now, current.status, current.version,
      ),
      database.prepare(
        `UPDATE appointments SET status='rescheduled',rescheduled_at=?,version=version+1,updated_at=?
         WHERE id=? AND status=? AND version=?
           AND EXISTS(SELECT 1 FROM appointments WHERE id=? AND rescheduled_from_appointment_id=?)`,
      ).bind(now, now, appointmentId, current.status, current.version, replacementId, appointmentId),
      database.prepare(
        `UPDATE appointment_slot_holds SET status='consumed',consumed_at=?,updated_at=?
         WHERE id=? AND status='held'
           AND EXISTS(SELECT 1 FROM appointments WHERE id=? AND slot_hold_id=?)`,
      ).bind(now, now, holdId, replacementId, holdId),
      database.prepare(
        `INSERT INTO appointment_financial_snapshots
         (appointment_id,fee_amount_minor,currency_code,pricing_policy_version,
          payment_required,payment_state,captured_at)
         SELECT ?,fee_amount_minor,currency_code,pricing_policy_version,
                payment_required,payment_state,?
         FROM appointment_financial_snapshots WHERE appointment_id=?
           AND EXISTS(SELECT 1 FROM appointments WHERE id=?)`,
      ).bind(replacementId, now, appointmentId, replacementId),
      database.prepare(
        `INSERT INTO appointment_participants
         (id,appointment_id,participant_type,patient_account_id,runtime_user_id,
          participant_role,created_at)
         SELECT ?,id,'patient',patient_account_id,NULL,'patient',?
         FROM appointments WHERE id=?`,
      ).bind(crypto.randomUUID(), now, replacementId),
      database.prepare(
        `INSERT INTO appointment_participants
         (id,appointment_id,participant_type,patient_account_id,runtime_user_id,
          participant_role,created_at)
         SELECT ?,id,'runtime_user',NULL,physician_user_id,'physician',?
         FROM appointments WHERE id=?`,
      ).bind(crypto.randomUUID(), now, replacementId),
      database.prepare(
        `INSERT INTO appointment_events
         (id,appointment_id,practice_id,from_status,to_status,event_type,actor_type,
          actor_id,reason_code,replacement_appointment_id,created_at)
         SELECT ?,id,practice_id,?,'rescheduled','rescheduled',?,?,?,?,?
         FROM appointments WHERE id=? AND status='rescheduled' AND version=?`,
      ).bind(
        crypto.randomUUID(), current.status, actor.kind, actor.id, reason,
        replacementId, now, appointmentId, current.version + 1,
      ),
      database.prepare(
        `INSERT INTO appointment_events
         (id,appointment_id,practice_id,from_status,to_status,event_type,actor_type,
          actor_id,reason_code,replacement_appointment_id,created_at)
         SELECT ?,id,practice_id,NULL,status,? ,?,?,NULL,NULL,?
         FROM appointments WHERE id=?`,
      ).bind(
        crypto.randomUUID(), replacementStatus === "confirmed" ? "confirmed" : "requested",
        actor.kind, actor.id, now, replacementId,
      ),
      database.prepare(
        `INSERT INTO appointment_slot_hold_events
         (id,slot_hold_id,practice_id,event_type,actor_type,actor_id,created_at)
         SELECT ?,id,practice_id,'consumed',?,?,?
         FROM appointment_slot_holds WHERE id=? AND status='consumed' AND consumed_at=?`,
      ).bind(crypto.randomUUID(), actor.kind, actor.id, now, holdId, now),
    ]);
    if (!results[0]?.results[0] || (results[1]?.meta.changes ?? 0) !== 1) {
      return reply(request, env, { error: "appointment_reschedule_conflict" }, 409);
    }
    if (actor.kind === "runtime_user") {
      await database.prepare(
        `INSERT INTO audit_log
         (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
         VALUES(?,?,?,'appointment.rescheduled','appointment',?,?,?)`,
      ).bind(
        crypto.randomUUID(), actor.id, current.practice_id, appointmentId,
        JSON.stringify({ replacementAppointmentId: replacementId, reasonCode: reason }), now,
      ).run();
    } else {
      await database.prepare(
        `INSERT INTO patient_account_security_events
         (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
         VALUES(?,?,'appointment.rescheduled','patient',?,?,?)`,
      ).bind(
        crypto.randomUUID(), actor.id, actor.id,
        JSON.stringify({ appointmentId, replacementAppointmentId: replacementId }), now,
      ).run();
    }
    const replacement = await appointmentById(env, replacementId);
    return replacement
      ? reply(request, env, { appointment: managed(replacement) }, 201)
      : reply(request, env, { error: "appointment_reschedule_failed" }, 500);
  } catch {
    return reply(request, env, { error: "appointment_reschedule_conflict" }, 409);
  }
}

export async function schedulingAppointmentsRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const collection = url.pathname === "/v1/scheduling/appointments";
  const patientAction = url.pathname.match(
    /^\/v1\/scheduling\/appointments\/([^/]+)\/(cancel|reschedule|check-in)$/,
  );
  const practiceCollection = url.pathname === "/v1/scheduling/manage/appointments";
  const staffAction = url.pathname.match(
    /^\/v1\/scheduling\/manage\/appointments\/([^/]+)\/(confirm|start|complete|no-show|cancel|reschedule)$/,
  );
  if (!collection && !patientAction && !practiceCollection && !staffAction) return null;
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (!appointmentBookingEnabled(env)) {
    return reply(request, env, { error: "scheduling_booking_disabled" }, 403);
  }
  if (collection && request.method === "GET") return listPatientAppointments(request, env);
  if (collection && request.method === "POST") return bookAppointment(request, env);
  if (practiceCollection && request.method === "GET") {
    return listPracticeAppointments(request, env);
  }
  if (patientAction && request.method === "POST") {
    const id = safeId(patientAction[1]);
    if (!id) return reply(request, env, { error: "invalid_appointment_id" }, 400);
    return patientAction[2] === "reschedule"
      ? rescheduleAppointment(request, env, id)
      : transitionAppointment(request, env, id, patientAction[2] as "cancel" | "check-in");
  }
  if (staffAction && request.method === "POST") {
    const id = safeId(staffAction[1]);
    if (!id) return reply(request, env, { error: "invalid_appointment_id" }, 400);
    return staffAction[2] === "reschedule"
      ? rescheduleAppointment(request, env, id)
      : transitionAppointment(request, env, id, staffAction[2] as "cancel" | StaffTransition);
  }
  return reply(request, env, { error: "not_found" }, 404);
}
