import {
  schedulingVisitModes,
  type AppointmentSlotHold,
  type CandidateAppointmentSlot,
  type SchedulingVisitMode,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { requirePatientAccountSession } from "./platform-patient-identity";
import { hmacHex } from "./runtime-security";
import { v3db, v3now, type V3Env } from "./platform-v3-base";

type SlotPolicyRow = {
  id: string;
  provider_profile_id: string;
  practice_id: string;
  physician_user_id: string;
  time_zone: string;
  default_visit_duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  max_daily_appointments: number;
  booking_horizon_days: number;
  minimum_notice_minutes: number;
  revision: number;
};

type SlotRuleRow = {
  weekday: number;
  start_minute: number;
  end_minute: number;
  visit_mode: SchedulingVisitMode;
  effective_from: string;
  effective_until: string | null;
};

type SlotExceptionRow = {
  exception_date: string;
  exception_kind: "unavailable" | "additional";
  start_minute: number | null;
  end_minute: number | null;
  visit_mode: SchedulingVisitMode | null;
};

type ActiveHoldRow = {
  starts_at: string;
  ends_at: string;
  lock_starts_at: string;
  lock_ends_at: string;
};

type HoldRow = {
  id: string;
  provider_profile_id?: string;
  practice_id: string;
  starts_at: string;
  ends_at: string;
  visit_mode: SchedulingVisitMode;
  status: "held" | "released" | "expired" | "consumed";
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type InternalSlot = CandidateAppointmentSlot & {
  lockStartsAt: string;
  lockEndsAt: string;
};

const HOLD_TTL_MS = 5 * 60 * 1000;
const HOLD_RATE_WINDOW_MS = 15 * 60 * 1000;

function enabled(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function slotDiscoveryEnabled(env: V3Env) {
  return enabled(env.SCHEDULING_AVAILABILITY_ENABLED) &&
    enabled(env.SCHEDULING_SLOT_DISCOVERY_ENABLED) &&
    enabled(env.PROVIDER_DIRECTORY_ENABLED);
}

export function slotLockingEnabled(env: V3Env) {
  return slotDiscoveryEnabled(env) &&
    enabled(env.SCHEDULING_SLOT_LOCKING_ENABLED) &&
    enabled(env.PATIENT_IDENTITY_V2_ENABLED) &&
    enabled(env.CARE_RELATIONSHIPS_ENABLED);
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

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function datesBetween(from: string, to: string) {
  const values: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) values.push(date);
  return values;
}

function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? NaN);
  return {
    year: part("year"), month: part("month"), day: part("day"),
    hour: part("hour"), minute: part("minute"),
  };
}

function localMinuteToUtc(date: string, minuteOfDay: number, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess += desired - represented;
  }
  const check = zonedParts(new Date(guess), timeZone);
  if (
    check.year !== year || check.month !== month || check.day !== day ||
    check.hour !== hour || check.minute !== minute
  ) return null;
  return new Date(guess);
}

function localDate(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function isUnavailable(
  exceptions: readonly SlotExceptionRow[],
  date: string,
  mode: SchedulingVisitMode,
  startMinute: number,
  endMinute: number,
) {
  return exceptions.some((item) =>
    item.exception_kind === "unavailable" && item.exception_date === date &&
    (!item.visit_mode || item.visit_mode === mode) &&
    (item.start_minute === null || item.end_minute === null ||
      (item.start_minute < endMinute && item.end_minute > startMinute)),
  );
}

function windowsForDate(
  date: string,
  rules: readonly SlotRuleRow[],
  exceptions: readonly SlotExceptionRow[],
) {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const recurring = rules
    .filter((rule) => rule.weekday === weekday && rule.effective_from <= date &&
      (!rule.effective_until || rule.effective_until >= date))
    .map((rule) => ({ start: rule.start_minute, end: rule.end_minute, mode: rule.visit_mode }));
  const additional = exceptions
    .filter((item) => item.exception_date === date && item.exception_kind === "additional" &&
      item.start_minute !== null && item.end_minute !== null && item.visit_mode !== null)
    .map((item) => ({ start: item.start_minute!, end: item.end_minute!, mode: item.visit_mode! }));
  return [...recurring, ...additional];
}

async function loadPolicy(env: V3Env, providerProfileId: string) {
  return v3db(env).prepare(
    `SELECT s.id,p.id AS provider_profile_id,s.practice_id,s.physician_user_id,
            s.time_zone,s.default_visit_duration_minutes,s.buffer_before_minutes,
            s.buffer_after_minutes,s.max_daily_appointments,s.booking_horizon_days,
            s.minimum_notice_minutes,s.revision
     FROM provider_profiles p
     JOIN provider_scheduling_policies s
       ON s.practice_id=p.practice_id AND s.physician_user_id=p.physician_user_id
     JOIN practice_memberships m
       ON m.practice_id=s.practice_id AND m.user_id=s.physician_user_id
     JOIN runtime_users u ON u.id=s.physician_user_id
     WHERE p.id=? AND p.directory_status='published' AND s.status='published'
       AND m.role='physician' AND m.status='active'
       AND u.role='physician' AND u.status='active' AND u.irimc_status='verified'`,
  ).bind(providerProfileId).first<SlotPolicyRow>();
}

async function calculateSlots(
  env: V3Env,
  policy: SlotPolicyRow,
  from: string,
  to: string,
  requestedMode: SchedulingVisitMode | undefined,
  now: Date,
) {
  const database = v3db(env);
  const holdRangeStart = localMinuteToUtc(from, 0, policy.time_zone)?.toISOString() ?? `${from}T00:00:00.000Z`;
  const holdRangeEnd = localMinuteToUtc(addDays(to, 1), 0, policy.time_zone)?.toISOString() ?? `${addDays(to, 1)}T00:00:00.000Z`;
  const [rulesResult, exceptionsResult, holdsResult] = await Promise.all([
    database.prepare(
      `SELECT weekday,start_minute,end_minute,visit_mode,effective_from,effective_until
       FROM provider_availability_rules
       WHERE scheduling_policy_id=? AND retired_at IS NULL
         AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?)
       ORDER BY weekday,start_minute`,
    ).bind(policy.id, to, from).all<SlotRuleRow>(),
    database.prepare(
      `SELECT exception_date,exception_kind,start_minute,end_minute,visit_mode
       FROM provider_availability_exceptions
       WHERE scheduling_policy_id=? AND revoked_at IS NULL
         AND exception_date BETWEEN ? AND ? ORDER BY exception_date,start_minute`,
    ).bind(policy.id, from, to).all<SlotExceptionRow>(),
    database.prepare(
      `SELECT starts_at,ends_at,lock_starts_at,lock_ends_at
       FROM appointment_slot_holds
       WHERE physician_user_id=? AND status='held' AND expires_at>?
         AND starts_at<? AND ends_at>?`,
    ).bind(
      policy.physician_user_id, now.toISOString(),
      holdRangeEnd, holdRangeStart,
    ).all<ActiveHoldRow>(),
  ]);
  const rules = rulesResult.results;
  const exceptions = exceptionsResult.results;
  const holds = holdsResult.results;
  const minimumStart = new Date(now.valueOf() + policy.minimum_notice_minutes * 60_000).toISOString();
  const slots: InternalSlot[] = [];
  for (const date of datesBetween(from, to)) {
    const heldOnDate = holds.filter((hold) => localDate(new Date(hold.starts_at), policy.time_zone) === date).length;
    const dailyLimit = Math.max(0, policy.max_daily_appointments - heldOnDate);
    const daily = new Map<string, InternalSlot>();
    for (const window of windowsForDate(date, rules, exceptions)) {
      if (requestedMode && window.mode !== requestedMode) continue;
      const step = policy.buffer_before_minutes + policy.default_visit_duration_minutes + policy.buffer_after_minutes;
      for (
        let startMinute = window.start + policy.buffer_before_minutes;
        startMinute + policy.default_visit_duration_minutes + policy.buffer_after_minutes <= window.end;
        startMinute += step
      ) {
        const endMinute = startMinute + policy.default_visit_duration_minutes;
        if (isUnavailable(exceptions, date, window.mode, startMinute, endMinute)) continue;
        const start = localMinuteToUtc(date, startMinute, policy.time_zone);
        const end = localMinuteToUtc(date, endMinute, policy.time_zone);
        const lockStart = localMinuteToUtc(date, startMinute - policy.buffer_before_minutes, policy.time_zone);
        const lockEnd = localMinuteToUtc(date, endMinute + policy.buffer_after_minutes, policy.time_zone);
        if (!start || !end || !lockStart || !lockEnd) continue;
        const startsAt = start.toISOString();
        const endsAt = end.toISOString();
        const lockStartsAt = lockStart.toISOString();
        const lockEndsAt = lockEnd.toISOString();
        if (startsAt < minimumStart) continue;
        if (holds.some((hold) => overlaps(lockStartsAt, lockEndsAt, hold.lock_starts_at, hold.lock_ends_at))) continue;
        const key = `${startsAt}:${window.mode}`;
        daily.set(key, {
          providerProfileId: policy.provider_profile_id,
          practiceId: policy.practice_id,
          startsAt,
          endsAt,
          visitMode: window.mode,
          timeZone: policy.time_zone,
          policyRevision: policy.revision,
          informational: true,
          reserved: false,
          lockStartsAt,
          lockEndsAt,
        });
      }
    }
    slots.push(...[...daily.values()]
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .slice(0, dailyLimit));
    if (slots.length >= 500) break;
  }
  return slots.slice(0, 500);
}

async function listSlots(request: Request, env: V3Env, providerProfileId: string) {
  const url = new URL(request.url);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  const rawMode = url.searchParams.get("mode") ?? "";
  const mode = rawMode ? rawMode as SchedulingVisitMode : undefined;
  if (!from || !to || to < from || datesBetween(from, to).length > 31 ||
    (mode && !schedulingVisitModes.includes(mode))) {
    return reply(request, env, { error: "invalid_slot_range" }, 400);
  }
  const policy = await loadPolicy(env, providerProfileId);
  if (!policy) return reply(request, env, { error: "scheduling_provider_not_found" }, 404);
  const now = new Date();
  const today = localDate(now, policy.time_zone);
  if (from < today || to > addDays(today, policy.booking_horizon_days)) {
    return reply(request, env, { error: "slot_range_outside_booking_horizon" }, 400);
  }
  const slots = await calculateSlots(env, policy, from, to, mode, now);
  return reply(request, env, {
    slots: slots.map(({ lockStartsAt: _lockStartsAt, lockEndsAt: _lockEndsAt, ...slot }) => slot),
    serverTime: now.toISOString(),
    bookingEnabled: false,
  });
}

async function consumeHoldRate(env: V3Env, patientAccountId: string) {
  const key = await hmacHex(env.SESSION_SECRET, `slot-hold-rate:${patientAccountId}`);
  const now = v3now();
  const cutoff = new Date(Date.now() - HOLD_RATE_WINDOW_MS).toISOString();
  const row = await v3db(env).prepare(
    `INSERT INTO auth_rate_limits(key,window_started_at,count) VALUES(?,?,1)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN auth_rate_limits.window_started_at<? THEN 1 ELSE auth_rate_limits.count+1 END,
       window_started_at=CASE WHEN auth_rate_limits.window_started_at<? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END
     RETURNING count`,
  ).bind(key, now, cutoff, cutoff).first<{ count: number }>();
  return Boolean(row && row.count <= 20);
}

function managedHold(row: HoldRow, providerProfileId: string): AppointmentSlotHold {
  return {
    id: row.id,
    providerProfileId,
    practiceId: row.practice_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    visitMode: row.visit_mode,
    status: row.status,
    expiresAt: row.expires_at,
    bookingCreated: false,
    grantsClinicalAccess: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function acquireHold(request: Request, env: V3Env) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  if (patient.proofingStatus !== "verified") {
    return reply(request, env, { error: "patient_proofing_required" }, 403);
  }
  if (!(await consumeHoldRate(env, patient.patientAccountId))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.confirmed !== true) return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  const providerProfileId = safeId(body.providerProfileId);
  const startsAtInput = typeof body.startsAt === "string" ? body.startsAt : "";
  const parsedStart = new Date(startsAtInput);
  const startsAt = !Number.isNaN(parsedStart.valueOf()) ? parsedStart.toISOString() : null;
  const visitMode = String(body.visitMode ?? "") as SchedulingVisitMode;
  if (!providerProfileId || !startsAt || startsAt !== startsAtInput ||
    !schedulingVisitModes.includes(visitMode)) {
    return reply(request, env, { error: "invalid_slot_hold" }, 400);
  }
  const policy = await loadPolicy(env, providerProfileId);
  if (!policy) return reply(request, env, { error: "scheduling_provider_not_found" }, 404);
  const relationship = await v3db(env).prepare(
    `SELECT id FROM care_relationships
     WHERE patient_account_id=? AND practice_id=? AND assigned_physician_user_id=?
       AND status='active'`,
  ).bind(
    patient.patientAccountId, policy.practice_id, policy.physician_user_id,
  ).first<{ id: string }>();
  if (!relationship) return reply(request, env, { error: "active_care_relationship_required" }, 403);
  const date = localDate(parsedStart, policy.time_zone);
  const candidates = await calculateSlots(env, policy, date, date, visitMode, new Date());
  const candidate = candidates.find((slot) => slot.startsAt === startsAt && slot.visitMode === visitMode);
  if (!candidate) return reply(request, env, { error: "slot_no_longer_available" }, 409);
  const now = v3now();
  const expiresAt = new Date(Date.parse(now) + HOLD_TTL_MS).toISOString();
  const holdId = crypto.randomUUID();
  const database = v3db(env);
  try {
    const results = await database.batch<HoldRow>([
      database.prepare(
        `INSERT INTO appointment_slot_hold_events
         (id,slot_hold_id,practice_id,event_type,actor_type,actor_id,created_at)
         SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||
                substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||
                lower(hex(randomblob(6))),id,practice_id,'expired','platform',NULL,?
         FROM appointment_slot_holds WHERE status='held' AND expires_at<=?`,
      ).bind(now, now),
      database.prepare(
        `UPDATE appointment_slot_holds SET status='expired',updated_at=?
         WHERE status='held' AND expires_at<=?`,
      ).bind(now, now),
      database.prepare(
        `INSERT INTO appointment_slot_holds
         (id,scheduling_policy_id,practice_id,physician_user_id,patient_account_id,
          care_relationship_id,starts_at,ends_at,lock_starts_at,lock_ends_at,
          visit_mode,policy_revision,status,expires_at,released_at,consumed_at,
          created_at,updated_at)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'held',?,NULL,NULL,?,?
         WHERE NOT EXISTS(
           SELECT 1 FROM appointment_slot_holds h
           WHERE h.physician_user_id=? AND h.status='held' AND h.expires_at>?
             AND h.lock_starts_at<? AND h.lock_ends_at>?
         ) RETURNING *`,
      ).bind(
        holdId, policy.id, policy.practice_id, policy.physician_user_id,
        patient.patientAccountId, relationship.id, candidate.startsAt, candidate.endsAt,
        candidate.lockStartsAt, candidate.lockEndsAt, candidate.visitMode,
        candidate.policyRevision, expiresAt, now, now, policy.physician_user_id,
        now, candidate.lockEndsAt, candidate.lockStartsAt,
      ),
      database.prepare(
        `INSERT INTO appointment_slot_hold_events
         (id,slot_hold_id,practice_id,event_type,actor_type,actor_id,created_at)
         SELECT ?,id,practice_id,'acquired','patient',patient_account_id,?
         FROM appointment_slot_holds WHERE id=? AND status='held'`,
      ).bind(crypto.randomUUID(), now, holdId),
      database.prepare(
        `INSERT INTO patient_account_security_events
         (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
         SELECT ?,patient_account_id,'slot_hold_acquired','patient',patient_account_id,
                json_object('slotHoldId',id,'practiceId',practice_id),?
         FROM appointment_slot_holds WHERE id=? AND status='held'`,
      ).bind(crypto.randomUUID(), now, holdId),
    ]);
    const row = results[2]?.results[0];
    return row
      ? reply(request, env, { hold: managedHold(row, providerProfileId) }, 201)
      : reply(request, env, { error: "slot_lock_conflict" }, 409);
  } catch {
    return reply(request, env, { error: "slot_lock_conflict" }, 409);
  }
}

async function listHolds(request: Request, env: V3Env) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  const now = v3now();
  const rows = await v3db(env).prepare(
    `SELECT h.id,p.id AS provider_profile_id,h.practice_id,h.starts_at,h.ends_at,
            h.visit_mode,
            CASE WHEN h.status='held' AND h.expires_at<=? THEN 'expired' ELSE h.status END AS status,
            h.expires_at,h.created_at,h.updated_at
     FROM appointment_slot_holds h
     JOIN provider_scheduling_policies s ON s.id=h.scheduling_policy_id
     JOIN provider_profiles p
       ON p.practice_id=s.practice_id AND p.physician_user_id=s.physician_user_id
     WHERE h.patient_account_id=? ORDER BY h.created_at DESC LIMIT 100`,
  ).bind(now, patient.patientAccountId).all<HoldRow>();
  return reply(request, env, {
    holds: rows.results.map((row) => managedHold(row, row.provider_profile_id!)),
    bookingEnabled: false,
  });
}

async function releaseHold(request: Request, env: V3Env, holdId: string) {
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  const body = await request.json().catch(() => null) as { confirmed?: unknown } | null;
  if (body?.confirmed !== true) return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  const now = v3now();
  const database = v3db(env);
  const results = await database.batch<HoldRow>([
    database.prepare(
      `UPDATE appointment_slot_holds
       SET status='released',released_at=?,updated_at=?
       WHERE id=? AND patient_account_id=? AND status='held' AND expires_at>?
       RETURNING *`,
    ).bind(now, now, holdId, patient.patientAccountId, now),
    database.prepare(
      `INSERT INTO appointment_slot_hold_events
       (id,slot_hold_id,practice_id,event_type,actor_type,actor_id,created_at)
       SELECT ?,id,practice_id,'released','patient',patient_account_id,?
       FROM appointment_slot_holds
       WHERE id=? AND patient_account_id=? AND status='released' AND released_at=?`,
    ).bind(crypto.randomUUID(), now, holdId, patient.patientAccountId, now),
    database.prepare(
      `INSERT INTO patient_account_security_events
       (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
       SELECT ?,patient_account_id,'slot_hold_released','patient',patient_account_id,
              json_object('slotHoldId',id),?
       FROM appointment_slot_holds
       WHERE id=? AND patient_account_id=? AND status='released' AND released_at=?`,
    ).bind(crypto.randomUUID(), now, holdId, patient.patientAccountId, now),
  ]);
  const row = results[0]?.results[0];
  return row
    ? reply(request, env, { released: true, holdId: row.id })
    : reply(request, env, { error: "slot_hold_not_releasable" }, 409);
}

export async function schedulingSlotsRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const slotPath = url.pathname.match(/^\/v1\/scheduling\/providers\/([^/]+)\/slots$/);
  const holdPath = url.pathname === "/v1/scheduling/slot-holds";
  const releasePath = url.pathname.match(/^\/v1\/scheduling\/slot-holds\/([^/]+)\/release$/);
  if (!slotPath && !holdPath && !releasePath) return null;
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (slotPath && request.method === "GET") {
    if (!slotDiscoveryEnabled(env)) return reply(request, env, { error: "scheduling_slot_discovery_disabled" }, 403);
    const providerProfileId = safeId(slotPath[1]);
    return providerProfileId
      ? listSlots(request, env, providerProfileId)
      : reply(request, env, { error: "invalid_provider_id" }, 400);
  }
  if (holdPath && request.method === "GET") {
    return slotLockingEnabled(env)
      ? listHolds(request, env)
      : reply(request, env, { error: "scheduling_slot_locking_disabled" }, 403);
  }
  if (holdPath && request.method === "POST") {
    return slotLockingEnabled(env)
      ? acquireHold(request, env)
      : reply(request, env, { error: "scheduling_slot_locking_disabled" }, 403);
  }
  if (releasePath && request.method === "POST") {
    if (!slotLockingEnabled(env)) return reply(request, env, { error: "scheduling_slot_locking_disabled" }, 403);
    const holdId = safeId(releasePath[1]);
    return holdId
      ? releaseHold(request, env, holdId)
      : reply(request, env, { error: "invalid_slot_hold_id" }, 400);
  }
  return reply(request, env, { error: "not_found" }, 404);
}
