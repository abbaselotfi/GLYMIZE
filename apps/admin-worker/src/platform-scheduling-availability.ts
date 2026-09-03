import {
  availabilityExceptionKinds,
  schedulingConfirmationPolicies,
  schedulingVisitModes,
  type AvailabilityExceptionInput,
  type AvailabilityRuleInput,
  type ManagedAvailabilityException,
  type ManagedAvailabilityRule,
  type ManagedSchedulingPolicy,
  type SchedulingPolicyInput,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";

type PolicyRow = {
  id: string;
  practice_id: string;
  physician_user_id: string;
  status: "draft" | "published" | "suspended";
  time_zone: string;
  confirmation_policy: "auto_confirm" | "approval_required";
  default_visit_duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  max_daily_appointments: number;
  booking_horizon_days: number;
  minimum_notice_minutes: number;
  cancellation_notice_minutes: number;
  reschedule_notice_minutes: number;
  revision: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type RuleRow = {
  id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  visit_mode: "in_person" | "audio" | "video";
  effective_from: string;
  effective_until: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

type ExceptionRow = {
  id: string;
  exception_date: string;
  exception_kind: "unavailable" | "additional";
  start_minute: number | null;
  end_minute: number | null;
  visit_mode: "in_person" | "audio" | "video" | null;
  reason_label: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
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
            "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
            vary: "Origin",
          }
        : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function exactInteger(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : null;
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function validTimeZone(value: unknown) {
  if (typeof value !== "string" || value.length < 3 || value.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return null;
  }
}

function optionalReason(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 1 && normalized.length <= 160 &&
    !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
}

function safeId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ? value : null;
}

function parsePolicy(value: unknown): SchedulingPolicyInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const timeZone = validTimeZone(input.timeZone);
  const confirmationPolicy = String(input.confirmationPolicy ?? "");
  const defaultVisitDurationMinutes = exactInteger(input.defaultVisitDurationMinutes, 5, 240);
  const bufferBeforeMinutes = exactInteger(input.bufferBeforeMinutes, 0, 120);
  const bufferAfterMinutes = exactInteger(input.bufferAfterMinutes, 0, 120);
  const maxDailyAppointments = exactInteger(input.maxDailyAppointments, 1, 200);
  const bookingHorizonDays = exactInteger(input.bookingHorizonDays, 1, 365);
  const minimumNoticeMinutes = exactInteger(input.minimumNoticeMinutes, 0, 43200);
  const cancellationNoticeMinutes = exactInteger(input.cancellationNoticeMinutes, 0, 43200);
  const rescheduleNoticeMinutes = exactInteger(input.rescheduleNoticeMinutes, 0, 43200);
  if (
    input.confirmed !== true ||
    !timeZone ||
    !schedulingConfirmationPolicies.includes(confirmationPolicy as never) ||
    defaultVisitDurationMinutes === null ||
    bufferBeforeMinutes === null ||
    bufferAfterMinutes === null ||
    maxDailyAppointments === null ||
    bookingHorizonDays === null ||
    minimumNoticeMinutes === null ||
    cancellationNoticeMinutes === null ||
    rescheduleNoticeMinutes === null
  ) return null;
  return {
    timeZone,
    confirmationPolicy: confirmationPolicy as SchedulingPolicyInput["confirmationPolicy"],
    defaultVisitDurationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    maxDailyAppointments,
    bookingHorizonDays,
    minimumNoticeMinutes,
    cancellationNoticeMinutes,
    rescheduleNoticeMinutes,
    confirmed: true,
  };
}

function parseRule(value: unknown): AvailabilityRuleInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const weekday = exactInteger(input.weekday, 0, 6);
  const startMinute = exactInteger(input.startMinute, 0, 1439);
  const endMinute = exactInteger(input.endMinute, 1, 1440);
  const visitMode = String(input.visitMode ?? "");
  const effectiveFrom = validDate(input.effectiveFrom);
  const effectiveUntil = input.effectiveUntil === undefined || input.effectiveUntil === null || input.effectiveUntil === ""
    ? undefined
    : validDate(input.effectiveUntil);
  if (
    input.confirmed !== true ||
    weekday === null || startMinute === null || endMinute === null ||
    endMinute <= startMinute || !effectiveFrom || effectiveUntil === null ||
    (effectiveUntil !== undefined && effectiveUntil < effectiveFrom) ||
    !schedulingVisitModes.includes(visitMode as never)
  ) return null;
  return {
    weekday,
    startMinute,
    endMinute,
    visitMode: visitMode as AvailabilityRuleInput["visitMode"],
    effectiveFrom,
    effectiveUntil,
    confirmed: true,
  };
}

function parseException(value: unknown): AvailabilityExceptionInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const date = validDate(input.date);
  const kind = String(input.kind ?? "");
  const hasStart = input.startMinute !== undefined && input.startMinute !== null;
  const hasEnd = input.endMinute !== undefined && input.endMinute !== null;
  const startMinute = hasStart ? exactInteger(input.startMinute, 0, 1439) : undefined;
  const endMinute = hasEnd ? exactInteger(input.endMinute, 1, 1440) : undefined;
  const visitMode = input.visitMode === undefined || input.visitMode === null || input.visitMode === ""
    ? undefined
    : String(input.visitMode);
  const reasonLabel = optionalReason(input.reasonLabel);
  if (
    input.confirmed !== true || !date ||
    !availabilityExceptionKinds.includes(kind as never) ||
    hasStart !== hasEnd || startMinute === null || endMinute === null ||
    (startMinute !== undefined && endMinute !== undefined && endMinute <= startMinute) ||
    reasonLabel === null ||
    (visitMode !== undefined && !schedulingVisitModes.includes(visitMode as never)) ||
    (kind === "additional" && (startMinute === undefined || endMinute === undefined || visitMode === undefined))
  ) return null;
  return {
    date,
    kind: kind as AvailabilityExceptionInput["kind"],
    startMinute,
    endMinute,
    visitMode: visitMode as AvailabilityExceptionInput["visitMode"],
    reasonLabel,
    confirmed: true,
  };
}

function managedPolicy(row: PolicyRow): ManagedSchedulingPolicy {
  return {
    id: row.id,
    practiceId: row.practice_id,
    physicianUserId: row.physician_user_id,
    status: row.status,
    timeZone: row.time_zone,
    confirmationPolicy: row.confirmation_policy,
    defaultVisitDurationMinutes: row.default_visit_duration_minutes,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    maxDailyAppointments: row.max_daily_appointments,
    bookingHorizonDays: row.booking_horizon_days,
    minimumNoticeMinutes: row.minimum_notice_minutes,
    cancellationNoticeMinutes: row.cancellation_notice_minutes,
    rescheduleNoticeMinutes: row.reschedule_notice_minutes,
    revision: row.revision,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function managedRule(row: RuleRow): ManagedAvailabilityRule {
  return {
    id: row.id,
    weekday: row.weekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    visitMode: row.visit_mode,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until ?? undefined,
    retiredAt: row.retired_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function managedException(row: ExceptionRow): ManagedAvailabilityException {
  return {
    id: row.id,
    date: row.exception_date,
    kind: row.exception_kind,
    startMinute: row.start_minute ?? undefined,
    endMinute: row.end_minute ?? undefined,
    visitMode: row.visit_mode ?? undefined,
    reasonLabel: row.reason_label ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireVerifiedPhysician(request: Request, env: V3Env) {
  const auth = await v3RequireRuntime(request, env);
  if (!auth) return { error: "physician_auth_required", status: 401 } as const;
  if (auth.user.role !== "physician") {
    return { error: "physician_authority_required", status: 403 } as const;
  }
  const verified = await v3db(env).prepare(
    `SELECT irimc_status FROM runtime_users WHERE id=? AND status='active'`,
  ).bind(auth.user.id).first<{ irimc_status: string | null }>();
  if (verified?.irimc_status !== "verified") {
    return { error: "provider_identity_verification_required", status: 403 } as const;
  }
  return { auth } as const;
}

async function policyForActor(env: V3Env, practiceId: string, physicianUserId: string) {
  return v3db(env).prepare(
    `SELECT * FROM provider_scheduling_policies
     WHERE practice_id=? AND physician_user_id=?`,
  ).bind(practiceId, physicianUserId).first<PolicyRow>();
}

async function getConfiguration(request: Request, env: V3Env) {
  const actor = await requireVerifiedPhysician(request, env);
  if (!("auth" in actor)) return reply(request, env, { error: actor.error }, actor.status);
  const { practiceId, id: physicianUserId } = actor.auth!.user;
  const policy = await policyForActor(env, practiceId, physicianUserId);
  if (!policy) return reply(request, env, { policy: undefined, rules: [], exceptions: [] });
  const database = v3db(env);
  const [rules, exceptions] = await Promise.all([
    database.prepare(
      `SELECT id,weekday,start_minute,end_minute,visit_mode,effective_from,
              effective_until,retired_at,created_at,updated_at
       FROM provider_availability_rules
       WHERE scheduling_policy_id=? ORDER BY retired_at IS NOT NULL,weekday,start_minute
       LIMIT 250`,
    ).bind(policy.id).all<RuleRow>(),
    database.prepare(
      `SELECT id,exception_date,exception_kind,start_minute,end_minute,visit_mode,
              reason_label,revoked_at,created_at,updated_at
       FROM provider_availability_exceptions
       WHERE scheduling_policy_id=? ORDER BY revoked_at IS NOT NULL,exception_date,start_minute
       LIMIT 250`,
    ).bind(policy.id).all<ExceptionRow>(),
  ]);
  return reply(request, env, {
    policy: managedPolicy(policy),
    rules: rules.results.map(managedRule),
    exceptions: exceptions.results.map(managedException),
  });
}

async function savePolicy(request: Request, env: V3Env) {
  const actor = await requireVerifiedPhysician(request, env);
  if (!("auth" in actor)) return reply(request, env, { error: actor.error }, actor.status);
  const raw = await request.json().catch(() => null);
  if ((raw as Record<string, unknown> | null)?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const input = parsePolicy(raw);
  if (!input) return reply(request, env, { error: "invalid_scheduling_policy" }, 400);
  const { practiceId, id: physicianUserId } = actor.auth!.user;
  const database = v3db(env);
  const now = v3now();
  const policyId = crypto.randomUUID();
  const results = await database.batch<PolicyRow>([
    database.prepare(
      `INSERT INTO provider_scheduling_policies
       (id,practice_id,physician_user_id,status,time_zone,confirmation_policy,
        default_visit_duration_minutes,buffer_before_minutes,buffer_after_minutes,
        max_daily_appointments,booking_horizon_days,minimum_notice_minutes,
        cancellation_notice_minutes,reschedule_notice_minutes,revision,published_at,
        created_at,updated_at)
       VALUES(?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,1,NULL,?,?)
       ON CONFLICT(practice_id,physician_user_id) DO UPDATE SET
         time_zone=excluded.time_zone,
         confirmation_policy=excluded.confirmation_policy,
         default_visit_duration_minutes=excluded.default_visit_duration_minutes,
         buffer_before_minutes=excluded.buffer_before_minutes,
         buffer_after_minutes=excluded.buffer_after_minutes,
         max_daily_appointments=excluded.max_daily_appointments,
         booking_horizon_days=excluded.booking_horizon_days,
         minimum_notice_minutes=excluded.minimum_notice_minutes,
         cancellation_notice_minutes=excluded.cancellation_notice_minutes,
         reschedule_notice_minutes=excluded.reschedule_notice_minutes,
         revision=provider_scheduling_policies.revision+1,
         updated_at=excluded.updated_at
       WHERE provider_scheduling_policies.status<>'suspended'
       RETURNING *`,
    ).bind(
      policyId, practiceId, physicianUserId, input.timeZone, input.confirmationPolicy,
      input.defaultVisitDurationMinutes, input.bufferBeforeMinutes, input.bufferAfterMinutes,
      input.maxDailyAppointments, input.bookingHorizonDays, input.minimumNoticeMinutes,
      input.cancellationNoticeMinutes, input.rescheduleNoticeMinutes, now, now,
    ),
    database.prepare(
      `INSERT INTO provider_scheduling_events
       (id,scheduling_policy_id,practice_id,event_type,actor_user_id,target_id,
        policy_revision,meta_json,created_at)
       SELECT ?,p.id,p.practice_id,'policy_saved',?,p.id,p.revision,NULL,?
       FROM provider_scheduling_policies p
       WHERE p.practice_id=? AND p.physician_user_id=? AND p.status<>'suspended'`,
    ).bind(crypto.randomUUID(), physicianUserId, now, practiceId, physicianUserId),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,?,?,'scheduling.policy_saved','scheduling_policy',p.id,
              json_object('revision',p.revision),?
       FROM provider_scheduling_policies p
       WHERE p.practice_id=? AND p.physician_user_id=? AND p.status<>'suspended'`,
    ).bind(crypto.randomUUID(), physicianUserId, practiceId, now, practiceId, physicianUserId),
  ]);
  const row = results[0]?.results[0];
  return row
    ? reply(request, env, { policy: managedPolicy(row) })
    : reply(request, env, { error: "scheduling_policy_suspended" }, 409);
}

async function createRule(request: Request, env: V3Env) {
  const actor = await requireVerifiedPhysician(request, env);
  if (!("auth" in actor)) return reply(request, env, { error: actor.error }, actor.status);
  const raw = await request.json().catch(() => null);
  if ((raw as Record<string, unknown> | null)?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const input = parseRule(raw);
  if (!input) return reply(request, env, { error: "invalid_availability_rule" }, 400);
  const { practiceId, id: physicianUserId } = actor.auth!.user;
  const policy = await policyForActor(env, practiceId, physicianUserId);
  if (!policy) return reply(request, env, { error: "scheduling_policy_required" }, 409);
  if (policy.status === "suspended") return reply(request, env, { error: "scheduling_policy_suspended" }, 409);
  const database = v3db(env);
  const duplicate = await database.prepare(
    `SELECT id FROM provider_availability_rules
     WHERE scheduling_policy_id=? AND weekday=? AND start_minute=? AND end_minute=?
       AND visit_mode=? AND effective_from=? AND retired_at IS NULL`,
  ).bind(
    policy.id, input.weekday, input.startMinute, input.endMinute,
    input.visitMode, input.effectiveFrom,
  ).first<{ id: string }>();
  if (duplicate) return reply(request, env, { error: "availability_rule_duplicate" }, 409);
  const id = crypto.randomUUID();
  const now = v3now();
  try {
    const results = await database.batch<RuleRow>([
      database.prepare(
        `INSERT INTO provider_availability_rules
         (id,scheduling_policy_id,practice_id,physician_user_id,weekday,start_minute,
          end_minute,visit_mode,effective_from,effective_until,retired_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?) RETURNING *`,
      ).bind(
        id, policy.id, practiceId, physicianUserId, input.weekday, input.startMinute,
        input.endMinute, input.visitMode, input.effectiveFrom, input.effectiveUntil ?? null,
        now, now,
      ),
      database.prepare(
        `UPDATE provider_scheduling_policies SET revision=revision+1,updated_at=?
         WHERE id=? AND practice_id=? AND physician_user_id=? AND status<>'suspended'`,
      ).bind(now, policy.id, practiceId, physicianUserId),
      database.prepare(
        `INSERT INTO provider_scheduling_events
         (id,scheduling_policy_id,practice_id,event_type,actor_user_id,target_id,
          policy_revision,meta_json,created_at)
         SELECT ?,id,practice_id,'rule_created',?,?,revision,NULL,?
         FROM provider_scheduling_policies WHERE id=? AND practice_id=? AND physician_user_id=?`,
      ).bind(crypto.randomUUID(), physicianUserId, id, now, policy.id, practiceId, physicianUserId),
    ]);
    const row = results[0]?.results[0];
    return row
      ? reply(request, env, { rule: managedRule(row) }, 201)
      : reply(request, env, { error: "availability_rule_create_failed" }, 500);
  } catch {
    return reply(request, env, { error: "availability_rule_conflict" }, 409);
  }
}

async function retireRule(request: Request, env: V3Env, ruleId: string) {
  const actor = await requireVerifiedPhysician(request, env);
  if (!("auth" in actor)) return reply(request, env, { error: actor.error }, actor.status);
  const body = await request.json().catch(() => null) as { confirmed?: unknown } | null;
  if (body?.confirmed !== true) return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  const { practiceId, id: physicianUserId } = actor.auth!.user;
  const policy = await policyForActor(env, practiceId, physicianUserId);
  if (!policy) return reply(request, env, { error: "scheduling_policy_required" }, 409);
  if (policy.status === "suspended") return reply(request, env, { error: "scheduling_policy_suspended" }, 409);
  const now = v3now();
  const database = v3db(env);
  const results = await database.batch<RuleRow>([
    database.prepare(
      `UPDATE provider_availability_rules SET retired_at=?,updated_at=?
       WHERE id=? AND scheduling_policy_id=? AND practice_id=? AND physician_user_id=?
         AND retired_at IS NULL RETURNING *`,
    ).bind(now, now, ruleId, policy.id, practiceId, physicianUserId),
    database.prepare(
      `UPDATE provider_scheduling_policies SET revision=revision+1,updated_at=?
       WHERE id=? AND EXISTS(
         SELECT 1 FROM provider_availability_rules r
         WHERE r.id=? AND r.scheduling_policy_id=provider_scheduling_policies.id
           AND r.retired_at=?
       )`,
    ).bind(now, policy.id, ruleId, now),
    database.prepare(
      `INSERT INTO provider_scheduling_events
       (id,scheduling_policy_id,practice_id,event_type,actor_user_id,target_id,
        policy_revision,meta_json,created_at)
       SELECT ?,p.id,p.practice_id,'rule_retired',?,?,p.revision,NULL,?
       FROM provider_scheduling_policies p JOIN provider_availability_rules r
         ON r.scheduling_policy_id=p.id
       WHERE p.id=? AND r.id=? AND r.retired_at=?`,
    ).bind(crypto.randomUUID(), physicianUserId, ruleId, now, policy.id, ruleId, now),
  ]);
  const row = results[0]?.results[0];
  return row
    ? reply(request, env, { rule: managedRule(row) })
    : reply(request, env, { error: "availability_rule_not_found" }, 404);
}

async function createException(request: Request, env: V3Env) {
  const actor = await requireVerifiedPhysician(request, env);
  if (!("auth" in actor)) return reply(request, env, { error: actor.error }, actor.status);
  const raw = await request.json().catch(() => null);
  if ((raw as Record<string, unknown> | null)?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const input = parseException(raw);
  if (!input) return reply(request, env, { error: "invalid_availability_exception" }, 400);
  const { practiceId, id: physicianUserId } = actor.auth!.user;
  const policy = await policyForActor(env, practiceId, physicianUserId);
  if (!policy) return reply(request, env, { error: "scheduling_policy_required" }, 409);
  if (policy.status === "suspended") return reply(request, env, { error: "scheduling_policy_suspended" }, 409);
  const database = v3db(env);
  const id = crypto.randomUUID();
  const now = v3now();
  const results = await database.batch<ExceptionRow>([
    database.prepare(
      `INSERT INTO provider_availability_exceptions
       (id,scheduling_policy_id,practice_id,physician_user_id,exception_date,
        exception_kind,start_minute,end_minute,visit_mode,reason_label,revoked_at,
        created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?) RETURNING *`,
    ).bind(
      id, policy.id, practiceId, physicianUserId, input.date, input.kind,
      input.startMinute ?? null, input.endMinute ?? null, input.visitMode ?? null,
      input.reasonLabel ?? null, now, now,
    ),
    database.prepare(
      `UPDATE provider_scheduling_policies SET revision=revision+1,updated_at=? WHERE id=?`,
    ).bind(now, policy.id),
    database.prepare(
      `INSERT INTO provider_scheduling_events
       (id,scheduling_policy_id,practice_id,event_type,actor_user_id,target_id,
        policy_revision,meta_json,created_at)
       SELECT ?,id,practice_id,'exception_created',?,?,revision,NULL,?
       FROM provider_scheduling_policies WHERE id=? AND practice_id=? AND physician_user_id=?`,
    ).bind(crypto.randomUUID(), physicianUserId, id, now, policy.id, practiceId, physicianUserId),
  ]);
  const row = results[0]?.results[0];
  return row
    ? reply(request, env, { exception: managedException(row) }, 201)
    : reply(request, env, { error: "availability_exception_create_failed" }, 500);
}

async function revokeException(request: Request, env: V3Env, exceptionId: string) {
  const actor = await requireVerifiedPhysician(request, env);
  if (!("auth" in actor)) return reply(request, env, { error: actor.error }, actor.status);
  const body = await request.json().catch(() => null) as { confirmed?: unknown } | null;
  if (body?.confirmed !== true) return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  const { practiceId, id: physicianUserId } = actor.auth!.user;
  const policy = await policyForActor(env, practiceId, physicianUserId);
  if (!policy) return reply(request, env, { error: "scheduling_policy_required" }, 409);
  if (policy.status === "suspended") return reply(request, env, { error: "scheduling_policy_suspended" }, 409);
  const now = v3now();
  const database = v3db(env);
  const results = await database.batch<ExceptionRow>([
    database.prepare(
      `UPDATE provider_availability_exceptions SET revoked_at=?,updated_at=?
       WHERE id=? AND scheduling_policy_id=? AND practice_id=? AND physician_user_id=?
         AND revoked_at IS NULL RETURNING *`,
    ).bind(now, now, exceptionId, policy.id, practiceId, physicianUserId),
    database.prepare(
      `UPDATE provider_scheduling_policies SET revision=revision+1,updated_at=?
       WHERE id=? AND EXISTS(
         SELECT 1 FROM provider_availability_exceptions e
         WHERE e.id=? AND e.scheduling_policy_id=provider_scheduling_policies.id
           AND e.revoked_at=?
       )`,
    ).bind(now, policy.id, exceptionId, now),
    database.prepare(
      `INSERT INTO provider_scheduling_events
       (id,scheduling_policy_id,practice_id,event_type,actor_user_id,target_id,
        policy_revision,meta_json,created_at)
       SELECT ?,p.id,p.practice_id,'exception_revoked',?,?,p.revision,NULL,?
       FROM provider_scheduling_policies p JOIN provider_availability_exceptions e
         ON e.scheduling_policy_id=p.id
       WHERE p.id=? AND e.id=? AND e.revoked_at=?`,
    ).bind(crypto.randomUUID(), physicianUserId, exceptionId, now, policy.id, exceptionId, now),
  ]);
  const row = results[0]?.results[0];
  return row
    ? reply(request, env, { exception: managedException(row) })
    : reply(request, env, { error: "availability_exception_not_found" }, 404);
}

async function setPublication(request: Request, env: V3Env, action: "publish" | "hide") {
  const actor = await requireVerifiedPhysician(request, env);
  if (!("auth" in actor)) return reply(request, env, { error: actor.error }, actor.status);
  const body = await request.json().catch(() => null) as { confirmed?: unknown } | null;
  if (body?.confirmed !== true) return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  const { practiceId, id: physicianUserId } = actor.auth!.user;
  const policy = await policyForActor(env, practiceId, physicianUserId);
  if (!policy) return reply(request, env, { error: "scheduling_policy_required" }, 409);
  if (policy.status === "suspended") return reply(request, env, { error: "scheduling_policy_suspended" }, 409);
  const database = v3db(env);
  if (action === "publish") {
    const active = await database.prepare(
      `SELECT count(*) AS count FROM provider_availability_rules
       WHERE scheduling_policy_id=? AND retired_at IS NULL`,
    ).bind(policy.id).first<{ count: number }>();
    if ((active?.count ?? 0) < 1) {
      return reply(request, env, { error: "active_availability_rule_required" }, 409);
    }
  }
  const now = v3now();
  const status = action === "publish" ? "published" : "draft";
  const results = await database.batch<PolicyRow>([
    database.prepare(
      `UPDATE provider_scheduling_policies
       SET status=?,published_at=?,revision=revision+1,updated_at=?
       WHERE id=? AND practice_id=? AND physician_user_id=? AND status<>'suspended'
       RETURNING *`,
    ).bind(status, action === "publish" ? now : null, now, policy.id, practiceId, physicianUserId),
    database.prepare(
      `INSERT INTO provider_scheduling_events
       (id,scheduling_policy_id,practice_id,event_type,actor_user_id,target_id,
        policy_revision,meta_json,created_at)
       SELECT ?,id,practice_id,?,?,id,revision,NULL,?
       FROM provider_scheduling_policies WHERE id=? AND status=? AND updated_at=?`,
    ).bind(crypto.randomUUID(), action === "publish" ? "published" : "hidden", physicianUserId, now, policy.id, status, now),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       VALUES(?,?,?,?, 'scheduling_policy',?,NULL,?)`,
    ).bind(crypto.randomUUID(), physicianUserId, practiceId, `scheduling.${action}`, policy.id, now),
  ]);
  const row = results[0]?.results[0];
  return row
    ? reply(request, env, { policy: managedPolicy(row) })
    : reply(request, env, { error: "scheduling_policy_update_conflict" }, 409);
}

export async function schedulingAvailabilityRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/scheduling/")) return null;
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (url.pathname === "/v1/scheduling/capabilities" && request.method === "GET") {
    return reply(request, env, {
      availabilityManagement: enabled(env.SCHEDULING_AVAILABILITY_ENABLED),
      patientSlotDiscovery: false,
      booking: false,
      paymentGateway: false,
    });
  }
  if (!enabled(env.SCHEDULING_AVAILABILITY_ENABLED)) {
    return reply(request, env, { error: "scheduling_availability_disabled" }, 403);
  }
  if (url.pathname === "/v1/scheduling/manage" && request.method === "GET") {
    return getConfiguration(request, env);
  }
  if (url.pathname === "/v1/scheduling/manage/policy" && request.method === "PUT") {
    return savePolicy(request, env);
  }
  if (url.pathname === "/v1/scheduling/manage/rules" && request.method === "POST") {
    return createRule(request, env);
  }
  const retireRuleMatch = url.pathname.match(/^\/v1\/scheduling\/manage\/rules\/([^/]+)\/retire$/);
  if (retireRuleMatch && request.method === "POST") {
    const id = safeId(retireRuleMatch[1]!);
    return id
      ? retireRule(request, env, id)
      : reply(request, env, { error: "invalid_availability_rule_id" }, 400);
  }
  if (url.pathname === "/v1/scheduling/manage/exceptions" && request.method === "POST") {
    return createException(request, env);
  }
  const revokeExceptionMatch = url.pathname.match(/^\/v1\/scheduling\/manage\/exceptions\/([^/]+)\/revoke$/);
  if (revokeExceptionMatch && request.method === "POST") {
    const id = safeId(revokeExceptionMatch[1]!);
    return id
      ? revokeException(request, env, id)
      : reply(request, env, { error: "invalid_availability_exception_id" }, 400);
  }
  if (url.pathname === "/v1/scheduling/manage/publish" && request.method === "POST") {
    return setPublication(request, env, "publish");
  }
  if (url.pathname === "/v1/scheduling/manage/hide" && request.method === "POST") {
    return setPublication(request, env, "hide");
  }
  return reply(request, env, { error: "not_found" }, 404);
}
