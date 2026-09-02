import type {
  IssuedReferral,
  ReferralInspection,
  ReferralRedemption,
  ReferralRedemptionStatus,
  ReferralSummary,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { requirePatientAccountSession } from "./platform-patient-identity";
import { resolvePublicAppBaseUrl } from "./platform-team-invitation-policy";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";
import { hmacHex, randomToken } from "./runtime-security";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_EXPIRY_HOURS = 7 * 24;
const MAX_EXPIRY_HOURS = 30 * 24;

type ReferralRow = {
  id: string;
  practice_id: string;
  issuer_user_id: string;
  intended_physician_user_id: string;
  provider_profile_id: string;
  status: "active" | "revoked" | "exhausted";
  code_hint: string;
  purpose_label: string | null;
  provider_display_name: string;
  specialty_name: string;
  practice_display_name: string;
  max_uses: number;
  use_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderRow = {
  profile_id: string;
  physician_user_id: string;
  display_name: string;
  specialty_name: string;
  practice_display_name: string;
};

type RedemptionRow = {
  id: string;
  referral_id: string;
  patient_account_id: string;
  status: ReferralRedemptionStatus;
  patient_proofing_status_at_redeem: "unverified" | "pending" | "verified" | "rejected";
  redeemed_at: string;
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
            "access-control-allow-methods": "GET, POST, OPTIONS",
            vary: "Origin",
          }
        : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function referralSecret(env: V3Env) {
  const secret = String(env.REFERRAL_CODE_LOOKUP_SECRET ?? "").trim();
  return secret || null;
}

function safeId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function safeOptionalLabel(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const label = value.trim().replace(/\s+/g, " ");
  if (!label) return undefined;
  return label.length <= 120 && !/[\u0000-\u001f\u007f]/.test(label) ? label : null;
}

function parseCode(value: unknown) {
  const code = typeof value === "string" ? value.trim() : "";
  return /^GLY1_[A-Za-z0-9_-]{24}$/.test(code) ? code : null;
}

async function codeHash(secret: string, code: string) {
  return hmacHex(secret, `referral-code:${code}`);
}

async function codeHashCandidates(env: V3Env, secret: string, code: string) {
  const previous = String(env.REFERRAL_CODE_LOOKUP_SECRET_PREVIOUS ?? "").trim();
  const secrets = previous && previous !== secret ? [secret, previous] : [secret];
  const hashes = await Promise.all(secrets.map((candidate) => codeHash(candidate, code)));
  return [hashes[0]!, hashes[1] ?? hashes[0]!] as const;
}

async function rateKey(secret: string, scope: string) {
  return hmacHex(secret, `referral-rate:${scope}`);
}

async function consumeRate(env: V3Env, key: string, limit: number) {
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
  return Boolean(row && row.count <= limit);
}

function effectiveStatus(row: ReferralRow): ReferralSummary["status"] {
  return row.status === "active" && Date.parse(row.expires_at) <= Date.now()
    ? "expired"
    : row.status;
}

function referralSummary(row: ReferralRow): ReferralSummary {
  return {
    id: row.id,
    intendedPhysicianUserId: row.intended_physician_user_id,
    provider: {
      displayName: row.provider_display_name,
      specialtyName: row.specialty_name,
      practiceDisplayName: row.practice_display_name,
    },
    purposeLabel: row.purpose_label ?? undefined,
    codeHint: row.code_hint,
    status: effectiveStatus(row),
    maxUses: row.max_uses,
    useCount: row.use_count,
    remainingUses: Math.max(0, row.max_uses - row.use_count),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function redemptionView(row: RedemptionRow, referral: ReferralRow): ReferralRedemption {
  return {
    id: row.id,
    referralId: row.referral_id,
    provider: {
      displayName: referral.provider_display_name,
      specialtyName: referral.specialty_name,
      practiceDisplayName: referral.practice_display_name,
    },
    status: row.status,
    patientProofingStatusAtRedeem: row.patient_proofing_status_at_redeem,
    redeemedAt: row.redeemed_at,
    updatedAt: row.updated_at,
  };
}

async function manager(request: Request, env: V3Env) {
  const auth = await v3RequireRuntime(request, env);
  if (!auth) return null;
  if (auth.user.role === "physician" || auth.user.permissions.includes("referrals.manage")) {
    return auth;
  }
  return null;
}

async function intendedProvider(env: V3Env, practiceId: string, physicianUserId: string) {
  return v3db(env).prepare(
    `SELECT p.id AS profile_id,p.physician_user_id,p.display_name,p.specialty_name,
            p.practice_display_name
     FROM provider_profiles p
     JOIN practice_memberships m
       ON m.practice_id=p.practice_id AND m.user_id=p.physician_user_id
     JOIN runtime_users u ON u.id=p.physician_user_id
     WHERE p.practice_id=? AND p.physician_user_id=? AND p.directory_status='published'
       AND m.role='physician' AND m.status='active'
       AND u.role='physician' AND u.status='active' AND u.irimc_status='verified'`,
  ).bind(practiceId, physicianUserId).first<ProviderRow>();
}

async function issueReferral(request: Request, env: V3Env) {
  const auth = await manager(request, env);
  if (!auth) return reply(request, env, { error: "referral_management_forbidden" }, 403);
  const secret = referralSecret(env);
  if (!secret) return reply(request, env, { error: "referral_service_not_configured" }, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return reply(request, env, { error: "invalid_json" }, 400);
  const intendedPhysicianUserId = body.intendedPhysicianUserId === undefined
    ? (auth.user.role === "physician" ? auth.user.id : null)
    : safeId(body.intendedPhysicianUserId);
  const purposeLabel = safeOptionalLabel(body.purposeLabel);
  const maxUses = body.maxUses === undefined ? 1 : Number(body.maxUses);
  const expiresInHours = body.expiresInHours === undefined
    ? DEFAULT_EXPIRY_HOURS
    : Number(body.expiresInHours);
  if (
    !intendedPhysicianUserId ||
    purposeLabel === null ||
    !Number.isInteger(maxUses) ||
    maxUses < 1 ||
    maxUses > 100 ||
    !Number.isInteger(expiresInHours) ||
    expiresInHours < 1 ||
    expiresInHours > MAX_EXPIRY_HOURS
  ) {
    return reply(request, env, { error: "invalid_referral_request" }, 400);
  }
  const issuerLimitKey = await rateKey(secret, `issue:${auth.user.id}`);
  if (!(await consumeRate(env, issuerLimitKey, 50))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const provider = await intendedProvider(
    env,
    auth.user.practiceId,
    intendedPhysicianUserId,
  );
  if (!provider) {
    return reply(request, env, { error: "intended_provider_unavailable" }, 409);
  }
  let publicAppBase: string;
  try {
    publicAppBase = resolvePublicAppBaseUrl({
      ADMIN_ORIGIN: env.ADMIN_ORIGIN,
      ADMIN_PATH_PREFIX: env.ADMIN_PATH_PREFIX ?? "/admin",
      PUBLIC_APP_URL: env.PUBLIC_APP_URL,
    });
  } catch {
    return reply(request, env, { error: "referral_service_not_configured" }, 503);
  }
  const code = `GLY1_${randomToken(18)}`;
  const hash = await codeHash(secret, code);
  const hint = `${code.slice(0, 5)}...${code.slice(-4)}`;
  const referralId = crypto.randomUUID();
  const now = v3now();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const database = v3db(env);
  try {
    const results = await database.batch<ReferralRow>([
      database.prepare(
        `INSERT INTO referral_invites
         (id,practice_id,issuer_user_id,intended_physician_user_id,provider_profile_id,
          workflow,status,code_hash,code_hint,purpose_label,provider_display_name,
          specialty_name,practice_display_name,max_uses,use_count,expires_at,
          revoked_at,revoked_by_user_id,created_at,updated_at)
         VALUES(?,?,?,?,?,'provider_connection','active',?,?,?,?,?,?,?,0,?,NULL,NULL,?,?)
         RETURNING id,practice_id,issuer_user_id,intended_physician_user_id,
                   provider_profile_id,status,code_hint,purpose_label,provider_display_name,
                   specialty_name,practice_display_name,max_uses,use_count,expires_at,
                   revoked_at,created_at,updated_at`,
      ).bind(
        referralId,
        auth.user.practiceId,
        auth.user.id,
        provider.physician_user_id,
        provider.profile_id,
        hash,
        hint,
        purposeLabel ?? null,
        provider.display_name,
        provider.specialty_name,
        provider.practice_display_name,
        maxUses,
        expiresAt,
        now,
        now,
      ),
      database.prepare(
        `INSERT INTO audit_log
         (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
         VALUES(?,?,?,'referral.issued','referral',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        auth.user.id,
        auth.user.practiceId,
        referralId,
        JSON.stringify({ intendedPhysicianUserId, maxUses, expiresAt }),
        now,
      ),
    ]);
    const row = results[0]?.results[0];
    if (!row) throw new Error("referral_insert_missing");
    const issued: IssuedReferral = {
      ...referralSummary(row),
      code,
      qrPayload: `${publicAppBase}/portal/#referral=${encodeURIComponent(code)}`,
    };
    return reply(request, env, { referral: issued }, 201);
  } catch {
    return reply(request, env, { error: "referral_issuance_failed" }, 409);
  }
}

async function listReferrals(request: Request, env: V3Env) {
  const auth = await manager(request, env);
  if (!auth) return reply(request, env, { error: "referral_management_forbidden" }, 403);
  const rows = await v3db(env).prepare(
    `SELECT id,practice_id,issuer_user_id,intended_physician_user_id,provider_profile_id,
            status,code_hint,purpose_label,provider_display_name,specialty_name,
            practice_display_name,max_uses,use_count,expires_at,revoked_at,created_at,updated_at
     FROM referral_invites
     WHERE practice_id=?
     ORDER BY created_at DESC,id DESC
     LIMIT 100`,
  ).bind(auth.user.practiceId).all<ReferralRow>();
  return reply(request, env, { referrals: rows.results.map(referralSummary) });
}

async function revokeReferral(request: Request, env: V3Env, referralId: string) {
  const auth = await manager(request, env);
  if (!auth) return reply(request, env, { error: "referral_management_forbidden" }, 403);
  const body = await request.json().catch(() => null) as { confirmed?: unknown } | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const database = v3db(env);
  const current = await database.prepare(
    `SELECT id,practice_id,issuer_user_id,intended_physician_user_id,provider_profile_id,
            status,code_hint,purpose_label,provider_display_name,specialty_name,
            practice_display_name,max_uses,use_count,expires_at,revoked_at,created_at,updated_at
     FROM referral_invites WHERE id=? AND practice_id=?`,
  ).bind(referralId, auth.user.practiceId).first<ReferralRow>();
  if (!current) return reply(request, env, { error: "referral_not_found" }, 404);
  if (current.status === "revoked") {
    return reply(request, env, { referral: referralSummary(current) });
  }
  if (current.status === "exhausted") {
    return reply(request, env, { error: "referral_already_exhausted" }, 409);
  }
  const now = v3now();
  const results = await database.batch<ReferralRow>([
    database.prepare(
      `UPDATE referral_invites
       SET status='revoked',revoked_at=?,revoked_by_user_id=?,updated_at=?
       WHERE id=? AND practice_id=? AND status='active'
       RETURNING id,practice_id,issuer_user_id,intended_physician_user_id,
                 provider_profile_id,status,code_hint,purpose_label,provider_display_name,
                 specialty_name,practice_display_name,max_uses,use_count,expires_at,
                 revoked_at,created_at,updated_at`,
    ).bind(now, auth.user.id, now, referralId, auth.user.practiceId),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,?,?,'referral.revoked','referral',r.id,NULL,?
       FROM referral_invites r
       WHERE r.id=? AND r.practice_id=? AND r.status='revoked' AND r.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      auth.user.id,
      auth.user.practiceId,
      now,
      referralId,
      auth.user.practiceId,
      now,
    ),
  ]);
  const row = results[0]?.results[0];
  return row
    ? reply(request, env, { referral: referralSummary(row) })
    : reply(request, env, { error: "referral_update_conflict" }, 409);
}

async function referralByHash(env: V3Env, hashes: readonly [string, string]) {
  return v3db(env).prepare(
    `SELECT r.id,r.practice_id,r.issuer_user_id,r.intended_physician_user_id,
            r.provider_profile_id,r.status,r.code_hint,r.purpose_label,
            r.provider_display_name,r.specialty_name,r.practice_display_name,
            r.max_uses,r.use_count,r.expires_at,r.revoked_at,r.created_at,r.updated_at
     FROM referral_invites r
     JOIN provider_profiles p ON p.id=r.provider_profile_id
     JOIN practice_memberships m
       ON m.practice_id=r.practice_id AND m.user_id=r.intended_physician_user_id
     JOIN runtime_users u ON u.id=r.intended_physician_user_id
     WHERE r.code_hash IN (?,?) AND p.directory_status<>'suspended'
       AND m.role='physician' AND m.status='active'
       AND u.role='physician' AND u.status='active' AND u.irimc_status='verified'`,
  ).bind(hashes[0], hashes[1]).first<ReferralRow>();
}

function availableForNewRedemption(row: ReferralRow) {
  return row.status === "active" &&
    Date.parse(row.expires_at) > Date.now() &&
    row.use_count < row.max_uses;
}

async function inspectReferral(request: Request, env: V3Env) {
  const secret = referralSecret(env);
  if (!secret) return reply(request, env, { error: "referral_service_not_configured" }, 503);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await consumeRate(env, await rateKey(secret, `inspect-ip:${ip}`), 60))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = parseCode(body?.code);
  if (!code) return reply(request, env, { error: "referral_unavailable" }, 404);
  const referral = await referralByHash(env, await codeHashCandidates(env, secret, code));
  if (!referral || !availableForNewRedemption(referral)) {
    return reply(request, env, { error: "referral_unavailable" }, 404);
  }
  const inspection: ReferralInspection = {
    provider: {
      displayName: referral.provider_display_name,
      specialtyName: referral.specialty_name,
      practiceDisplayName: referral.practice_display_name,
    },
    purposeLabel: referral.purpose_label ?? undefined,
    expiresAt: referral.expires_at,
    remainingUses: referral.max_uses - referral.use_count,
  };
  return reply(request, env, { referral: inspection });
}

async function existingRedemption(
  env: V3Env,
  referralId: string,
  patientAccountId: string,
) {
  return v3db(env).prepare(
    `SELECT id,referral_id,patient_account_id,status,patient_proofing_status_at_redeem,
            redeemed_at,updated_at
     FROM referral_redemptions WHERE referral_id=? AND patient_account_id=?`,
  ).bind(referralId, patientAccountId).first<RedemptionRow>();
}

async function redeemReferral(request: Request, env: V3Env) {
  if (!enabled(env.PATIENT_IDENTITY_V2_ENABLED)) {
    return reply(request, env, { error: "patient_identity_required" }, 403);
  }
  const patient = await requirePatientAccountSession(request, env);
  if (!patient) return reply(request, env, { error: "patient_auth_required" }, 401);
  if (patient.proofingStatus === "rejected") {
    return reply(request, env, { error: "patient_identity_ineligible" }, 403);
  }
  const secret = referralSecret(env);
  if (!secret) return reply(request, env, { error: "referral_service_not_configured" }, 503);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const [ipAllowed, accountAllowed] = await Promise.all([
    consumeRate(env, await rateKey(secret, `redeem-ip:${ip}`), 40),
    consumeRate(env, await rateKey(secret, `redeem-account:${patient.patientAccountId}`), 20),
  ]);
  if (!ipAllowed || !accountAllowed) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const body = await request.json().catch(() => null) as {
    code?: unknown;
    confirmed?: unknown;
  } | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const code = parseCode(body?.code);
  if (!code) return reply(request, env, { error: "referral_unavailable" }, 404);
  const referral = await referralByHash(env, await codeHashCandidates(env, secret, code));
  if (!referral) return reply(request, env, { error: "referral_unavailable" }, 404);
  const existing = await existingRedemption(env, referral.id, patient.patientAccountId);
  if (existing) return reply(request, env, { redemption: redemptionView(existing, referral) });
  if (!availableForNewRedemption(referral)) {
    return reply(request, env, { error: "referral_unavailable" }, 404);
  }
  const redemptionId = crypto.randomUUID();
  const now = v3now();
  const database = v3db(env);
  try {
    const results = await database.batch<RedemptionRow>([
      database.prepare(
        `INSERT INTO referral_redemptions
         (id,referral_id,patient_account_id,practice_id,intended_physician_user_id,
          status,patient_proofing_status_at_redeem,redeemed_at,updated_at)
         SELECT ?,r.id,?,r.practice_id,r.intended_physician_user_id,
                'pending_care_relationship',?,?,?
         FROM referral_invites r
         JOIN provider_profiles p ON p.id=r.provider_profile_id
         JOIN practice_memberships m
           ON m.practice_id=r.practice_id AND m.user_id=r.intended_physician_user_id
         JOIN runtime_users u ON u.id=r.intended_physician_user_id
         WHERE r.id=? AND r.status='active' AND r.expires_at>?
           AND r.use_count<r.max_uses AND p.directory_status<>'suspended'
           AND m.role='physician' AND m.status='active'
           AND u.role='physician' AND u.status='active' AND u.irimc_status='verified'
         RETURNING id,referral_id,patient_account_id,status,
                   patient_proofing_status_at_redeem,redeemed_at,updated_at`,
      ).bind(
        redemptionId,
        patient.patientAccountId,
        patient.proofingStatus,
        now,
        now,
        referral.id,
        now,
      ),
      database.prepare(
        `UPDATE referral_invites
         SET use_count=use_count+1,
             status=CASE WHEN use_count+1>=max_uses THEN 'exhausted' ELSE status END,
             updated_at=?
         WHERE id=? AND EXISTS(SELECT 1 FROM referral_redemptions WHERE id=?)`,
      ).bind(now, referral.id, redemptionId),
      database.prepare(
        `INSERT INTO audit_log
         (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
         SELECT ?,NULL,?,'referral.redeemed','referral_redemption',d.id,?,?
         FROM referral_redemptions d WHERE d.id=?`,
      ).bind(
        crypto.randomUUID(),
        referral.practice_id,
        JSON.stringify({ patientAccountId: patient.patientAccountId, referralId: referral.id }),
        now,
        redemptionId,
      ),
      database.prepare(
        `INSERT INTO patient_account_security_events
         (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
         SELECT ?,?,'patient_account.referral_redeemed','patient',?,?,?
         FROM referral_redemptions d WHERE d.id=?`,
      ).bind(
        crypto.randomUUID(),
        patient.patientAccountId,
        patient.patientAccountId,
        JSON.stringify({ referralId: referral.id, practiceId: referral.practice_id }),
        now,
        redemptionId,
      ),
    ]);
    const redemption = results[0]?.results[0];
    if (!redemption) {
      return reply(request, env, { error: "referral_unavailable" }, 404);
    }
    return reply(
      request,
      env,
      { redemption: redemptionView(redemption, referral) },
      201,
    );
  } catch {
    const concurrent = await existingRedemption(env, referral.id, patient.patientAccountId);
    return concurrent
      ? reply(request, env, { redemption: redemptionView(concurrent, referral) })
      : reply(request, env, { error: "referral_unavailable" }, 404);
  }
}

export async function referralServiceRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/referrals" && !url.pathname.startsWith("/v1/referrals/")) {
    return null;
  }
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (url.pathname === "/v1/referrals/capabilities" && request.method === "GET") {
    const referralService = enabled(env.REFERRAL_SERVICE_ENABLED);
    return reply(request, env, {
      referralService,
      patientRedemption: referralService && enabled(env.PATIENT_IDENTITY_V2_ENABLED),
    });
  }
  if (!enabled(env.REFERRAL_SERVICE_ENABLED)) {
    return reply(request, env, { error: "referral_service_disabled" }, 403);
  }
  if (url.pathname === "/v1/referrals") {
    if (request.method === "GET") return listReferrals(request, env);
    if (request.method === "POST") return issueReferral(request, env);
  }
  if (url.pathname === "/v1/referrals/inspect" && request.method === "POST") {
    return inspectReferral(request, env);
  }
  if (url.pathname === "/v1/referrals/redeem" && request.method === "POST") {
    return redeemReferral(request, env);
  }
  const revoke = url.pathname.match(/^\/v1\/referrals\/([^/]+)\/revoke$/);
  if (revoke && request.method === "POST") {
    const referralId = safeId(revoke[1]);
    if (!referralId) return reply(request, env, { error: "invalid_referral_id" }, 400);
    return revokeReferral(request, env, referralId);
  }
  return reply(request, env, { error: "not_found" }, 404);
}
