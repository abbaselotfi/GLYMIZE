import {
  patientLegacyLinkProvenances,
  patientLegacyLinkVerificationMethods,
  type PatientLegacyLinkProvenance,
  type PatientLegacyLinkVerificationMethod,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { issuePortalSessionForVerifiedPatientLink } from "./platform-patient-portal";
import { createCredential, credentialMatches, validCredentialValue } from "./platform-v3-credential";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";
import {
  encryptClinicalPayload,
  hmacHex,
  normalizePatientCode,
  openAuthPayload,
  randomToken,
  sealAuthPayload,
  sha256Hex,
  validateIranianNationalId,
} from "./runtime-security";

const IDENTITY_ACCESS_CONTEXT = "PATIENT-IDENTITY-ACCESS-V1";
const RATE_WINDOW_MS = 15 * 60 * 1000;

type PatientAccountRow = {
  id: string;
  status: "active" | "disabled" | "closed";
  proofing_status: "unverified" | "pending" | "verified" | "rejected";
  password_hash: string | null;
  password_salt: string | null;
  password_iterations: number | null;
};

type PatientAccess = {
  kind: "patient_identity_access";
  patientAccountId: string;
  sessionId: string;
  expiresAt: number;
};

type PatientIdentityAuth = {
  access: PatientAccess;
  account: PatientAccountRow;
};

type LegacyLinkRow = {
  portal_user_id: string;
  patient_account_id: string;
  practice_id: string;
  link_status: "pending" | "verified" | "rejected" | "revoked";
  provenance: PatientLegacyLinkProvenance;
  verification_method: PatientLegacyLinkVerificationMethod;
  requested_by_runtime_user_id: string | null;
  verified_by_runtime_user_id: string | null;
  verified_at: string | null;
  reviewed_at: string | null;
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
            "access-control-allow-methods": "GET, POST, OPTIONS",
            vary: "Origin",
          }
        : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function lookupSecret(env: V3Env) {
  const value = String(env.PATIENT_IDENTITY_LOOKUP_SECRET ?? "").trim();
  return value || null;
}

function clinicalSecret(env: V3Env) {
  const value = String(env.CLINICAL_DATA_MASTER_KEY ?? "").trim();
  return value || null;
}

function recordLinkingEnabled(env: V3Env) {
  return enabled(env.PATIENT_RECORD_LINKING_ENABLED);
}

function safeId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) ? id : null;
}

async function rate(env: V3Env, key: string, limit: number) {
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

async function securityEvent(
  env: V3Env,
  patientAccountId: string | null,
  eventType: string,
  actorType: "patient" | "runtime_user" | "platform" | "anonymous",
  actorId?: string,
  meta?: unknown,
) {
  await v3db(env).prepare(
    `INSERT INTO patient_account_security_events
     (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
     VALUES(?,?,?,?,?,?,?)`,
  ).bind(
    crypto.randomUUID(),
    patientAccountId,
    eventType,
    actorType,
    actorId ?? null,
    meta === undefined ? null : JSON.stringify(meta),
    v3now(),
  ).run();
}

async function hasVerifiedLegacyLink(env: V3Env, patientAccountId: string) {
  const row = await v3db(env).prepare(
    `SELECT 1 AS linked
     FROM portal_user_account_links l
     JOIN portal_users u ON u.id=l.portal_user_id
     WHERE l.patient_account_id=? AND l.link_status='verified' AND u.status='active'
     LIMIT 1`,
  ).bind(patientAccountId).first<{ linked: number }>();
  return Boolean(row);
}

async function accountSummary(env: V3Env, account: PatientAccountRow) {
  return {
    id: account.id,
    status: account.status,
    proofingStatus: account.proofing_status,
    linkedClinicalRecord: await hasVerifiedLegacyLink(env, account.id),
  };
}

async function requirePatientIdentity(
  request: Request,
  env: V3Env,
): Promise<PatientIdentityAuth | null> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const [iv, ciphertext, extra] = bearer.split(".");
  if (!iv || !ciphertext || extra) return null;
  const access = await openAuthPayload<PatientAccess>(
    { iv, ciphertext },
    env,
    IDENTITY_ACCESS_CONTEXT,
  );
  if (!access || access.kind !== "patient_identity_access" || access.expiresAt <= Date.now()) {
    return null;
  }
  const account = await v3db(env).prepare(
    `SELECT a.id,a.status,a.proofing_status,a.password_hash,a.password_salt,a.password_iterations
     FROM patient_accounts a
     JOIN patient_account_sessions s ON s.patient_account_id=a.id
     WHERE a.id=? AND s.id=? AND s.revoked_at IS NULL AND s.expires_at>?`,
  ).bind(access.patientAccountId, access.sessionId, v3now()).first<PatientAccountRow>();
  return account?.status === "active" ? { access, account } : null;
}

function legacyLinkSummary(row: LegacyLinkRow) {
  return {
    portalUserId: row.portal_user_id,
    patientAccountId: row.patient_account_id,
    practiceId: row.practice_id,
    status: row.link_status,
    provenance: row.provenance,
    verificationMethod: row.verification_method,
    requestedByRuntimeUserId: row.requested_by_runtime_user_id ?? undefined,
    verifiedByRuntimeUserId: row.verified_by_runtime_user_id ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function identityHash(env: V3Env, nationalId: string) {
  const secret = lookupSecret(env);
  if (!secret) throw new Error("PATIENT_IDENTITY_LOOKUP_SECRET_NOT_CONFIGURED");
  return hmacHex(secret, `patient-national-id:${nationalId}`);
}

async function issueSession(
  env: V3Env,
  account: PatientAccountRow,
  persistent: boolean,
  deviceLabel: string,
  familyId?: string,
  parentTokenId?: string,
) {
  const sessionId = crypto.randomUUID();
  const refreshToken = randomToken(32);
  const refreshHash = await sha256Hex(refreshToken);
  const ttl = persistent ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const refreshExpiresAt = new Date(Date.now() + ttl).toISOString();
  const database = v3db(env);
  const insert = database.prepare(
    `INSERT INTO patient_account_sessions
     (id,patient_account_id,token_hash,family_id,parent_token_id,replaced_by_token_id,
      persistent,expires_at,revoked_at,compromised_at,created_at,last_used_at,device_label)
     VALUES(?,?,?,?,?,NULL,?,?,NULL,NULL,?,?,?)`,
  ).bind(
    sessionId,
    account.id,
    refreshHash,
    familyId ?? sessionId,
    parentTokenId ?? null,
    persistent ? 1 : 0,
    refreshExpiresAt,
    v3now(),
    v3now(),
    deviceLabel.slice(0, 180) || null,
  );
  if (parentTokenId) {
    const rotatedAt = v3now();
    const consumed = await database.prepare(
      `UPDATE patient_account_sessions
       SET revoked_at=?,last_used_at=?,replaced_by_token_id=?
       WHERE id=? AND revoked_at IS NULL`,
    ).bind(rotatedAt, rotatedAt, sessionId, parentTokenId).run();
    if ((consumed.meta.changes ?? 0) !== 1) {
      throw new Error("refresh_token_rotation_conflict");
    }
    await insert.run();
  } else {
    await insert.run();
  }
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const sealed = await sealAuthPayload({
    kind: "patient_identity_access",
    patientAccountId: account.id,
    sessionId,
    expiresAt,
  } satisfies PatientAccess, env, IDENTITY_ACCESS_CONTEXT);
  return {
    accessToken: `${sealed.iv}.${sealed.ciphertext}`,
    accessExpiresAt: new Date(expiresAt).toISOString(),
    refreshToken,
    refreshExpiresAt,
    persistent,
    account: await accountSummary(env, account),
  };
}

async function register(request: Request, env: V3Env) {
  if (!enabled(env.PATIENT_SELF_REGISTRATION_ENABLED)) {
    return reply(request, env, { error: "self_registration_disabled" }, 403);
  }
  const lookupKey = lookupSecret(env);
  const encryptionKey = clinicalSecret(env);
  if (!lookupKey || !encryptionKey) {
    return reply(request, env, { error: "identity_service_not_configured" }, 503);
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return reply(request, env, { error: "invalid_json" }, 400); }
  const nationalId = normalizePatientCode(String(body.nationalId ?? ""));
  const password = String(body.password ?? "");
  if (!validateIranianNationalId(nationalId) || !validCredentialValue(password)) {
    return reply(request, env, { error: "registration_unavailable" }, 422);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const [lookupHash, ipRateKey] = await Promise.all([
    identityHash(env, nationalId),
    hmacHex(lookupKey, `patient-register-ip:${ip}`),
  ]);
  if (!(await rate(env, ipRateKey, 10))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const accountId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const credential = await createCredential(password);
  const encrypted = await encryptClinicalPayload(
    { value: nationalId },
    encryptionKey,
    `patient-account-identity:${accountId}:${identityId}`,
  );
  const now = v3now();
  try {
    await v3db(env).batch([
      v3db(env).prepare(
        `INSERT INTO patient_accounts
         (id,status,proofing_status,password_hash,password_salt,password_iterations,
          password_updated_at,credentials_revoked_at,created_at,updated_at,closed_at)
         VALUES(?,'active','unverified',?,?,?,?,NULL,?,?,NULL)`,
      ).bind(accountId, credential.hash, credential.salt, credential.iterations, now, now, now),
      v3db(env).prepare(
        `INSERT INTO patient_account_identities
         (id,patient_account_id,identity_kind,lookup_hash,value_ciphertext,value_iv,
          value_auth_tag,display_mask,verification_status,verification_source,
          verified_at,is_primary,created_at,updated_at)
         VALUES(?,?,'national_id',?,?,?,?,?,'unverified','self_registration',NULL,1,?,?)`,
      ).bind(
        identityId,
        accountId,
        lookupHash,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        `******${nationalId.slice(-4)}`,
        now,
        now,
      ),
      v3db(env).prepare(
        `INSERT INTO patient_account_security_events
         (id,patient_account_id,event_type,actor_type,actor_id,meta_json,created_at)
         VALUES(?,?,'patient_account.registered','anonymous',NULL,?,?)`,
      ).bind(crypto.randomUUID(), accountId, JSON.stringify({ proofingStatus: "unverified" }), now),
    ]);
  } catch {
    return reply(request, env, { error: "registration_unavailable" }, 409);
  }
  return reply(request, env, {
    accountId,
    proofingStatus: "unverified",
    linkedClinicalRecord: false,
  }, 201);
}

async function login(request: Request, env: V3Env) {
  const secret = lookupSecret(env);
  if (!secret) return reply(request, env, { error: "identity_service_not_configured" }, 503);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return reply(request, env, { error: "invalid_json" }, 400); }
  const nationalId = normalizePatientCode(String(body.nationalId ?? ""));
  const password = String(body.password ?? "");
  if (!validateIranianNationalId(nationalId) || !validCredentialValue(password)) {
    return reply(request, env, { error: "invalid_credentials" }, 401);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const lookupHash = await identityHash(env, nationalId);
  const [accountRateKey, ipRateKey] = await Promise.all([
    hmacHex(secret, `patient-login-account:${lookupHash}`),
    hmacHex(secret, `patient-login-ip:${ip}`),
  ]);
  const [accountAllowed, ipAllowed] = await Promise.all([
    rate(env, accountRateKey, 6),
    rate(env, ipRateKey, 30),
  ]);
  if (!accountAllowed || !ipAllowed) return reply(request, env, { error: "rate_limited" }, 429);
  const account = await v3db(env).prepare(
    `SELECT a.id,a.status,a.proofing_status,a.password_hash,a.password_salt,a.password_iterations
     FROM patient_account_identities i
     JOIN patient_accounts a ON a.id=i.patient_account_id
     WHERE i.identity_kind='national_id' AND i.lookup_hash=? LIMIT 1`,
  ).bind(lookupHash).first<PatientAccountRow>();
  if (
    !account ||
    account.status !== "active" ||
    !account.password_hash ||
    !account.password_salt ||
    !account.password_iterations ||
    !(await credentialMatches(password, {
      hash: account.password_hash,
      salt: account.password_salt,
      iterations: account.password_iterations,
    }))
  ) {
    return reply(request, env, { error: "invalid_credentials" }, 401);
  }
  await securityEvent(env, account.id, "patient_account.login", "patient", account.id);
  return reply(request, env, await issueSession(
    env,
    account,
    body.rememberMe === true,
    String(body.deviceLabel ?? "patient-web"),
  ));
}

async function session(request: Request, env: V3Env) {
  const auth = await requirePatientIdentity(request, env);
  if (!auth) return reply(request, env, { error: "auth_required" }, 401);
  return reply(request, env, {
    account: await accountSummary(env, auth.account),
  });
}

async function patientLinks(request: Request, env: V3Env) {
  const auth = await requirePatientIdentity(request, env);
  if (!auth) return reply(request, env, { error: "auth_required" }, 401);
  const rows = await v3db(env).prepare(
    `SELECT l.portal_user_id,u.practice_id,p.name AS practice_name,
            l.provenance,l.verified_at
     FROM portal_user_account_links l
     JOIN portal_users u ON u.id=l.portal_user_id
     JOIN practices p ON p.id=u.practice_id
     WHERE l.patient_account_id=? AND l.link_status='verified'
       AND l.verified_at IS NOT NULL AND u.status='active'
     ORDER BY l.verified_at DESC`,
  ).bind(auth.account.id).all<{
    portal_user_id: string;
    practice_id: string;
    practice_name: string;
    provenance: PatientLegacyLinkProvenance;
    verified_at: string;
  }>();
  return reply(request, env, {
    links: rows.results.map((row) => ({
      portalUserId: row.portal_user_id,
      practiceId: row.practice_id,
      practiceName: row.practice_name,
      provenance: row.provenance,
      verifiedAt: row.verified_at,
    })),
  });
}

async function exchangeLinkedPortalSession(
  request: Request,
  env: V3Env,
  portalUserId: string,
) {
  const auth = await requirePatientIdentity(request, env);
  if (!auth) return reply(request, env, { error: "auth_required" }, 401);
  if (auth.account.proofing_status !== "verified") {
    return reply(request, env, { error: "identity_proofing_required" }, 403);
  }
  if (!enabled(env.PATIENT_PORTAL_V1_ENABLED)) {
    return reply(request, env, { error: "legacy_portal_disabled" }, 403);
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return reply(request, env, { error: "invalid_json" }, 400); }
  const secret = lookupSecret(env);
  if (!secret) return reply(request, env, { error: "identity_service_not_configured" }, 503);
  const exchangeRateKey = await hmacHex(
    secret,
    `patient-portal-exchange:${auth.account.id}`,
  );
  if (!(await rate(env, exchangeRateKey, 30))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const portalSession = await issuePortalSessionForVerifiedPatientLink(
    env,
    auth.account.id,
    portalUserId,
    body.rememberMe === true,
    String(body.deviceLabel ?? "patient-identity-exchange"),
  );
  if (!portalSession) {
    return reply(request, env, { error: "verified_link_unavailable" }, 404);
  }
  await securityEvent(
    env,
    auth.account.id,
    "patient_account.portal_session_exchanged",
    "patient",
    auth.account.id,
    { portalUserId },
  );
  return reply(request, env, portalSession);
}

async function requireLinkReviewer(request: Request, env: V3Env) {
  const auth = await v3RequireRuntime(request, env);
  if (!auth) return { error: reply(request, env, { error: "auth_required" }, 401) } as const;
  if (!auth.user.permissions.includes("admin.users")) {
    return { error: reply(request, env, { error: "permission_denied" }, 403) } as const;
  }
  return { auth } as const;
}

async function adminLegacyLinks(request: Request, env: V3Env) {
  const reviewer = await requireLinkReviewer(request, env);
  if ("error" in reviewer) return reviewer.error!;
  const status = new URL(request.url).searchParams.get("status");
  if (status && !["pending", "verified", "rejected", "revoked"].includes(status)) {
    return reply(request, env, { error: "invalid_status" }, 400);
  }
  const rows = await v3db(env).prepare(
    `SELECT l.portal_user_id,l.patient_account_id,u.practice_id,l.link_status,
            l.provenance,l.verification_method,l.requested_by_runtime_user_id,
            l.verified_by_runtime_user_id,l.verified_at,l.reviewed_at,
            l.created_at,l.updated_at
     FROM portal_user_account_links l
     JOIN portal_users u ON u.id=l.portal_user_id
     WHERE u.practice_id=?
     ORDER BY l.updated_at DESC LIMIT 200`,
  ).bind(reviewer.auth.user.practiceId).all<LegacyLinkRow>();
  return reply(request, env, {
    links: rows.results
      .filter((row) => !status || row.link_status === status)
      .map(legacyLinkSummary),
  });
}

async function requestLegacyLink(request: Request, env: V3Env) {
  if (!recordLinkingEnabled(env)) {
    return reply(request, env, { error: "record_linking_disabled" }, 403);
  }
  const runtime = await v3RequireRuntime(request, env);
  if (!runtime) return reply(request, env, { error: "auth_required" }, 401);
  if (!runtime.user.permissions.includes("handoff.read")) {
    return reply(request, env, { error: "permission_denied" }, 403);
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return reply(request, env, { error: "invalid_json" }, 400); }
  const portalUserId = safeId(body.portalUserId);
  const patientAccountId = safeId(body.patientAccountId);
  const provenance = String(body.provenance ?? "") as PatientLegacyLinkProvenance;
  const verificationMethod = String(
    body.verificationMethod ?? "",
  ) as PatientLegacyLinkVerificationMethod;
  if (
    !portalUserId ||
    !patientAccountId ||
    !patientLegacyLinkProvenances.includes(provenance) ||
    !patientLegacyLinkVerificationMethods.includes(verificationMethod)
  ) {
    return reply(request, env, { error: "invalid_link_request" }, 422);
  }
  const [portalUser, account, existing] = await Promise.all([
    v3db(env).prepare(
      `SELECT id FROM portal_users
       WHERE id=? AND practice_id=? AND status='active'`,
    ).bind(portalUserId, runtime.user.practiceId).first<{ id: string }>(),
    v3db(env).prepare(
      `SELECT id FROM patient_accounts WHERE id=? AND status='active'`,
    ).bind(patientAccountId).first<{ id: string }>(),
    v3db(env).prepare(
      `SELECT link_status FROM portal_user_account_links WHERE portal_user_id=?`,
    ).bind(portalUserId).first<{ link_status: string }>(),
  ]);
  if (!portalUser || !account) {
    return reply(request, env, { error: "link_target_unavailable" }, 404);
  }
  if (existing) return reply(request, env, { error: "link_already_exists" }, 409);
  const now = v3now();
  await v3db(env).prepare(
    `INSERT INTO portal_user_account_links
     (portal_user_id,patient_account_id,link_status,provenance,
      verified_by_runtime_user_id,verified_at,revoked_at,created_at,updated_at,
      requested_by_runtime_user_id,verification_method,reviewed_at)
     VALUES(?,?,'pending',?,?,NULL,NULL,?,?,?,?,NULL)`,
  ).bind(
    portalUserId,
    patientAccountId,
    provenance,
    null,
    now,
    now,
    runtime.user.id,
    verificationMethod,
  ).run();
  await securityEvent(
    env,
    patientAccountId,
    "patient_account.legacy_link_requested",
    "runtime_user",
    runtime.user.id,
    { portalUserId, practiceId: runtime.user.practiceId, provenance, verificationMethod },
  );
  const row = await readLegacyLink(env, portalUserId, runtime.user.practiceId);
  return reply(request, env, { link: row ? legacyLinkSummary(row) : null }, 201);
}

async function readLegacyLink(env: V3Env, portalUserId: string, practiceId: string) {
  return v3db(env).prepare(
    `SELECT l.portal_user_id,l.patient_account_id,u.practice_id,l.link_status,
            l.provenance,l.verification_method,l.requested_by_runtime_user_id,
            l.verified_by_runtime_user_id,l.verified_at,l.reviewed_at,
            l.created_at,l.updated_at
     FROM portal_user_account_links l
     JOIN portal_users u ON u.id=l.portal_user_id
     WHERE l.portal_user_id=? AND u.practice_id=?`,
  ).bind(portalUserId, practiceId).first<LegacyLinkRow>();
}

async function decideLegacyLink(
  request: Request,
  env: V3Env,
  portalUserId: string,
  decision: "verify" | "reject" | "revoke",
) {
  if (!recordLinkingEnabled(env)) {
    return reply(request, env, { error: "record_linking_disabled" }, 403);
  }
  const reviewer = await requireLinkReviewer(request, env);
  if ("error" in reviewer) return reviewer.error!;
  if (reviewer.auth.user.role !== "physician") {
    return reply(request, env, { error: "physician_review_required" }, 403);
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return reply(request, env, { error: "invalid_json" }, 400); }
  if (body.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 422);
  }
  const link = await readLegacyLink(env, portalUserId, reviewer.auth.user.practiceId);
  if (!link) return reply(request, env, { error: "link_not_found" }, 404);
  const expected = decision === "revoke" ? "verified" : "pending";
  if (link.link_status !== expected) {
    return reply(request, env, { error: "invalid_link_transition" }, 409);
  }
  const now = v3now();
  let changes = 0;
  if (decision === "verify") {
    const results = await v3db(env).batch([
      v3db(env).prepare(
        `UPDATE portal_user_account_links
         SET link_status='verified',verified_by_runtime_user_id=?,verified_at=?,
             reviewed_at=?,updated_at=?
         WHERE portal_user_id=? AND link_status='pending'
           AND EXISTS (
             SELECT 1 FROM patient_accounts
             WHERE id=? AND status='active' AND proofing_status<>'rejected'
           )`,
      ).bind(
        reviewer.auth.user.id,
        now,
        now,
        now,
        portalUserId,
        link.patient_account_id,
      ),
      v3db(env).prepare(
        `UPDATE patient_accounts
         SET proofing_status='verified',updated_at=?
         WHERE id=? AND status='active' AND proofing_status IN ('unverified','pending')`,
      ).bind(now, link.patient_account_id),
    ]);
    changes = Number(results[0]?.meta.changes ?? 0);
  } else if (decision === "reject") {
    const result = await v3db(env).prepare(
      `UPDATE portal_user_account_links
       SET link_status='rejected',verified_by_runtime_user_id=?,reviewed_at=?,updated_at=?
       WHERE portal_user_id=? AND link_status='pending'`,
    ).bind(reviewer.auth.user.id, now, now, portalUserId).run();
    changes = Number(result.meta.changes ?? 0);
  } else {
    const results = await v3db(env).batch([
      v3db(env).prepare(
        `UPDATE portal_user_account_links
         SET link_status='revoked',revoked_at=?,reviewed_at=?,updated_at=?
         WHERE portal_user_id=? AND link_status='verified'`,
      ).bind(now, now, now, portalUserId),
      v3db(env).prepare(
        `UPDATE portal_refresh_tokens
         SET revoked_at=COALESCE(revoked_at,?),last_used_at=?
         WHERE portal_user_id=? AND auth_source='patient_identity'
           AND revoked_at IS NULL`,
      ).bind(now, now, portalUserId),
    ]);
    changes = Number(results[0]?.meta.changes ?? 0);
  }
  if (changes !== 1) return reply(request, env, { error: "link_transition_conflict" }, 409);
  await securityEvent(
    env,
    link.patient_account_id,
    `patient_account.legacy_link_${
      decision === "verify" ? "verified" : decision === "reject" ? "rejected" : "revoked"
    }`,
    "runtime_user",
    reviewer.auth.user.id,
    { portalUserId, practiceId: reviewer.auth.user.practiceId },
  );
  const updated = await readLegacyLink(env, portalUserId, reviewer.auth.user.practiceId);
  return reply(request, env, { link: updated ? legacyLinkSummary(updated) : null });
}

async function refresh(request: Request, env: V3Env) {
  const secret = lookupSecret(env);
  if (!secret) return reply(request, env, { error: "identity_service_not_configured" }, 503);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return reply(request, env, { error: "invalid_json" }, 400); }
  const refreshToken = String(body.refreshToken ?? "").trim();
  if (refreshToken.length < 32 || refreshToken.length > 200) {
    return reply(request, env, { error: "auth_required" }, 401);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipRateKey = await hmacHex(secret, `patient-refresh-ip:${ip}`);
  if (!(await rate(env, ipRateKey, 120))) {
    return reply(request, env, { error: "rate_limited" }, 429);
  }
  const tokenHash = await sha256Hex(refreshToken);
  const token = await v3db(env).prepare(
    `SELECT id,patient_account_id,family_id,persistent,expires_at,revoked_at,replaced_by_token_id
     FROM patient_account_sessions WHERE token_hash=?`,
  ).bind(tokenHash).first<{
    id: string;
    patient_account_id: string;
    family_id: string;
    persistent: 0 | 1;
    expires_at: string;
    revoked_at: string | null;
    replaced_by_token_id: string | null;
  }>();
  if (!token || Date.parse(token.expires_at) <= Date.now()) {
    return reply(request, env, { error: "auth_required" }, 401);
  }
  if (token.revoked_at) {
    if (token.replaced_by_token_id) {
      const compromisedAt = v3now();
      await v3db(env).prepare(
        `UPDATE patient_account_sessions
         SET revoked_at=COALESCE(revoked_at,?),compromised_at=?
         WHERE family_id=?`,
      ).bind(compromisedAt, compromisedAt, token.family_id).run();
      await securityEvent(
        env,
        token.patient_account_id,
        "patient_account.refresh_reuse_detected",
        "anonymous",
      );
      return reply(request, env, { error: "refresh_token_reuse_detected" }, 401);
    }
    return reply(request, env, { error: "auth_required" }, 401);
  }
  const account = await v3db(env).prepare(
    `SELECT id,status,proofing_status,password_hash,password_salt,password_iterations
     FROM patient_accounts WHERE id=?`,
  ).bind(token.patient_account_id).first<PatientAccountRow>();
  if (!account || account.status !== "active") {
    return reply(request, env, { error: "auth_required" }, 401);
  }
  try {
    return reply(request, env, await issueSession(
      env,
      account,
      token.persistent === 1,
      String(body.deviceLabel ?? "patient-refresh"),
      token.family_id,
      token.id,
    ));
  } catch {
    return reply(request, env, { error: "refresh_token_replayed" }, 401);
  }
}

async function logout(request: Request, env: V3Env) {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const [iv, ciphertext, extra] = bearer.split(".");
  if (!iv || !ciphertext || extra) return reply(request, env, { error: "auth_required" }, 401);
  const access = await openAuthPayload<PatientAccess>(
    { iv, ciphertext },
    env,
    IDENTITY_ACCESS_CONTEXT,
  );
  if (!access || access.kind !== "patient_identity_access") {
    return reply(request, env, { error: "auth_required" }, 401);
  }
  await v3db(env).prepare(
    `UPDATE patient_account_sessions SET revoked_at=?
     WHERE id=? AND patient_account_id=? AND revoked_at IS NULL`,
  ).bind(v3now(), access.sessionId, access.patientAccountId).run();
  await securityEvent(
    env,
    access.patientAccountId,
    "patient_account.logout",
    "patient",
    access.patientAccountId,
  );
  return reply(request, env, { ok: true });
}

export async function patientIdentityRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/patient-identity/")) return null;
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (url.pathname === "/v1/patient-identity/capabilities" && request.method === "GET") {
    return reply(request, env, {
      patientIdentityV2: enabled(env.PATIENT_IDENTITY_V2_ENABLED),
      selfRegistration:
        enabled(env.PATIENT_IDENTITY_V2_ENABLED) &&
        enabled(env.PATIENT_SELF_REGISTRATION_ENABLED),
      smsOtp:
        enabled(env.PATIENT_IDENTITY_V2_ENABLED) &&
        enabled(env.PATIENT_SMS_OTP_ENABLED),
      recordLinking:
        enabled(env.PATIENT_IDENTITY_V2_ENABLED) &&
        recordLinkingEnabled(env),
    });
  }
  if (!enabled(env.PATIENT_IDENTITY_V2_ENABLED)) {
    return reply(request, env, { error: "patient_identity_disabled" }, 403);
  }
  if (url.pathname === "/v1/patient-identity/register" && request.method === "POST") {
    return register(request, env);
  }
  if (url.pathname === "/v1/patient-identity/auth/login" && request.method === "POST") {
    return login(request, env);
  }
  if (url.pathname === "/v1/patient-identity/auth/refresh" && request.method === "POST") {
    return refresh(request, env);
  }
  if (url.pathname === "/v1/patient-identity/auth/logout" && request.method === "POST") {
    return logout(request, env);
  }
  if (url.pathname === "/v1/patient-identity/session" && request.method === "GET") {
    return session(request, env);
  }
  if (url.pathname === "/v1/patient-identity/links" && request.method === "GET") {
    return patientLinks(request, env);
  }
  const portalExchange = url.pathname.match(
    /^\/v1\/patient-identity\/links\/([^/]+)\/portal-session$/,
  );
  if (portalExchange && request.method === "POST") {
    const portalUserId = safeId(portalExchange[1]);
    if (!portalUserId) return reply(request, env, { error: "invalid_link_id" }, 400);
    return exchangeLinkedPortalSession(request, env, portalUserId);
  }
  if (url.pathname === "/v1/patient-identity/legacy-links" && request.method === "GET") {
    return adminLegacyLinks(request, env);
  }
  if (url.pathname === "/v1/patient-identity/legacy-links" && request.method === "POST") {
    return requestLegacyLink(request, env);
  }
  const decision = url.pathname.match(
    /^\/v1\/patient-identity\/legacy-links\/([^/]+)\/(verify|reject|revoke)$/,
  );
  if (decision && request.method === "POST") {
    const portalUserId = safeId(decision[1]);
    if (!portalUserId) return reply(request, env, { error: "invalid_link_id" }, 400);
    return decideLegacyLink(
      request,
      env,
      portalUserId,
      decision[2]! as "verify" | "reject" | "revoke",
    );
  }
  return reply(request, env, { error: "not_found" }, 404);
}
