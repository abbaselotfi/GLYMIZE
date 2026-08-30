
import adminHandler from "./index";
import {
  assistantInvitationEmailEnabled,
  resolvePublicAppBaseUrl,
} from "./platform-team-invitation-policy";
import {
  buildSequentialFileCodeCandidates,
  resolvePatientHandoffWriteMode,
} from "./patient-handoff-code-policy";
import { patientRecordV2Route } from "./platform-patient-record-v2";
import { createCredential, validCredentialValue } from "./platform-v3-credential";
import {
  defaultAssistantPermissions,
  defaultPhysicianPermissions,
  constantTimeEqual,
  decryptClinicalPayload,
  encryptClinicalPayload,
  hmacHex,
  maskIdentifier,
  normalizeEmail,
  normalizeIranMobile,
  normalizeMedicalCouncilCode,
  normalizePatientCode,
  openPayload,
  randomToken,
  sanitizeAssistantPermissions,
  sanitizeRuntimePermissions,
  sealPayload,
  sha256Hex,
  validLayoutPreset,
  validateIranianNationalId,
  type AssistantPermission,
  type RuntimePermission,
  type LayoutPreset,
  type RuntimeRole,
} from "./runtime-security";
import {
  RUNTIME_RULE_PACK_VERSION,
  buildEvidenceMessages,
  detectEvidenceLocale,
  evidenceForQuestion,
  extractiveEvidenceAnswer,
  uniqueEvidenceCitations,
} from "./runtime-evidence";

interface Env {
  ADMIN_ORIGIN: string;
  ADMIN_PATH_PREFIX: string;
  ALLOWED_GITHUB_LOGIN: string;
  GITHUB_REPOSITORY: string;
  GITHUB_BRANCH: string;
  CATALOG_PATH: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  AI_CONFIG_KV: KVNamespace;
  AI_CONFIG_MASTER_KEY: string;
  AI_RUNTIME_SHARED_SECRET: string;

  GLYMIZE_DB?: D1Database;
  CLINICAL_DATA_MASTER_KEY?: string;
  IRIMC_VERIFY_ENDPOINT?: string;
  PUBLIC_APP_URL?: string;
}

type UserStatus = "active" | "disabled";
type VerificationStatus = "verified" | "pending" | "unavailable";
type MembershipStatus = "active" | "disabled";

type AccessPayload = {
  kind: "runtime_access";
  userId: string;
  practiceId: string;
  sessionId: string;
  expiresAt: number;
};

type RuntimeUser = {
  id: string;
  role: RuntimeRole;
  status: UserStatus;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  medicalCouncilCode?: string;
  irimcStatus?: VerificationStatus;
  irimcVerifiedAt?: string;
  profilePhoto?: string;
  profilePhotoSource?: "irimc" | "user_upload" | "none";
  layoutPreset: LayoutPreset;
  practiceId: string;
  practiceName: string;
  permissions: RuntimePermission[];
};

type DbUserRow = {
  id: string;
  role: RuntimeRole;
  status: UserStatus;
  first_name: string;
  last_name: string;
  email_norm: string | null;
  mobile_norm: string | null;
  medical_council_code: string | null;
  irimc_status: VerificationStatus | null;
  irimc_verified_at: string | null;
  profile_photo: string | null;
  profile_photo_source: "irimc" | "user_upload" | "none" | null;
  layout_preset: LayoutPreset | null;
};

type DbMembershipRow = {
  practice_id: string;
  practice_name: string;
  role: RuntimeRole;
  status: MembershipStatus;
  permissions_json: string;
};

type AuthContext = {
  user: RuntimeUser;
  access: AccessPayload;
};

const COMMUNICATIONS_CONFIG_KEY = "communications:config:v1";
const COMMUNICATIONS_SMS_SECRET_KEY = "communications:secret:v1:sms_ir";
const COMMUNICATIONS_EMAIL_SECRET_KEY = "communications:secret:v1:resend";

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin === env.ADMIN_ORIGIN ? {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  } : {};
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function db(env: Env) {
  if (!env.GLYMIZE_DB) throw new Error("GLYMIZE_DB_NOT_CONFIGURED");
  return env.GLYMIZE_DB;
}

function clinicalSecret(env: Env) {
  const value = env.CLINICAL_DATA_MASTER_KEY?.trim();
  if (!value || value.length < 32) throw new Error("CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED");
  return value;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeName(value: unknown, max = 100) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.length >= 1 && text.length <= max ? text : null;
}

function safePhoto(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > 500_000) return null;
  if (/^https:\/\/[^\s]+$/i.test(text)) return text;
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(text)) return text;
  return null;
}

function fullPermissionsForPhysician(): RuntimePermission[] {
  return defaultPhysicianPermissions();
}

async function audit(env: Env, actorUserId: string | null, practiceId: string | null, action: string, targetType?: string, targetId?: string, meta?: unknown) {
  try {
    await db(env).prepare(
      `INSERT INTO audit_log
       (id, actor_user_id, practice_id, action, target_type, target_id, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      actorUserId,
      practiceId,
      action,
      targetType ?? null,
      targetId ?? null,
      meta ? JSON.stringify(meta) : null,
      nowIso(),
    ).run();
  } catch {
    // Audit failure must not expose or corrupt the primary operation.
  }
}

async function readRuntimeUser(env: Env, userId: string, practiceId: string): Promise<RuntimeUser | null> {
  const user = await db(env).prepare(
    `SELECT id, role, status, first_name, last_name, email_norm, mobile_norm,
            medical_council_code, irimc_status, irimc_verified_at,
            profile_photo, profile_photo_source, layout_preset
     FROM runtime_users WHERE id = ?`,
  ).bind(userId).first<DbUserRow>();
  if (!user || user.status !== "active") return null;

  const membership = await db(env).prepare(
    `SELECT m.practice_id, p.name AS practice_name, m.role, m.status, m.permissions_json
     FROM practice_memberships m
     JOIN practices p ON p.id = m.practice_id
     WHERE m.user_id = ? AND m.practice_id = ?`,
  ).bind(userId, practiceId).first<DbMembershipRow>();
  if (!membership || membership.status !== "active") return null;

  return {
    id: user.id,
    role: membership.role,
    status: user.status,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email_norm ?? undefined,
    mobile: user.mobile_norm ?? undefined,
    medicalCouncilCode: user.medical_council_code ?? undefined,
    irimcStatus: user.irimc_status ?? undefined,
    irimcVerifiedAt: user.irimc_verified_at ?? undefined,
    profilePhoto: user.profile_photo ?? undefined,
    profilePhotoSource: user.profile_photo_source ?? "none",
    layoutPreset: user.layout_preset ?? "auto",
    practiceId: membership.practice_id,
    practiceName: membership.practice_name,
    permissions: sanitizeRuntimePermissions(parseJson<unknown>(membership.permissions_json, [])),
  };
}

async function issueAccessToken(env: Env, user: RuntimeUser, sessionId: string) {
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const sealed = await sealPayload({
    kind: "runtime_access",
    userId: user.id,
    practiceId: user.practiceId,
    sessionId,
    expiresAt,
  } satisfies AccessPayload, env.SESSION_SECRET, "RUNTIME-ACCESS-V1");
  return {
    accessToken: `${sealed.iv}.${sealed.ciphertext}`,
    accessExpiresAt: new Date(expiresAt).toISOString(),
  };
}

async function decodeAccessToken(env: Env, token: string) {
  const [iv, ciphertext, extra] = token.split(".");
  if (!iv || !ciphertext || extra) return null;
  const payload = await openPayload<AccessPayload>({ iv, ciphertext }, env.SESSION_SECRET, "RUNTIME-ACCESS-V1");
  if (!payload || payload.kind !== "runtime_access" || payload.expiresAt <= Date.now()) return null;
  return payload;
}

async function requireRuntimeUser(request: Request, env: Env): Promise<AuthContext | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const access = await decodeAccessToken(env, token);
  if (!access) return null;
  const session = await db(env).prepare(
    `SELECT revoked_at, expires_at FROM refresh_tokens
     WHERE id=? AND user_id=? AND practice_id=?`,
  ).bind(access.sessionId, access.userId, access.practiceId).first<{ revoked_at:string|null; expires_at:string }>();
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  const user = await readRuntimeUser(env, access.userId, access.practiceId);
  return user ? { user, access } : null;
}

async function isAdminSession(request: Request, env: Env) {
  const token = bearerToken(request);
  if (!token) return false;
  const delegated = new Request(`${new URL(request.url).origin}/session`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, origin: env.ADMIN_ORIGIN },
  });
  const response = await adminHandler.fetch(delegated, env);
  return response.ok;
}

function hasPermission(user: RuntimeUser, permission: AssistantPermission) {
  return user.permissions.includes(permission);
}

async function issueSession(env: Env, user: RuntimeUser, rememberMe: boolean, deviceLabel?: string) {
  const sessionId = crypto.randomUUID();
  const refreshToken = randomToken(32);
  const refreshHash = await sha256Hex(refreshToken);
  const ttlMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const refreshExpiresAt = new Date(Date.now() + ttlMs).toISOString();
  await db(env).prepare(
    `INSERT INTO refresh_tokens
     (id, user_id, practice_id, token_hash, persistent, expires_at, revoked_at, created_at, last_used_at, device_label)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).bind(
    sessionId,
    user.id,
    user.practiceId,
    refreshHash,
    rememberMe ? 1 : 0,
    refreshExpiresAt,
    nowIso(),
    nowIso(),
    String(deviceLabel ?? "").slice(0, 180) || null,
  ).run();
  return {
    ...(await issueAccessToken(env, user, sessionId)),
    refreshToken,
    refreshExpiresAt,
    user,
  };
}

async function refreshSession(request: Request, env: Env) {
  let body: { refreshToken?: unknown; rememberMe?: unknown; deviceLabel?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  const token = String(body.refreshToken ?? "").trim();
  if (token.length < 32 || token.length > 200) return json(request, env, { error: "invalid_refresh_token" }, 401);
  const hash = await sha256Hex(token);
  const row = await db(env).prepare(
    `SELECT id, user_id, practice_id, persistent, expires_at, revoked_at
     FROM refresh_tokens WHERE token_hash = ?`,
  ).bind(hash).first<{ id:string; user_id:string; practice_id:string; persistent:number; expires_at:string; revoked_at:string|null }>();
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
    return json(request, env, { error: "refresh_token_invalid" }, 401);
  }
  const user = await readRuntimeUser(env, row.user_id, row.practice_id);
  if (!user) return json(request, env, { error: "runtime_user_inactive" }, 403);

  const revoked = await db(env).prepare(
    "UPDATE refresh_tokens SET revoked_at = ?, last_used_at = ? WHERE id = ? AND revoked_at IS NULL",
  ).bind(nowIso(), nowIso(), row.id).run();
  if ((revoked.meta.changes ?? 0) !== 1) return json(request, env, { error: "refresh_token_replayed" }, 401);
  return json(request, env, await issueSession(env, user, row.persistent === 1, String(body.deviceLabel ?? "")));
}

async function logout(request: Request, env: Env) {
  let body: { refreshToken?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    body = {};
  }
  const token = String(body.refreshToken ?? "").trim();
  if (token) {
    const hash = await sha256Hex(token);
    await db(env).prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?")
      .bind(nowIso(), hash).run();
  }
  return json(request, env, { loggedOut: true });
}

async function consumeRateLimit(env: Env, key: string, limit: number, windowSeconds: number) {
  const now = nowIso();
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const row = await db(env).prepare(
    `INSERT INTO auth_rate_limits (key, window_started_at, count)
     VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN auth_rate_limits.window_started_at < ? THEN 1 ELSE auth_rate_limits.count + 1 END,
       window_started_at = CASE WHEN auth_rate_limits.window_started_at < ? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END
     RETURNING count`,
  ).bind(key, now, cutoff, cutoff).first<{count:number}>();
  return Boolean(row && row.count <= limit);
}

type CommunicationsConfig = {
  sms?: {
    enabled?: boolean;
    loginOtp?: boolean;
    assistantInvitation?: boolean;
    otpTemplateId?: number;
    otpParameterName?: string;
  };
  email?: {
    enabled?: boolean;
    assistantInvitation?: boolean;
    fromAddress?: string;
  };
};

async function communicationsKey(masterSecret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`GLYMIZE-COMMUNICATIONS-CONFIG:${masterSecret}`),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function decryptCommunicationSecret(value: string, masterSecret: string) {
  try {
    const packed = base64UrlDecode(value);
    const iv = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const key = await communicationsKey(masterSecret);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function readCommunications(env: Env): Promise<CommunicationsConfig> {
  const raw = await env.AI_CONFIG_KV.get(COMMUNICATIONS_CONFIG_KEY);
  return parseJson<CommunicationsConfig>(raw, {});
}

async function loadCommunicationSecret(env: Env, key: string) {
  const encrypted = await env.AI_CONFIG_KV.get(key);
  return encrypted ? decryptCommunicationSecret(encrypted, env.AI_CONFIG_MASTER_KEY) : null;
}

async function sendEmail(env: Env, to: string, subject: string, text: string) {
  const apiKey = await loadCommunicationSecret(env, COMMUNICATIONS_EMAIL_SECRET_KEY);
  const config = await readCommunications(env);
  const from = config.email?.fromAddress || "GLYMIZE <info@glymize.ir>";
  if (!apiKey) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "user-agent": "GLYMIZE-Runtime-Worker/1.0",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return response.ok;
}

async function sendSmsCode(env: Env, mobile: string, code: string) {
  const apiKey = await loadCommunicationSecret(env, COMMUNICATIONS_SMS_SECRET_KEY);
  const config = await readCommunications(env);
  const templateId = config.sms?.otpTemplateId;
  const parameterName = config.sms?.otpParameterName || "Code";
  if (!apiKey || !templateId) return false;
  const response = await fetch("https://api.sms.ir/v1/send/verify/", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      mobile,
      templateId,
      parameters: [{ name: parameterName, value: code }],
    }),
  });
  return response.ok;
}

function randomSixDigitCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0]! % 900000));
}

async function findUserByIdentifier(env: Env, identifier: string) {
  const email = normalizeEmail(identifier);
  const mobile = normalizeIranMobile(identifier);
  if (!email && !mobile) return null;
  return db(env).prepare(
    `SELECT id FROM runtime_users
     WHERE status='active' AND ((? IS NOT NULL AND email_norm=?) OR (? IS NOT NULL AND mobile_norm=?))
     LIMIT 1`,
  ).bind(email, email, mobile, mobile).first<{id:string}>();
}

async function requestLoginOtp(request: Request, env: Env) {
  let body: { identifier?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  const identifier = String(body.identifier ?? "").trim();
  const email = normalizeEmail(identifier);
  const mobile = normalizeIranMobile(identifier);
  if (!email && !mobile) return json(request, env, { error: "invalid_login_identifier" }, 422);

  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const rateKey = await sha256Hex(`login:${email ?? mobile}:${clientIp}`);
  if (!(await consumeRateLimit(env, rateKey, 5, 15 * 60))) {
    return json(request, env, { error: "rate_limited" }, 429);
  }

  const found = await findUserByIdentifier(env, identifier);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const code = randomSixDigitCode();
  const codeHash = await hmacHex(env.SESSION_SECRET, `${challengeId}:${code}`);
  const destinationHash = await sha256Hex(email ?? mobile ?? "invalid");
  await db(env).prepare(
    `INSERT INTO otp_challenges
     (id, user_id, channel, destination_hash, code_hash, purpose, expires_at, attempts, consumed_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'login', ?, 0, NULL, ?)`,
  ).bind(challengeId, found?.id ?? null, email ? "email" : "sms", destinationHash, codeHash, expiresAt, nowIso()).run();

  let delivered = false;
  if (found) {
    const config = await readCommunications(env);
    if (email && config.email?.enabled === true) {
      delivered = await sendEmail(env, email, "GLYMIZE ┬╖ Login code", `Your GLYMIZE login code is ${code}. It expires in 10 minutes.`);
    } else if (mobile && config.sms?.enabled === true && config.sms?.loginOtp === true) {
      delivered = await sendSmsCode(env, mobile, code);
    }
  }

  return json(request, env, {
    challengeId,
    expiresAt,
    delivered,
    channel: email ? "email" : "sms",
    message: "If the account exists and delivery is configured, a login code has been sent.",
  });
}

async function verifyLoginOtp(request: Request, env: Env) {
  let body: { challengeId?: unknown; code?: unknown; rememberMe?: unknown; deviceLabel?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  const challengeId = String(body.challengeId ?? "").trim();
  const code = String(body.code ?? "").trim();
  if (!challengeId || !/^\d{6}$/.test(code)) return json(request, env, { error: "invalid_otp" }, 422);
  const row = await db(env).prepare(
    `SELECT user_id, code_hash, expires_at, attempts, consumed_at
     FROM otp_challenges WHERE id=? AND purpose='login'`,
  ).bind(challengeId).first<{user_id:string|null; code_hash:string; expires_at:string; attempts:number; consumed_at:string|null}>();
  if (!row || row.consumed_at || Date.parse(row.expires_at) <= Date.now() || row.attempts >= 5) {
    return json(request, env, { error: "otp_expired_or_invalid" }, 401);
  }
  const expected = await hmacHex(env.SESSION_SECRET, `${challengeId}:${code}`);
  if (!constantTimeEqual(expected, row.code_hash) || !row.user_id) {
    await db(env).prepare("UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?").bind(challengeId).run();
    return json(request, env, { error: "otp_expired_or_invalid" }, 401);
  }
  const consumed = await db(env).prepare(
    "UPDATE otp_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
  ).bind(nowIso(), challengeId).run();
  if ((consumed.meta.changes ?? 0) !== 1) return json(request, env, { error: "otp_replayed" }, 401);
  const membership = await db(env).prepare(
    `SELECT practice_id FROM practice_memberships WHERE user_id=? AND status='active' ORDER BY created_at LIMIT 1`,
  ).bind(row.user_id).first<{practice_id:string}>();
  if (!membership) return json(request, env, { error: "membership_missing" }, 403);
  const user = await readRuntimeUser(env, row.user_id, membership.practice_id);
  if (!user) return json(request, env, { error: "runtime_user_inactive" }, 403);
  await audit(env, user.id, user.practiceId, "auth.login", "user", user.id);
  return json(request, env, await issueSession(env, user, Boolean(body.rememberMe), String(body.deviceLabel ?? "")));
}

type IrimcVerification = {
  verified: boolean;
  exactMatch: boolean;
  firstName?: string;
  lastName?: string;
  medicalCouncilCode?: string;
  profilePhotoUrl?: string;
  specialty?: string;
};

async function verifyIrimc(env: Env, input: { medicalCouncilCode:string; firstName:string; lastName:string }) {
  const endpoint = env.IRIMC_VERIFY_ENDPOINT?.trim();
  if (!endpoint) return { status:"unavailable" as const };
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { status:"unavailable" as const };
  }
  if (url.protocol !== "https:") return { status:"unavailable" as const };
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type":"application/json", accept:"application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { status:"unavailable" as const };
    const data = await response.json() as IrimcVerification;
    const verifiedCode = normalizeMedicalCouncilCode(data.medicalCouncilCode ?? "");
    const exact =
      data.verified === true &&
      data.exactMatch === true &&
      verifiedCode === input.medicalCouncilCode;
    return exact ? { status:"verified" as const, data } : { status:"mismatch" as const };
  } catch {
    return { status:"unavailable" as const };
  }
}

async function createPhysicianAccount(env: Env, input: {
  medicalCouncilCode:string;
  firstName:string;
  lastName:string;
  email?:string|null;
  mobile?:string|null;
  photo?:string|null;
  verificationSource:string;
}) {
  const existing = await db(env).prepare(
    `SELECT id FROM runtime_users
     WHERE medical_council_code=?
        OR (? IS NOT NULL AND email_norm=?)
        OR (? IS NOT NULL AND mobile_norm=?)
     LIMIT 1`,
  ).bind(input.medicalCouncilCode,input.email ?? null,input.email ?? null,input.mobile ?? null,input.mobile ?? null).first<{id:string}>();
  if (existing) throw new Error("account_identifier_already_registered");

  const userId = crypto.randomUUID();
  const practiceId = crypto.randomUUID();
  const now = nowIso();
  const practiceName = `Dr. ${input.lastName}`;
  const irimcVerified = input.verificationSource === "irimc_exact";
  await db(env).batch([
    db(env).prepare(
      `INSERT INTO runtime_users
       (id, role, status, first_name, last_name, email_norm, mobile_norm, medical_council_code,
        irimc_status, irimc_verified_at, irimc_verification_source, profile_photo, profile_photo_source,
        layout_preset, created_at, updated_at)
       VALUES (?, 'physician', 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, ?)`,
    ).bind(
      userId, input.firstName, input.lastName, input.email ?? null, input.mobile ?? null,
      input.medicalCouncilCode, irimcVerified ? "verified" : "unavailable",
      irimcVerified ? now : null, input.verificationSource, input.photo ?? null,
      input.photo ? (input.verificationSource === "irimc_exact" ? "irimc" : "user_upload") : "none", now, now,
    ),
    db(env).prepare(
      "INSERT INTO practices (id, owner_physician_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(practiceId, userId, practiceName, now, now),
    db(env).prepare(
      `INSERT INTO practice_memberships
       (practice_id, user_id, role, status, permissions_json, invited_by, created_at, updated_at)
       VALUES (?, ?, 'physician', 'active', ?, ?, ?, ?)`,
    ).bind(practiceId, userId, JSON.stringify(fullPermissionsForPhysician()), userId, now, now),
  ]);
  return readRuntimeUser(env, userId, practiceId);
}

async function registerPhysician(request: Request, env: Env) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json(request, env, { error:"invalid_json" }, 400);
  }
  const medicalCouncilCode = normalizeMedicalCouncilCode(String(body.medicalCouncilCode ?? ""));
  const firstName = safeName(body.firstName);
  const lastName = safeName(body.lastName);
  const email = body.email ? normalizeEmail(String(body.email)) : null;
  const mobile = body.mobile ? normalizeIranMobile(String(body.mobile)) : null;
  if (!/^\d{3,12}$/.test(medicalCouncilCode) || !firstName || !lastName || (!email && !mobile)) {
    return json(request, env, { error:"invalid_physician_registration" }, 422);
  }
  const clientIp=request.headers.get("cf-connecting-ip") ?? "unknown";
  const irimcRateKey=await sha256Hex(`irimc:${medicalCouncilCode}:${clientIp}`);
  if (!(await consumeRateLimit(env,irimcRateKey,3,10*60))) return json(request,env,{error:"rate_limited"},429);
  const verification = await verifyIrimc(env, { medicalCouncilCode, firstName, lastName });
  if (verification.status === "unavailable") {
    return json(request, env, { error:"irimc_provider_unavailable", retryable:true }, 503);
  }
  if (verification.status !== "verified") return json(request, env, { error:"irimc_exact_match_failed" }, 403);
  try {
    const user = await createPhysicianAccount(env, {
      medicalCouncilCode,
      firstName: verification.data.firstName?.trim() || firstName,
      lastName: verification.data.lastName?.trim() || lastName,
      email, mobile,
      photo: safePhoto(verification.data.profilePhotoUrl),
      verificationSource:"irimc_exact",
    });
    if (!user) throw new Error("create_failed");
    await audit(env, user.id, user.practiceId, "auth.physician_registered", "user", user.id, { medicalCouncilCode });
    return json(request, env, await issueSession(env, user, Boolean(body.rememberMe), String(body.deviceLabel ?? "")), 201);
  } catch (error) {
    const code=error instanceof Error && ["account_identifier_already_registered"].includes(error.message)
      ? error.message : "physician_registration_failed";
    return json(request, env, { error:code }, code==="account_identifier_already_registered"?409:500);
  }
}

async function bootstrapPhysician(request: Request, env: Env) {
  if (!(await isAdminSession(request, env))) return json(request, env, { error:"admin_auth_required" }, 401);
  let body: Record<string,unknown>;
  try { body = await request.json() as Record<string,unknown>; }
  catch { return json(request, env, { error:"invalid_json" }, 400); }
  const medicalCouncilCode = normalizeMedicalCouncilCode(String(body.medicalCouncilCode ?? ""));
  const firstName = safeName(body.firstName);
  const lastName = safeName(body.lastName);
  const email = body.email ? normalizeEmail(String(body.email)) : null;
  const mobile = body.mobile ? normalizeIranMobile(String(body.mobile)) : null;
  if (!/^\d{3,12}$/.test(medicalCouncilCode) || !firstName || !lastName || (!email && !mobile)) {
    return json(request, env, { error:"invalid_physician_registration" }, 422);
  }
  try {
    const user = await createPhysicianAccount(env, {
      medicalCouncilCode, firstName, lastName, email, mobile,
      photo:safePhoto(body.profilePhoto), verificationSource:"admin_manual",
    });
    if (!user) throw new Error("create_failed");
    await audit(env, user.id, user.practiceId, "admin.bootstrap_physician", "user", user.id);
    return json(request, env, await issueSession(env, user, true, "admin-bootstrap"), 201);
  } catch (error) {
    const code=error instanceof Error && ["account_identifier_already_registered"].includes(error.message)
      ? error.message : "bootstrap_failed";
    return json(request, env, { error:code }, code==="account_identifier_already_registered"?409:500);
  }
}

async function profile(request: Request, env: Env, auth: AuthContext) {
  if (request.method === "GET") return json(request, env, auth.user);
  let body: Record<string,unknown>;
  try { body = await request.json() as Record<string,unknown>; }
  catch { return json(request, env, { error:"invalid_json" }, 400); }

  const firstName = body.firstName === undefined ? auth.user.firstName : safeName(body.firstName);
  const lastName = body.lastName === undefined ? auth.user.lastName : safeName(body.lastName);
  const layoutPreset = body.layoutPreset === undefined ? auth.user.layoutPreset : body.layoutPreset;
  const photo = body.profilePhoto === undefined ? auth.user.profilePhoto ?? null : safePhoto(body.profilePhoto);
  if (!firstName || !lastName || !validLayoutPreset(layoutPreset)) {
    return json(request, env, { error:"invalid_profile" }, 422);
  }
  await db(env).prepare(
    `UPDATE runtime_users
     SET first_name=?, last_name=?, profile_photo=?, profile_photo_source=?, layout_preset=?, updated_at=?
     WHERE id=?`,
  ).bind(
    firstName, lastName, photo,
    photo ? "user_upload" : "none",
    layoutPreset, nowIso(), auth.user.id,
  ).run();
  const next = await readRuntimeUser(env, auth.user.id, auth.user.practiceId);
  await audit(env, auth.user.id, auth.user.practiceId, "profile.updated", "user", auth.user.id);
  return json(request, env, next);
}

async function listTeam(request: Request, env: Env, auth: AuthContext) {
  if (auth.user.role !== "physician") return json(request, env, { error:"physician_required" }, 403);
  const results = await db(env).prepare(
    `SELECT u.id, u.first_name, u.last_name, u.email_norm, u.mobile_norm,
            u.profile_photo, m.role, m.status, m.permissions_json, m.created_at
     FROM practice_memberships m
     JOIN runtime_users u ON u.id=m.user_id
     WHERE m.practice_id=? AND u.id<>?
     ORDER BY m.created_at DESC`,
  ).bind(auth.user.practiceId, auth.user.id).all<{
    id:string; first_name:string; last_name:string; email_norm:string|null; mobile_norm:string|null;
    profile_photo:string|null; role:RuntimeRole; status:MembershipStatus; permissions_json:string; created_at:string;
  }>();
  return json(request, env, results.results.map((row)=>({
    id:row.id, firstName:row.first_name, lastName:row.last_name,
    email:row.email_norm ?? undefined, mobile:row.mobile_norm ?? undefined,
    profilePhoto:row.profile_photo ?? undefined, role:row.role, status:row.status,
    permissions:sanitizeAssistantPermissions(parseJson<unknown>(row.permissions_json, [])),
    createdAt:row.created_at,
  })));
}

async function createTeamInvitation(request: Request, env: Env, auth: AuthContext) {
  if (auth.user.role !== "physician") return json(request, env, { error:"physician_required" }, 403);
  let body: Record<string,unknown>;
  try { body=await request.json() as Record<string,unknown>; }
  catch { return json(request, env, { error:"invalid_json" }, 400); }
  const firstName=safeName(body.firstName);
  const lastName=safeName(body.lastName);
  const email=body.email ? normalizeEmail(String(body.email)) : null;
  const mobile=body.mobile ? normalizeIranMobile(String(body.mobile)) : null;
  const permissions=sanitizeAssistantPermissions(body.permissions);
  if (!firstName || !lastName || (!email && !mobile)) return json(request, env, { error:"invalid_invitation" }, 422);
  const token=randomToken(32);
  const tokenHash=await sha256Hex(token);
  const inviteId=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
  await db(env).prepare(
    `INSERT INTO team_invitations
     (id, practice_id, invited_by, role, first_name, last_name, email_norm, mobile_norm,
      permissions_json, token_hash, expires_at, accepted_at, created_at)
     VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).bind(
    inviteId, auth.user.practiceId, auth.user.id, firstName, lastName, email, mobile,
    JSON.stringify(permissions.length ? permissions : defaultAssistantPermissions()),
    tokenHash, expiresAt, nowIso(),
  ).run();

  const inviteUrl=`${resolvePublicAppBaseUrl(env)}/account/?invite=${encodeURIComponent(token)}`;
  const config=await readCommunications(env);
  let delivered=false;
  if (email && assistantInvitationEmailEnabled(config)) {
    delivered=await sendEmail(env,email,"GLYMIZE ┬╖ Care team invitation",
      `${auth.user.firstName} ${auth.user.lastName} invited you to the GLYMIZE care team.\n\nOpen this link:\n${inviteUrl}\n\nThis invitation expires in 7 days.`);
  }
  await audit(env,auth.user.id,auth.user.practiceId,"team.invited","invitation",inviteId,{delivered});
  return json(request,env,{id:inviteId,expiresAt,delivered,inviteUrl,permissions:permissions.length?permissions:defaultAssistantPermissions()},201);
}

async function inspectInvitation(request: Request, env: Env, token: string) {
  const hash=await sha256Hex(token);
  const row=await db(env).prepare(
    `SELECT i.id, i.first_name, i.last_name, i.email_norm, i.mobile_norm, i.expires_at, i.accepted_at,
            p.name AS practice_name, u.first_name AS physician_first_name, u.last_name AS physician_last_name
     FROM team_invitations i
     JOIN practices p ON p.id=i.practice_id
     JOIN runtime_users u ON u.id=i.invited_by
     WHERE i.token_hash=?`,
  ).bind(hash).first<any>();

  if (!row || row.accepted_at || Date.parse(row.expires_at)<=Date.now()) {
    return json(request,env,{error:"invitation_invalid"},404);
  }

  const matches=await db(env).prepare(
    `SELECT id,role,status,password_hash,password_salt,password_iterations
     FROM runtime_users
     WHERE (? IS NOT NULL AND email_norm=?)
        OR (? IS NOT NULL AND mobile_norm=?)`,
  ).bind(row.email_norm,row.email_norm,row.mobile_norm,row.mobile_norm).all<any>();

  const uniqueIds=new Set(matches.results.map((item:any)=>item.id));
  if (uniqueIds.size>1) {
    return json(request,env,{error:"invitation_identity_conflict"},409);
  }

  const existing=matches.results[0] as any | undefined;
  if (existing && existing.role!=="assistant") {
    return json(request,env,{error:"invitation_identity_conflict"},409);
  }
  if (existing && existing.status!=="active") {
    return json(request,env,{error:"assistant_account_disabled"},403);
  }

  const passwordSetupRequired=!existing ||
    !existing.password_hash ||
    !existing.password_salt ||
    !existing.password_iterations;

  return json(request,env,{
    id:row.id,
    firstName:row.first_name,
    lastName:row.last_name,
    email:row.email_norm ?? undefined,
    mobile:row.mobile_norm ?? undefined,
    expiresAt:row.expires_at,
    practiceName:row.practice_name,
    physicianName:`${row.physician_first_name} ${row.physician_last_name}`,
    passwordSetupRequired,
  });
}

async function acceptInvitation(request: Request, env: Env) {
  let body:Record<string,unknown>;
  try { body=await request.json() as Record<string,unknown>; }
  catch { return json(request,env,{error:"invalid_json"},400); }

  const token=String(body.token ?? "").trim();
  const newPassword=String(body.newPassword ?? "");
  if (token.length<32) return json(request,env,{error:"invitation_invalid"},422);

  const hash=await sha256Hex(token);
  const invite=await db(env).prepare(
    `SELECT id, practice_id, invited_by, first_name, last_name, email_norm, mobile_norm,
            permissions_json, expires_at, accepted_at
     FROM team_invitations WHERE token_hash=?`,
  ).bind(hash).first<any>();

  if (!invite || invite.accepted_at || Date.parse(invite.expires_at)<=Date.now()) {
    return json(request,env,{error:"invitation_invalid"},404);
  }

  const matches=await db(env).prepare(
    `SELECT id,role,status,password_hash,password_salt,password_iterations
     FROM runtime_users
     WHERE (? IS NOT NULL AND email_norm=?)
        OR (? IS NOT NULL AND mobile_norm=?)`,
  ).bind(invite.email_norm,invite.email_norm,invite.mobile_norm,invite.mobile_norm).all<any>();

  const uniqueIds=new Set(matches.results.map((item:any)=>item.id));
  if (uniqueIds.size>1) {
    return json(request,env,{error:"invitation_identity_conflict"},409);
  }

  const existing=matches.results[0] as any | undefined;
  if (existing && existing.role!=="assistant") {
    return json(request,env,{error:"invitation_identity_conflict"},409);
  }
  if (existing && existing.status!=="active") {
    return json(request,env,{error:"assistant_account_disabled"},403);
  }

  const passwordSetupRequired=!existing ||
    !existing.password_hash ||
    !existing.password_salt ||
    !existing.password_iterations;

  if (passwordSetupRequired && !validCredentialValue(newPassword)) {
    return json(request,env,{error:"password_policy"},422);
  }

  const credential=passwordSetupRequired
    ? await createCredential(newPassword)
    : null;

  const userId=existing?.id ?? crypto.randomUUID();
  const now=nowIso();

  if (!existing) {
    await db(env).prepare(
      `INSERT INTO runtime_users
       (id,role,status,first_name,last_name,email_norm,mobile_norm,medical_council_code,
        irimc_status,irimc_verified_at,irimc_verification_source,profile_photo,profile_photo_source,
        layout_preset,password_hash,password_salt,password_iterations,password_updated_at,created_at,updated_at)
       VALUES (?,'assistant','active',?,?,?,?,NULL,NULL,NULL,NULL,NULL,'none','auto',?,?,?,?,?,?)`,
    ).bind(
      userId,
      invite.first_name,
      invite.last_name,
      invite.email_norm,
      invite.mobile_norm,
      credential!.hash,
      credential!.salt,
      credential!.iterations,
      now,
      now,
      now,
    ).run();
  } else if (passwordSetupRequired && credential) {
    await db(env).prepare(
      `UPDATE runtime_users
       SET password_hash=?,password_salt=?,password_iterations=?,
           password_updated_at=?,updated_at=?
       WHERE id=?`,
    ).bind(
      credential.hash,
      credential.salt,
      credential.iterations,
      now,
      now,
      userId,
    ).run();
  }

  await db(env).batch([
    db(env).prepare(
      `INSERT INTO practice_memberships
       (practice_id,user_id,role,status,permissions_json,invited_by,created_at,updated_at)
       VALUES (?,?,'assistant','active',?,?,?,?)
       ON CONFLICT(practice_id,user_id) DO UPDATE SET
       status='active',
       permissions_json=excluded.permissions_json,
       updated_at=excluded.updated_at`,
    ).bind(invite.practice_id,userId,invite.permissions_json,invite.invited_by,now,now),
    db(env).prepare(
      "UPDATE team_invitations SET accepted_at=? WHERE id=? AND accepted_at IS NULL",
    ).bind(now,invite.id),
  ]);

  const user=await readRuntimeUser(env,userId,invite.practice_id);
  if (!user) return json(request,env,{error:"invitation_accept_failed"},500);

  await audit(
    env,
    userId,
    invite.practice_id,
    "team.invitation_accepted",
    "user",
    userId,
    {passwordSetup:passwordSetupRequired},
  );

  return json(
    request,
    env,
    await issueSession(
      env,
      user,
      body.rememberMe!==false,
      String(body.deviceLabel ?? ""),
    ),
    201,
  );
}

async function updateTeamMember(request: Request, env: Env, auth: AuthContext, memberId: string) {
  if (auth.user.role!=="physician") return json(request,env,{error:"physician_required"},403);
  let body:Record<string,unknown>;
  try { body=await request.json() as Record<string,unknown>; }
  catch { return json(request,env,{error:"invalid_json"},400); }
  const status=body.status === undefined ? undefined : String(body.status);
  if (status!==undefined && !["active","disabled"].includes(status)) return json(request,env,{error:"invalid_member_status"},422);
  const existing=await db(env).prepare(
    "SELECT user_id, permissions_json FROM practice_memberships WHERE practice_id=? AND user_id=? AND role='assistant'",
  ).bind(auth.user.practiceId,memberId).first<{user_id:string;permissions_json:string}>();
  if (!existing) return json(request,env,{error:"member_not_found"},404);
  const permissions=body.permissions === undefined
    ? sanitizeAssistantPermissions(parseJson<unknown>(existing.permissions_json, []))
    : sanitizeAssistantPermissions(body.permissions);
  await db(env).prepare(
    `UPDATE practice_memberships
     SET permissions_json=?, status=COALESCE(?,status), updated_at=?
     WHERE practice_id=? AND user_id=?`,
  ).bind(JSON.stringify(permissions),status ?? null,nowIso(),auth.user.practiceId,memberId).run();
  await audit(env,auth.user.id,auth.user.practiceId,"team.member_updated","user",memberId,{permissions,status});
  return json(request,env,{updated:true});
}


async function removeTeamMember(
  request: Request,
  env: Env,
  auth: AuthContext,
  memberId: string,
) {
  if (auth.user.role !== "physician") {
    return json(request, env, { error: "physician_required" }, 403);
  }

  const member = await db(env).prepare(
    `SELECT role, status
     FROM practice_memberships
     WHERE practice_id=? AND user_id=?`,
  ).bind(
    auth.user.practiceId,
    memberId,
  ).first<{ role: RuntimeRole; status: MembershipStatus }>();

  if (!member || member.role !== "assistant") {
    return json(request, env, { error: "team_member_not_found" }, 404);
  }

  const now = nowIso();

  const removed = await db(env).prepare(
    `DELETE FROM practice_memberships
     WHERE practice_id=? AND user_id=? AND role='assistant'`,
  ).bind(
    auth.user.practiceId,
    memberId,
  ).run();

  if ((removed.meta.changes ?? 0) !== 1) {
    return json(request, env, { error: "team_member_remove_failed" }, 409);
  }

  await db(env).prepare(
    `UPDATE refresh_tokens
     SET revoked_at=COALESCE(revoked_at, ?), last_used_at=?
     WHERE practice_id=? AND user_id=?`,
  ).bind(
    now,
    now,
    auth.user.practiceId,
    memberId,
  ).run();

  await audit(
    env,
    auth.user.id,
    auth.user.practiceId,
    "team.member_removed",
    "user",
    memberId,
    { previousStatus: member.status },
  );

  return json(request, env, { removed: true });
}

function validPatientPayload(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const code = normalizePatientCode(
    String(body.patientCode ?? ""),
  );
  return code.length >= 3 && code.length <= 64 &&
    ["file_number", "national_id", "other"].includes(
      String(body.patientCodeKind),
    ) &&
    JSON.stringify(value).length <= 250_000;
}

type PatientHandoffDbRow = {
  id: string;
  patient_code_hash: string;
  patient_code_kind: string;
  patient_code_display: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  status: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

async function readHandoffByHash(
  env: Env,
  practiceId: string,
  patientCodeHash: string,
) {
  return db(env).prepare(
    `SELECT id,patient_code_hash,patient_code_kind,
            patient_code_display,ciphertext,iv,auth_tag,
            status,revision,created_at,updated_at
     FROM patient_handoffs
     WHERE practice_id=? AND patient_code_hash=?`,
  ).bind(
    practiceId,
    patientCodeHash,
  ).first<PatientHandoffDbRow>();
}

function patientSummaryFromPayload(
  row: PatientHandoffDbRow,
  payload: any,
) {
  const firstName = safeName(payload?.firstName);
  const lastName = safeName(payload?.lastName);
  const rawAge = payload?.demographics?.reportedAgeYears;
  const age = typeof rawAge === "number" &&
      Number.isFinite(rawAge) &&
      rawAge >= 0 &&
      rawAge <= 130
    ? rawAge
    : undefined;
  const rawSex = payload?.demographics?.reportedSex;
  const reportedSex =
    rawSex === "male" || rawSex === "female"
      ? rawSex
      : undefined;

  return {
    id: row.id,
    patientCodeKind: row.patient_code_kind,
    patientCodeDisplay: row.patient_code_display,
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(
      age !== undefined || reportedSex
        ? {
            demographics: {
              ...(age !== undefined
                ? { reportedAgeYears: age }
                : {}),
              ...(reportedSex
                ? { reportedSex }
                : {}),
            },
          }
        : {}
    ),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

async function sequentialFileCodeSuggestion(
  env: Env,
  practiceId: string,
  secret: string,
  occupiedCode: string,
) {
  const candidates =
    buildSequentialFileCodeCandidates(
      occupiedCode,
      128,
    );
  if (!candidates.length) return undefined;

  const candidateHashes = await Promise.all(
    candidates.map((candidate) =>
      hmacHex(
        secret,
        `${practiceId}:file_number:${candidate}`,
      ),
    ),
  );

  const placeholders = candidateHashes
    .map(() => "?")
    .join(",");
  const occupied = await db(env).prepare(
    `SELECT patient_code_hash
     FROM patient_handoffs
     WHERE practice_id=?
       AND patient_code_hash IN (${placeholders})`,
  ).bind(
    practiceId,
    ...candidateHashes,
  ).all<{ patient_code_hash: string }>();

  const occupiedHashes = new Set(
    occupied.results.map(
      (row) => row.patient_code_hash,
    ),
  );

  for (
    let index = 0;
    index < candidates.length;
    index += 1
  ) {
    if (!occupiedHashes.has(candidateHashes[index]!)) {
      return {
        lastOccupiedCode:
          index === 0
            ? occupiedCode
            : candidates[index - 1]!,
        suggestedCode: candidates[index]!,
        checkedAt: nowIso(),
      };
    }
  }

  return undefined;
}

async function occupiedHandoffCodeStatus(
  env: Env,
  auth: AuthContext,
  code: string,
  patientCodeKind: string,
  patientCodeHash: string,
  row: PatientHandoffDbRow,
  secret: string,
) {
  const payload = await decryptClinicalPayload<any>(
    {
      iv: row.iv,
      ciphertext: row.ciphertext,
      authTag: row.auth_tag,
    },
    secret,
    `${auth.user.practiceId}:${patientCodeHash}`,
  );
  if (!payload) {
    throw new Error("handoff_decryption_failed");
  }

  const suggestion =
    patientCodeKind === "file_number" &&
    /^\d+$/.test(code)
      ? await sequentialFileCodeSuggestion(
          env,
          auth.user.practiceId,
          secret,
          code,
        )
      : undefined;

  return {
    available: false,
    patientCodeKind,
    existing: patientSummaryFromPayload(
      row,
      payload,
    ),
    ...(suggestion ? { suggestion } : {}),
  };
}

async function codeStatusHandoff(
  request: Request,
  env: Env,
  auth: AuthContext,
) {
  if (
    !hasPermission(auth.user, "handoff.read") ||
    !hasPermission(auth.user, "handoff.write")
  ) {
    return json(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  let body: {
    patientCode?: unknown;
    patientCodeKind?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(
      request,
      env,
      { error: "invalid_json" },
      400,
    );
  }

  const patientCodeKind = String(
    body.patientCodeKind ?? "",
  );
  if (
    !["file_number", "national_id", "other"].includes(
      patientCodeKind,
    )
  ) {
    return json(
      request,
      env,
      { error: "invalid_patient_code_kind" },
      422,
    );
  }

  const code = normalizePatientCode(
    String(body.patientCode ?? ""),
  );
  if (code.length < 3 || code.length > 64) {
    return json(
      request,
      env,
      { error: "invalid_patient_code" },
      422,
    );
  }
  if (
    patientCodeKind === "national_id" &&
    !validateIranianNationalId(code)
  ) {
    return json(
      request,
      env,
      { error: "invalid_national_id" },
      422,
    );
  }

  const secret = clinicalSecret(env);
  const patientCodeHash = await hmacHex(
    secret,
    `${auth.user.practiceId}:${patientCodeKind}:${code}`,
  );
  const row = await readHandoffByHash(
    env,
    auth.user.practiceId,
    patientCodeHash,
  );

  if (!row) {
    return json(request, env, {
      available: true,
      patientCodeKind,
    });
  }

  return json(
    request,
    env,
    await occupiedHandoffCodeStatus(
      env,
      auth,
      code,
      patientCodeKind,
      patientCodeHash,
      row,
      secret,
    ),
  );
}

async function upsertHandoff(
  request: Request,
  env: Env,
  auth: AuthContext,
) {
  if (!hasPermission(auth.user, "handoff.write")) {
    return json(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(
      request,
      env,
      { error: "invalid_json" },
      400,
    );
  }
  if (!validPatientPayload(body)) {
    return json(
      request,
      env,
      { error: "invalid_handoff" },
      422,
    );
  }

  const writeMode =
    resolvePatientHandoffWriteMode(body.writeMode);
  if (!writeMode) {
    return json(
      request,
      env,
      { error: "invalid_handoff_write_mode" },
      422,
    );
  }

  const patientCodeKind = String(
    body.patientCodeKind,
  );
  const code = normalizePatientCode(
    String(body.patientCode),
  );
  if (
    patientCodeKind === "national_id" &&
    !validateIranianNationalId(code)
  ) {
    return json(
      request,
      env,
      { error: "invalid_national_id" },
      422,
    );
  }

  const secret = clinicalSecret(env);
  const patientCodeHash = await hmacHex(
    secret,
    `${auth.user.practiceId}:${patientCodeKind}:${code}`,
  );
  const aad =
    `${auth.user.practiceId}:${patientCodeHash}`;
  const protectedPayload = { ...body };
  delete protectedPayload.patientCode;
  delete protectedPayload.writeMode;
  delete protectedPayload.expectedRecordId;
  delete protectedPayload.expectedRevision;

  const encrypted = await encryptClinicalPayload(
    protectedPayload,
    secret,
    aad,
  );
  const now = nowIso();

  if (writeMode === "create") {
    const existing = await readHandoffByHash(
      env,
      auth.user.practiceId,
      patientCodeHash,
    );
    if (existing) {
      const canRevealSummary =
        hasPermission(auth.user, "handoff.read");
      const codeStatus = canRevealSummary
        ? await occupiedHandoffCodeStatus(
            env,
            auth,
            code,
            patientCodeKind,
            patientCodeHash,
            existing,
            secret,
          )
        : undefined;
      return json(
        request,
        env,
        {
          error: "PATIENT_CODE_EXISTS",
          ...(codeStatus
            ? { codeStatus }
            : {}),
        },
        409,
      );
    }

    const recordId = crypto.randomUUID();
    const result = await db(env).prepare(
      `INSERT INTO patient_handoffs
       (id,practice_id,patient_code_hash,
        patient_code_kind,patient_code_display,
        ciphertext,iv,auth_tag,status,revision,
        created_by,updated_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)
       ON CONFLICT(practice_id,patient_code_hash)
       DO NOTHING
       RETURNING id,revision,created_at,updated_at`,
    ).bind(
      recordId,
      auth.user.practiceId,
      patientCodeHash,
      patientCodeKind,
      maskIdentifier(code),
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      String(
        body.status ?? "ready_for_physician",
      ),
      auth.user.id,
      auth.user.id,
      now,
      now,
    ).first<{
      id: string;
      revision: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!result) {
      const raced = await readHandoffByHash(
        env,
        auth.user.practiceId,
        patientCodeHash,
      );
      const canRevealSummary =
        Boolean(raced) &&
        hasPermission(auth.user, "handoff.read");
      const codeStatus =
        raced && canRevealSummary
          ? await occupiedHandoffCodeStatus(
              env,
              auth,
              code,
              patientCodeKind,
              patientCodeHash,
              raced,
              secret,
            )
          : undefined;
      return json(
        request,
        env,
        {
          error: "PATIENT_CODE_EXISTS",
          ...(codeStatus
            ? { codeStatus }
            : {}),
        },
        409,
      );
    }

    await audit(
      env,
      auth.user.id,
      auth.user.practiceId,
      "handoff.upsert",
      "patient_handoff",
      result.id,
      {
        revision: result.revision,
        writeMode,
      },
    );

    return json(request, env, {
      ...protectedPayload,
      id: result.id,
      patientCodeKind,
      patientCodeDisplay: maskIdentifier(code),
      status: String(
        body.status ?? "ready_for_physician",
      ),
      revision: result.revision,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    });
  }

  const expectedRecordId = String(
    body.expectedRecordId ?? "",
  ).trim();
  const expectedRevision = Number(
    body.expectedRevision,
  );
  if (
    !/^[A-Za-z0-9-]{8,80}$/.test(
      expectedRecordId,
    ) ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  ) {
    return json(
      request,
      env,
      { error: "invalid_handoff_update_target" },
      422,
    );
  }

  const promotedLegacy = await db(env).prepare(
    `SELECT l.patient_id,l.encounter_id
     FROM patient_handoff_legacy_links l
     JOIN patient_registry p ON p.id=l.patient_id
     JOIN patient_encounters e ON e.id=l.encounter_id
     WHERE l.legacy_handoff_id=?
       AND p.practice_id=?
       AND e.practice_id=?
     LIMIT 1`,
  ).bind(
    expectedRecordId,
    auth.user.practiceId,
    auth.user.practiceId,
  ).first<{
    patient_id: string;
    encounter_id: string;
  }>();
  if (promotedLegacy) {
    await audit(
      env,
      auth.user.id,
      auth.user.practiceId,
      "handoff.legacy_write_denied",
      "patient_handoff",
      expectedRecordId,
      { reason: "promoted_to_patient_record_v2" },
    );
    return json(
      request,
      env,
      { error: "LEGACY_HANDOFF_PROMOTED_READ_ONLY" },
      409,
    );
  }
  const result = await db(env).prepare(
    `UPDATE patient_handoffs
     SET ciphertext=?,
         iv=?,
         auth_tag=?,
         status=?,
         revision=revision+1,
         updated_by=?,
         updated_at=?
     WHERE practice_id=?
       AND patient_code_hash=?
       AND id=?
       AND revision=?
     RETURNING id,revision,created_at,updated_at`,
  ).bind(
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.authTag,
    String(
      body.status ?? "ready_for_physician",
    ),
    auth.user.id,
    now,
    auth.user.practiceId,
    patientCodeHash,
    expectedRecordId,
    expectedRevision,
  ).first<{
    id: string;
    revision: number;
    created_at: string;
    updated_at: string;
  }>();

  if (!result) {
    const current = await readHandoffByHash(
      env,
      auth.user.practiceId,
      patientCodeHash,
    );

    if (
      current &&
      current.id === expectedRecordId &&
      current.revision !== expectedRevision
    ) {
      return json(
        request,
        env,
        {
          error: "HANDOFF_REVISION_CONFLICT",
          currentRevision: current.revision,
        },
        409,
      );
    }

    return json(
      request,
      env,
      { error: "HANDOFF_UPDATE_TARGET_MISMATCH" },
      409,
    );
  }

  await audit(
    env,
    auth.user.id,
    auth.user.practiceId,
    "handoff.upsert",
    "patient_handoff",
    result.id,
    {
      revision: result.revision,
      writeMode,
    },
  );

  return json(request, env, {
    ...protectedPayload,
    id: result.id,
    patientCodeKind,
    patientCodeDisplay: maskIdentifier(code),
    status: String(
      body.status ?? "ready_for_physician",
    ),
    revision: result.revision,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  });
}

async function lookupHandoff(
  request: Request,
  env: Env,
  auth: AuthContext,
) {
  if (!hasPermission(auth.user, "handoff.read")) {
    return json(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  let body: {
    patientCode?: unknown;
    patientCodeKind?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(
      request,
      env,
      { error: "invalid_json" },
      400,
    );
  }

  const code = normalizePatientCode(
    String(body.patientCode ?? ""),
  );
  if (!code) {
    return json(request, env, { found: false });
  }

  const secret = clinicalSecret(env);
  const requestedKind =
    body.patientCodeKind === undefined
      ? undefined
      : String(body.patientCodeKind);

  if (
    requestedKind !== undefined &&
    !["file_number", "national_id", "other"].includes(
      requestedKind,
    )
  ) {
    return json(
      request,
      env,
      { error: "invalid_patient_code_kind" },
      422,
    );
  }

  const kinds = requestedKind
    ? [requestedKind]
    : ["file_number", "national_id", "other"];
  const hashes = await Promise.all(
    kinds.map((kind) =>
      hmacHex(
        secret,
        `${auth.user.practiceId}:${kind}:${code}`,
      ),
    ),
  );
  const placeholders = hashes
    .map(() => "?")
    .join(",");
  const results = await db(env).prepare(
    `SELECT id,patient_code_hash,patient_code_kind,
            patient_code_display,ciphertext,iv,auth_tag,
            status,revision,created_at,updated_at
     FROM patient_handoffs
     WHERE practice_id=?
       AND patient_code_hash IN (${placeholders})`,
  ).bind(
    auth.user.practiceId,
    ...hashes,
  ).all<any>();

  if (results.results.length > 1) {
    return json(
      request,
      env,
      { error: "AMBIGUOUS_PATIENT_CODE" },
      409,
    );
  }

  const row = results.results[0];
  if (!row) {
    return json(
      request,
      env,
      { found: false },
      404,
    );
  }

  const payload = await decryptClinicalPayload<any>(
    {
      iv: row.iv,
      ciphertext: row.ciphertext,
      authTag: row.auth_tag,
    },
    secret,
    `${auth.user.practiceId}:${row.patient_code_hash}`,
  );
  if (!payload) {
    return json(
      request,
      env,
      { error: "handoff_decryption_failed" },
      500,
    );
  }

  return json(request, env, {
    found: true,
    record: {
      ...payload,
      id: row.id,
      patientCodeKind: row.patient_code_kind,
      patientCodeDisplay: row.patient_code_display,
      status: row.status,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

async function getHandoffById(
  request: Request,
  env: Env,
  auth: AuthContext,
  recordId: string,
) {
  if (!hasPermission(auth.user, "handoff.read")) {
    return json(request, env, { error: "permission_denied" }, 403);
  }

  const id = recordId.trim();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) {
    return json(request, env, { error: "invalid_handoff_id" }, 422);
  }

  const row = await db(env).prepare(
    `SELECT id,patient_code_hash,patient_code_kind,patient_code_display,
            ciphertext,iv,auth_tag,status,revision,created_at,updated_at
     FROM patient_handoffs
     WHERE practice_id=? AND id=?`,
  ).bind(
    auth.user.practiceId,
    id,
  ).first<any>();

  if (!row) {
    return json(request, env, { error: "handoff_not_found" }, 404);
  }

  const secret = clinicalSecret(env);
  const payload = await decryptClinicalPayload<any>(
    {
      iv: row.iv,
      ciphertext: row.ciphertext,
      authTag: row.auth_tag,
    },
    secret,
    `${auth.user.practiceId}:${row.patient_code_hash}`,
  );

  if (!payload) {
    return json(request, env, { error: "handoff_decryption_failed" }, 500);
  }

  return json(request, env, {
    ...payload,
    id: row.id,
    patientCodeKind: row.patient_code_kind,
    patientCodeDisplay: row.patient_code_display,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseHandoffArchiveCursor(raw: string) {
  const separator = raw.lastIndexOf("|");
  if (separator <= 0 || separator >= raw.length - 1) return null;

  const updatedAt = raw.slice(0, separator);
  const id = raw.slice(separator + 1);

  if (
    Number.isNaN(Date.parse(updatedAt)) ||
    !/^[A-Za-z0-9-]{8,80}$/.test(id)
  ) {
    return null;
  }

  return { updatedAt, id };
}

async function listHandoffs(
  request: Request,
  env: Env,
  auth: AuthContext,
) {
  if (!hasPermission(auth.user, "handoff.read")) {
    return json(request, env, { error: "permission_denied" }, 403);
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const pageSize = Number.isFinite(requestedLimit)
    ? Math.max(10, Math.min(100, Math.trunc(requestedLimit)))
    : 50;

  const rawCursor = url.searchParams.get("cursor")?.trim() ?? "";
  const cursor = rawCursor
    ? parseHandoffArchiveCursor(rawCursor)
    : null;

  if (rawCursor && !cursor) {
    return json(request, env, { error: "invalid_archive_cursor" }, 422);
  }

  // pageSize is a transport/page size only. It is NOT an archive or
  // retention cap. No patient_handoffs are deleted by this endpoint.
  const result = cursor
    ? await db(env).prepare(
        `SELECT id,patient_code_kind,patient_code_display,status,
                revision,created_at,updated_at
         FROM patient_handoffs
         WHERE practice_id=?
           AND (
             updated_at < ?
             OR (updated_at = ? AND id < ?)
           )
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
      ).bind(
        auth.user.practiceId,
        cursor.updatedAt,
        cursor.updatedAt,
        cursor.id,
        pageSize + 1,
      ).all<any>()
    : await db(env).prepare(
        `SELECT id,patient_code_kind,patient_code_display,status,
                revision,created_at,updated_at
         FROM patient_handoffs
         WHERE practice_id=?
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
      ).bind(
        auth.user.practiceId,
        pageSize + 1,
      ).all<any>();

  const hasMore = result.results.length > pageSize;
  const visible = result.results.slice(0, pageSize);

  const items = visible.map((row: any) => ({
    id: row.id,
    patientCodeKind: row.patient_code_kind,
    patientCodeDisplay: row.patient_code_display,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const last = visible[visible.length - 1];
  const nextCursor = hasMore && last
    ? `${last.updated_at}|${last.id}`
    : null;

  return json(request, env, {
    items,
    nextCursor,
  });
}

async function evidenceStatus(request:Request,env:Env) {
  const modelsRaw=await env.AI_CONFIG_KV.get("ai:models:v1");
  const models=parseJson<any[]>(modelsRaw,[]).filter((model)=>model?.enabled && model?.role!=="compare");
  const configured=models.sort((a,b)=>(a.priority??99)-(b.priority??99))[0];
  return json(request,env,{
    available:true,
    generationBackend:configured ? "openai_compatible" : "extractive_offline",
    configuredModel:configured?.modelId ?? null,
    activeRulePackVersion:RUNTIME_RULE_PACK_VERSION,
    engineInfluence:"none",
  });
}

async function evidenceAsk(request:Request,env:Env) {
  let body:{question?:unknown;locale?:unknown};
  try { body=await request.json() as typeof body; }
  catch { return json(request,env,{error:"invalid_json"},400); }
  const question=String(body.question ?? "").trim();
  if (!question || question.length>4000) return json(request,env,{error:"invalid_question"},422);
  const locale=detectEvidenceLocale(question,body.locale==="fa"||body.locale==="en"?body.locale:undefined);
  const evidence=evidenceForQuestion(question);
  const sufficientEvidence=Boolean(evidence[0] && evidence[0].score>=3);
  const citations=uniqueEvidenceCitations(evidence);
  if (sufficientEvidence) {
    const messages=buildEvidenceMessages(question,locale,evidence);
    const delegated=new Request(`${new URL(request.url).origin}/ai/runtime/chat/completions`,{
      method:"POST",
      headers:{
        authorization:`Bearer ${env.AI_RUNTIME_SHARED_SECRET}`,
        "content-type":"application/json",
        origin:env.ADMIN_ORIGIN,
      },
      body:JSON.stringify({messages,temperature:0.1,max_completion_tokens:1000}),
    });
    const aiResponse=await adminHandler.fetch(delegated,env);
    if (aiResponse.ok) {
      const ai=await aiResponse.json() as any;
      const answer=ai?.choices?.[0]?.message?.content?.trim();
      if (answer) return json(request,env,{
        question,locale,mode:"remote_llm",answer,citations,evidence,sufficientEvidence,
        engineInfluence:"none",rulePackVersion:RUNTIME_RULE_PACK_VERSION,
      });
    }
  }
  return json(request,env,{
    question,locale,mode:"extractive_offline",
    answer:extractiveEvidenceAnswer(locale,evidence,sufficientEvidence),
    citations,evidence,sufficientEvidence,engineInfluence:"none",rulePackVersion:RUNTIME_RULE_PACK_VERSION,
  });
}

async function platformRoute(request:Request,env:Env):Promise<Response|null> {
  const url=new URL(request.url);
  if (!url.pathname.startsWith("/v1/")) return null;

  if (request.method==="POST" && url.pathname==="/v1/auth/physician/register") return registerPhysician(request,env);
  if (request.method==="POST" && url.pathname==="/v1/auth/login/request") return requestLoginOtp(request,env);
  if (request.method==="POST" && url.pathname==="/v1/auth/login/verify") return verifyLoginOtp(request,env);
  if (request.method==="POST" && url.pathname==="/v1/auth/refresh") return refreshSession(request,env);
  if (request.method==="POST" && url.pathname==="/v1/auth/logout") return logout(request,env);

  const inviteInspect=url.pathname.match(/^\/v1\/team\/invitations\/([^/]+)$/);
  if (request.method==="GET" && inviteInspect) return inspectInvitation(request,env,decodeURIComponent(inviteInspect[1]!));
  if (request.method==="POST" && url.pathname==="/v1/team/invitations/accept") return acceptInvitation(request,env);

  if (request.method==="POST" && url.pathname==="/v1/admin/runtime/bootstrap-physician") return bootstrapPhysician(request,env);

  // Evidence is usable by either a signed-in GLYMIZE user or the existing GitHub admin session.
  if (url.pathname==="/v1/evidence-assistant/status" || url.pathname==="/v1/evidence-assistant/ask") {
    const runtime=await requireRuntimeUser(request,env);
    const admin=runtime ? false : await isAdminSession(request,env);
    if (!runtime && !admin) return json(request,env,{error:"auth_required"},401);
    if (runtime && !hasPermission(runtime.user,"evidence")) return json(request,env,{error:"permission_denied"},403);
    return request.method==="GET" ? evidenceStatus(request,env) :
      request.method==="POST" ? evidenceAsk(request,env) :
      json(request,env,{error:"method_not_allowed"},405);
  }

  const auth=await requireRuntimeUser(request,env);
  if (!auth) return json(request,env,{error:"auth_required"},401);

  if (url.pathname==="/v1/session" && request.method==="GET") return json(request,env,auth.user);
  if (url.pathname==="/v1/profile" && (request.method==="GET"||request.method==="PATCH")) return profile(request,env,auth);
  if (url.pathname==="/v1/team" && request.method==="GET") return listTeam(request,env,auth);
  if (url.pathname==="/v1/team/invitations" && request.method==="POST") return createTeamInvitation(request,env,auth);
  const memberMatch=url.pathname.match(/^\/v1\/team\/members\/([^/]+)$/);
  if (memberMatch && request.method==="PATCH") return updateTeamMember(request,env,auth,decodeURIComponent(memberMatch[1]!));
  if (memberMatch && request.method==="DELETE") return removeTeamMember(request,env,auth,decodeURIComponent(memberMatch[1]!));

  if (url.pathname.startsWith("/v1/patients")) {
    const patientRecord=await patientRecordV2Route(request,{
      database:db(env),
      clinicalSecret:clinicalSecret(env),
      user:auth.user,
      respond:(body,status=200)=>json(request,env,body,status),
      audit:(action,targetType,targetId,meta)=>
        audit(env,auth.user.id,auth.user.practiceId,action,targetType,targetId,meta),
    });
    if (patientRecord) return patientRecord;
  }

  if (url.pathname==="/v1/patient-handoff/upsert" && request.method==="POST") return upsertHandoff(request,env,auth);
  if (url.pathname==="/v1/patient-handoff/code-status" && request.method==="POST") return codeStatusHandoff(request,env,auth);
  if (url.pathname==="/v1/patient-handoff/lookup" && request.method==="POST") return lookupHandoff(request,env,auth);
  const handoffRecordMatch=url.pathname.match(/^\/v1\/patient-handoff\/records\/([^/]+)$/);
  if (handoffRecordMatch && request.method==="GET") {
    return getHandoffById(
      request,
      env,
      auth,
      decodeURIComponent(handoffRecordMatch[1]!),
    );
  }
  if (url.pathname==="/v1/patient-handoff/list" && request.method==="GET") return listHandoffs(request,env,auth);

  return json(request,env,{error:"not_found"},404);
}

export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    if (request.method==="OPTIONS" && new URL(request.url).pathname.startsWith("/v1/")) {
      if (request.headers.get("origin")!==env.ADMIN_ORIGIN) return new Response(null,{status:403});
      return new Response(null,{status:204,headers:corsHeaders(request,env)});
    }
    try {
      const handled=await platformRoute(request,env);
      if (handled) return handled;
    } catch (error) {
      const raw=error instanceof Error ? error.message : "runtime_platform_failed";
      const configuration=["GLYMIZE_DB_NOT_CONFIGURED","CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED"];
      const code=configuration.includes(raw) ? raw : "runtime_platform_failed";
      if (code==="runtime_platform_failed") console.error("GLYMIZE runtime platform request failed", error instanceof Error ? error.name : "unknown");
      return json(request,env,{error:code},configuration.includes(code)?503:500);
    }
    return adminHandler.fetch(request,env);
  },
} satisfies ExportedHandler<Env>;
