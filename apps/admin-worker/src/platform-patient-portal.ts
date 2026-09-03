// GLYMIZE Patient Portal runtime (WS-2 / WS-3).
//
// Security architecture:
//   * Patient sessions use the dedicated "PORTAL-ACCESS-V1" sealing context,
//     fully separate from the runtime physician/assistant access context.
//   * The whole namespace is feature-flagged and fails closed:
//     PATIENT_PORTAL_V1_ENABLED !== "true" => every /v1/portal request is 403.
//   * Patient-submitted intake is stored as patient-reported data only;
//     verification is forced to "unverified" and physician review is explicit.
//   * Media bytes live in the private PORTAL_MEDIA R2 bucket. There is no
//     public URL of any kind; downloads are authenticated and
//     practice-scoped. A missing binding fails closed with 503.
import { isRuntimeOriginAllowed } from "./platform-cors";
import {
  decryptClinicalPayload,
  encryptClinicalPayload,
  hmacHex,
  normalizeEmail,
  normalizeIranMobile,
  openAuthPayload,
  openPayload,
  randomToken,
  sealAuthPayload,
  sealPayload,
  sha256Hex,
  type RuntimePermission,
} from "./runtime-security";
import {
  createCredential,
  credentialMatches,
  validCredentialValue,
} from "./platform-v3-credential";
import { v3db, v3now, type V3Env, type V3User } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";

type PortalUserRow = {
  id: string;
  practice_id: string;
  patient_id: string;
  status: "active" | "disabled";
  password_hash: string | null;
  password_salt: string | null;
  password_iterations: number | null;
  must_change_password: 0 | 1;
};

type PortalAccessPayload = {
  kind: "portal_access";
  authSource: PortalAuthSource;
  portalUserId: string;
  practiceId: string;
  patientId: string;
  sessionId: string;
  expiresAt: number;
};

type PortalAuthSource = "legacy_portal" | "patient_identity";

type PortalThreadRow = {
  id: string;
  practice_id: string;
  patient_id: string;
  portal_user_id: string;
  physician_id: string;
  status: "open" | "closed";
  last_message_at: string;
};

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 4;
const MAX_MESSAGE_BODY_CHARS = 4000;
const PORTAL_RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_NOTE_CHARS = 5000;
const MAX_SUBMISSION_ITEMS = 200;
const PORTAL_ACCESS_CONTEXT = "PORTAL-ACCESS-V1";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function reply(
  request: Request,
  env: V3Env,
  body: unknown,
  status = 200,
) {
  const origin = request.headers.get("origin");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(isRuntimeOriginAllowed(origin, env)
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "authorization, content-type",
            vary: "Origin",
          }
        : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function portalEnabled(env: V3Env) {
  return (
    String(env.PATIENT_PORTAL_V1_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

function portalPatientDataPath(pathname: string) {
  return (
    pathname === "/v1/portal/submissions" ||
    pathname === "/v1/portal/threads" ||
    /^\/v1\/portal\/threads\/[^/]+\/messages$/.test(pathname) ||
    /^\/v1\/portal\/attachments\/[^/]+$/.test(pathname)
  );
}
function mediaBucket(env: V3Env): R2Bucket | null {
  return (env.PORTAL_MEDIA as R2Bucket | undefined) ?? null;
}

function clinicalKey(env: V3Env): string | null {
  const value = String(env.CLINICAL_DATA_MASTER_KEY ?? "");
  return value ? value : null;
}

function normalizePortalLogin(value: string) {
  const email = normalizeEmail(value);
  if (email) return { kind: "email" as const, normalized: email };
  const mobile = normalizeIranMobile(value);
  if (mobile) return { kind: "mobile" as const, normalized: mobile };
  return null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringOrNull(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : undefined;
}

async function portalRate(
  env: V3Env,
  key: string,
  limit = 6,
  windowMs = PORTAL_RATE_WINDOW_MS,
) {
  const now = v3now();
  const cutoff = new Date(
    Date.now() - windowMs,
  ).toISOString();

  const row = await v3db(env)
    .prepare(
      `INSERT INTO auth_rate_limits(key,window_started_at,count)
       VALUES(?,?,1)
       ON CONFLICT(key) DO UPDATE SET
         count=CASE WHEN auth_rate_limits.window_started_at<? THEN 1 ELSE auth_rate_limits.count+1 END,
         window_started_at=CASE WHEN auth_rate_limits.window_started_at<? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END
       RETURNING count`,
    )
    .bind(
      key,
      now,
      cutoff,
      cutoff,
    )
    .first<{ count: number }>();

  return Boolean(
    row &&
    row.count <= limit
  );
}

async function portalRateKey(
  env: V3Env,
  scope: string,
  subject: string,
) {
  return hmacHex(
    env.SESSION_SECRET,
    `portal-rate:${scope}:${subject}`,
  );
}

async function portalLoginHash(env: V3Env, normalized: string) {
  return hmacHex(env.SESSION_SECRET, `portal-login:${normalized}`);
}

async function portalAudit(
  env: V3Env,
  practiceId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  meta?: unknown,
  actorUserId: string | null = null,
) {
  await v3db(env)
    .prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorUserId,
      practiceId,
      action,
      targetType ?? null,
      targetId ?? null,
      meta === undefined ? null : JSON.stringify(meta),
      v3now(),
    )
    .run();
}
async function issuePortalSession(
  env: V3Env,
  user: PortalUserRow,
  rememberMe: boolean,
  deviceLabel: string,
  familyId?: string,
  parentTokenId?: string,
  authSource: PortalAuthSource = "legacy_portal",
) {
  const sessionId = crypto.randomUUID();
  const refreshToken = randomToken(32);
  const refreshHash = await sha256Hex(refreshToken);
  const ttl = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const refreshExpiresAt = new Date(Date.now() + ttl).toISOString();
  const database = v3db(env);
  const insert = database.prepare(
      `INSERT INTO portal_refresh_tokens
       (id,portal_user_id,token_hash,persistent,expires_at,revoked_at,created_at,
        last_used_at,device_label,family_id,parent_token_id,auth_source)
       VALUES(?,?,?,?,?,NULL,?,?,?,?,?,?)`,
    )
    .bind(
      sessionId,
      user.id,
      refreshHash,
      rememberMe ? 1 : 0,
      refreshExpiresAt,
      v3now(),
      v3now(),
      deviceLabel || null,
      familyId ?? sessionId,
      parentTokenId ?? null,
      authSource,
  );
  if (parentTokenId) {
    const rotatedAt = v3now();
    const consumed = await database.prepare(
      `UPDATE portal_refresh_tokens
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
  const sealed = await sealAuthPayload(
    {
      kind: "portal_access",
      authSource,
      portalUserId: user.id,
      practiceId: user.practice_id,
      patientId: user.patient_id,
      sessionId,
      expiresAt,
    } satisfies PortalAccessPayload,
    env,
    PORTAL_ACCESS_CONTEXT,
  );
  return {
    accessToken: `${sealed.iv}.${sealed.ciphertext}`,
    accessExpiresAt: new Date(expiresAt).toISOString(),
    refreshToken,
    refreshExpiresAt,
    persistent: rememberMe,
    mustChangePassword:
      authSource === "legacy_portal" && user.must_change_password === 1,
  };
}

export async function issuePortalSessionForVerifiedPatientLink(
  env: V3Env,
  patientAccountId: string,
  portalUserId: string,
  rememberMe: boolean,
  deviceLabel: string,
) {
  if (!portalEnabled(env)) return null;
  const user = await v3db(env).prepare(
    `SELECT u.id,u.practice_id,u.patient_id,u.status,u.password_hash,u.password_salt,
            u.password_iterations,u.must_change_password
     FROM portal_users u
     JOIN portal_user_account_links l ON l.portal_user_id=u.id
     JOIN patient_accounts a ON a.id=l.patient_account_id
     WHERE u.id=? AND u.status='active' AND l.patient_account_id=?
       AND l.link_status='verified' AND l.verified_at IS NOT NULL
       AND a.status='active' AND a.proofing_status='verified'`,
  ).bind(portalUserId, patientAccountId).first<PortalUserRow>();
  if (!user) return null;
  const session = await issuePortalSession(
    env,
    user,
    rememberMe,
    deviceLabel.slice(0, 160) || "patient-identity-exchange",
    undefined,
    undefined,
    "patient_identity",
  );
  await portalAudit(
    env,
    user.practice_id,
    "portal.login_via_patient_identity",
    "portal_user",
    user.id,
    { patientAccountId },
  );
  return session;
}

async function requirePortalUser(
  request: Request,
  env: V3Env,
): Promise<PortalUserRow | null> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";
  const [iv, ciphertext, extra] = bearer.split(".");
  if (!iv || !ciphertext || extra) return null;
  const access = await openAuthPayload<PortalAccessPayload>(
    { iv, ciphertext },
    env,
    PORTAL_ACCESS_CONTEXT,
  );
  if (
    !access ||
    access.kind !== "portal_access" ||
    access.expiresAt <= Date.now()
  ) {
    return null;
  }
  const session = await v3db(env)
    .prepare(
      `SELECT revoked_at,expires_at FROM portal_refresh_tokens
       WHERE id=? AND portal_user_id=?`,
    )
    .bind(access.sessionId, access.portalUserId)
    .first<{ revoked_at: string | null; expires_at: string }>();
  if (
    !session ||
    session.revoked_at ||
    Date.parse(session.expires_at) <= Date.now()
  ) {
    return null;
  }
  const user = await v3db(env)
    .prepare(
      `SELECT id,practice_id,patient_id,status,password_hash,password_salt,
              password_iterations,must_change_password
       FROM portal_users WHERE id=?`,
    )
    .bind(access.portalUserId)
    .first<PortalUserRow>();
  if (!user || user.status !== "active") return null;
  if (
    user.practice_id !== access.practiceId ||
    user.patient_id !== access.patientId
  ) {
    return null;
  }
  return user;
}

async function sha256BytesHex(bytes: ArrayBuffer) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesStartWith(
  bytes: Uint8Array,
  expected: number[],
  offset = 0,
) {
  if (bytes.length < offset + expected.length) {
    return false;
  }

  return expected.every(
    (value, index) =>
      bytes[offset + index] === value,
  );
}

function asciiAt(
  bytes: Uint8Array,
  offset: number,
  length: number,
) {
  let result = "";

  for (
    let index = offset;
    index < offset + length &&
    index < bytes.length;
    index += 1
  ) {
    result += String.fromCharCode(
      bytes[index]!,
    );
  }

  return result;
}

function isoBmffBrands(
  bytes: Uint8Array,
) {
  if (
    bytes.length < 12 ||
    asciiAt(bytes, 4, 4) !== "ftyp"
  ) {
    return [];
  }

  const brands = [
    asciiAt(bytes, 8, 4),
  ];

  const end = Math.min(
    bytes.length,
    128,
  );

  for (
    let offset = 16;
    offset + 4 <= end;
    offset += 4
  ) {
    brands.push(
      asciiAt(bytes, offset, 4),
    );
  }

  return brands;
}

function portalMediaSignatureMatches(
  mime: string,
  value: ArrayBuffer,
) {
  const bytes = new Uint8Array(value);

  if (mime === "image/jpeg") {
    return bytesStartWith(
      bytes,
      [0xff, 0xd8, 0xff],
    );
  }

  if (mime === "image/png") {
    return bytesStartWith(
      bytes,
      [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ],
    );
  }

  if (mime === "image/webp") {
    return (
      asciiAt(bytes, 0, 4) === "RIFF" &&
      asciiAt(bytes, 8, 4) === "WEBP"
    );
  }

  if (mime === "video/webm") {
    return bytesStartWith(
      bytes,
      [0x1a, 0x45, 0xdf, 0xa3],
    );
  }

  const brands = isoBmffBrands(bytes);

  if (brands.length === 0) {
    return false;
  }

  const normalizedBrands =
    brands.map(
      (brand) => brand.toLowerCase(),
    );

  if (mime === "image/heic") {
    return normalizedBrands.some(
      (brand) =>
        [
          "heic",
          "heix",
          "hevc",
          "hevx",
          "heim",
          "heis",
          "hevm",
          "hevs",
        ].includes(brand),
    );
  }

  if (mime === "video/quicktime") {
    return brands.includes("qt  ");
  }

  if (mime === "video/mp4") {
    const mp4Brands = new Set([
      "isom",
      "iso2",
      "iso3",
      "iso4",
      "iso5",
      "iso6",
      "mp41",
      "mp42",
      "avc1",
      "dash",
      "m4v ",
      "f4v ",
      "3gp4",
      "3gp5",
    ]);

    return normalizedBrands.some(
      (brand) => mp4Brands.has(brand),
    );
  }

  return false;
}

function portalMediaExtension(
  mime: string,
) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "bin";
  }
}

async function cleanupPortalMedia(
  bucket: R2Bucket | null,
  keys: string[],
) {
  if (!bucket || keys.length === 0) {
    return;
  }

  for (const mediaKey of keys) {
    try {
      await bucket.delete(mediaKey);
    } catch {
      // Best-effort compensation for an R2 write that has no
      // corresponding committed D1 attachment row.
    }
  }
}
// --- Patient-reported intake sanitization ----------------------------------
// Patient entries are stored exactly as REPORTED. verification is never
// accepted from the patient; it is forced to "unverified". Only a physician
// can confirm values inside the Patient Record.

function bounded(value: unknown, min: number, max: number) {
  const numeric = numberOrNull(value);
  return numeric !== undefined && numeric >= min && numeric <= max
    ? numeric
    : undefined;
}

function sanitizePatientMedications(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const items: Record<string, unknown>[] = [];
  for (const entry of raw.slice(0, MAX_SUBMISSION_ITEMS)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const value = entry as Record<string, unknown>;
    const genericName = String(value.genericName ?? "")
      .trim()
      .slice(0, 200);
    if (!genericName) continue;
    items.push({
      genericName,
      doseAmount: numberOrNull(value.doseAmount),
      doseUnit: stringOrNull(value.doseUnit, 40),
      frequencyPerDay: numberOrNull(value.frequencyPerDay),
      frequencyCode: stringOrNull(value.frequencyCode, 60),
      status:
        value.status === "held" || value.status === "stopped"
          ? value.status
          : "active",
      verification: "unverified",
    });
  }
  return items;
}

function sanitizePatientLabs(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const items: Record<string, unknown>[] = [];
  for (const entry of raw.slice(0, MAX_SUBMISSION_ITEMS)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const value = entry as Record<string, unknown>;
    const rawName = String(value.rawName ?? "").trim().slice(0, 200);
    if (!rawName) continue;
    const observedAt = stringOrNull(value.observedAt, 40);
    items.push({
      rawName,
      canonicalKey: stringOrNull(value.canonicalKey, 120),
      canonicalName: stringOrNull(value.canonicalName, 200),
      value: numberOrNull(value.value),
      valueText: stringOrNull(value.valueText, 120),
      unit: stringOrNull(value.unit, 60),
      specimen: stringOrNull(value.specimen, 80),
      referenceRange: stringOrNull(value.referenceRange, 120),
      observedAt:
        observedAt && !Number.isNaN(Date.parse(observedAt))
          ? new Date(observedAt).toISOString()
          : undefined,
      sourceKind: "manual",
      verification: "unverified",
    });
  }
  return items;
}

function sanitizePatientVitals(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const vitals: Record<string, unknown> = {
    weightKg: bounded(value.weightKg, 1, 500),
    heightCm: bounded(value.heightCm, 20, 280),
    systolicBp: bounded(value.systolicBp, 40, 300),
    diastolicBp: bounded(value.diastolicBp, 20, 250),
    pulseBpm: bounded(value.pulseBpm, 20, 300),
  };
  return Object.values(vitals).some((item) => item !== undefined)
    ? vitals
    : null;
}

// --- Portal session handlers -------------------------------------------------

async function portalAccessPayload(request: Request, env: V3Env) {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";
  const [iv, ciphertext, extra] = bearer.split(".");
  if (!iv || !ciphertext || extra) return null;
  return openAuthPayload<PortalAccessPayload>(
    { iv, ciphertext },
    env,
    PORTAL_ACCESS_CONTEXT,
  );
}

async function portalLogin(request: Request, env: V3Env) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reply(request, env, { error: "invalid_json" }, 400);
  }
  const login = normalizePortalLogin(String(body.login ?? ""));
  const password = String(body.password ?? "");
  if (!login || !validCredentialValue(password)) {
    return reply(request, env, { error: "invalid_credentials" }, 401);
  }
  const loginHash = await portalLoginHash(
    env,
    login.normalized,
  );

  const clientIp =
    request.headers.get("cf-connecting-ip") ?? "unknown";

  const loginAccountRateKey = await portalRateKey(
    env,
    "login-account",
    loginHash,
  );

  const loginIpRateKey = await portalRateKey(
    env,
    "login-ip",
    clientIp,
  );

  const accountAllowed = await portalRate(
    env,
    loginAccountRateKey,
    6,
  );

  const ipAllowed = await portalRate(
    env,
    loginIpRateKey,
    30,
  );

  if (!accountAllowed || !ipAllowed) {
    return reply(
      request,
      env,
      { error: "rate_limited" },
      429,
    );
  }
  const user = await v3db(env)
    .prepare(
      `SELECT id,practice_id,patient_id,status,password_hash,password_salt,
              password_iterations,must_change_password
       FROM portal_users WHERE login_hash=? LIMIT 1`,
    )
    .bind(loginHash)
    .first<PortalUserRow>();
  if (!user || user.status !== "active") {
    return reply(request, env, { error: "invalid_credentials" }, 401);
  }
  if (
    !user.password_hash ||
    !user.password_salt ||
    !user.password_iterations
  ) {
    return reply(request, env, { error: "invalid_credentials" }, 401);
  }
  if (
    !(await credentialMatches(password, {
      hash: user.password_hash,
      salt: user.password_salt,
      iterations: user.password_iterations,
    }))
  ) {
    return reply(request, env, { error: "invalid_credentials" }, 401);
  }
  const rememberMe =
    user.must_change_password === 1
      ? false
      : body.rememberMe === true;

  await portalAudit(
    env,
    user.practice_id,
    "portal.login",
    "portal_user",
    user.id,
  );
  return reply(
    request,
    env,
    await issuePortalSession(
      env,
      user,
      rememberMe,
      String(body.deviceLabel ?? "portal-web"),
    ),
  );
}

async function portalRefresh(request: Request, env: V3Env) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reply(request, env, { error: "invalid_json" }, 400);
  }

  const refreshToken = String(body.refreshToken ?? "").trim();
  if (
    refreshToken.length < 32 ||
    refreshToken.length > 200
  ) {
    return reply(request, env, { error: "auth_required" }, 401);
  }

  const refreshRateKey = await portalRateKey(
    env,
    "refresh-ip",
    request.headers.get("cf-connecting-ip") ?? "unknown",
  );

  if (!(await portalRate(
    env,
    refreshRateKey,
    120,
  ))) {
    return reply(
      request,
      env,
      { error: "rate_limited" },
      429,
    );
  }

  const refreshHash = await sha256Hex(refreshToken);
  const token = await v3db(env)
    .prepare(
      `SELECT id,portal_user_id,persistent,expires_at,revoked_at,
              family_id,replaced_by_token_id,auth_source
       FROM portal_refresh_tokens WHERE token_hash=?`,
    )
    .bind(refreshHash)
    .first<{
      id: string;
      portal_user_id: string;
      persistent: 0 | 1;
      expires_at: string;
      revoked_at: string | null;
      family_id: string | null;
      replaced_by_token_id: string | null;
      auth_source: PortalAuthSource;
    }>();

  if (
    !token ||
    Date.parse(token.expires_at) <= Date.now()
  ) {
    return reply(request, env, { error: "auth_required" }, 401);
  }

  const familyId = token.family_id ?? token.id;
  if (token.revoked_at) {
    if (token.replaced_by_token_id) {
      const compromisedAt = v3now();
      await v3db(env).prepare(
        `UPDATE portal_refresh_tokens
         SET revoked_at=COALESCE(revoked_at,?),compromised_at=?
         WHERE family_id=?`,
      ).bind(compromisedAt, compromisedAt, familyId).run();
      return reply(request, env, { error: "refresh_token_reuse_detected" }, 401);
    }
    return reply(request, env, { error: "auth_required" }, 401);
  }

  const user = await v3db(env)
    .prepare(
      `SELECT id,practice_id,patient_id,status,password_hash,password_salt,
              password_iterations,must_change_password
       FROM portal_users WHERE id=?`,
    )
    .bind(token.portal_user_id)
    .first<PortalUserRow>();

  if (!user || user.status !== "active") {
    return reply(request, env, { error: "auth_required" }, 401);
  }

  // Exactly-once refresh rotation. If another request already consumed
  // this token, this request loses the race and must fail closed.
  try {
    return reply(
      request,
      env,
      await issuePortalSession(
        env,
        user,
        token.persistent === 1,
        "portal-refresh",
        familyId,
        token.id,
        token.auth_source,
      ),
    );
  } catch {
    return reply(request, env, { error: "refresh_token_replayed" }, 401);
  }
}

async function portalLogout(request: Request, env: V3Env) {
  const access = await portalAccessPayload(request, env);
  if (!access || access.kind !== "portal_access") {
    return reply(request, env, { error: "auth_required" }, 401);
  }
  await v3db(env)
    .prepare(
      `UPDATE portal_refresh_tokens SET revoked_at=?
       WHERE id=? AND portal_user_id=? AND revoked_at IS NULL`,
    )
    .bind(v3now(), access.sessionId, access.portalUserId)
    .run();
  await portalAudit(
    env,
    access.practiceId,
    "portal.logout",
    "portal_user",
    access.portalUserId,
  );
  return reply(request, env, { ok: true });
}

async function portalSession(request: Request, env: V3Env) {
  const user = await requirePortalUser(request, env);
  if (!user) return reply(request, env, { error: "auth_required" }, 401);
  const access = await portalAccessPayload(request, env);
  const authSource = access?.authSource ?? "legacy_portal";
  return reply(request, env, {
    user: {
      portalUserId: user.id,
      practiceId: user.practice_id,
      patientId: user.patient_id,
      mustChangePassword:
        authSource === "legacy_portal" && user.must_change_password === 1,
    },
  });
}

async function portalChangePassword(request: Request, env: V3Env) {
  const user = await requirePortalUser(request, env);

  if (!user) {
    return reply(request, env, { error: "auth_required" }, 401);
  }

  const passwordRateKey = await portalRateKey(
    env,
    "password-change",
    user.id,
  );

  if (!(await portalRate(
    env,
    passwordRateKey,
    6,
  ))) {
    return reply(
      request,
      env,
      { error: "rate_limited" },
      429,
    );
  }

  const access = await portalAccessPayload(request, env);

  if (
    !access ||
    access.kind !== "portal_access" ||
    access.portalUserId !== user.id ||
    access.practiceId !== user.practice_id ||
    access.patientId !== user.patient_id
  ) {
    return reply(request, env, { error: "auth_required" }, 401);
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reply(request, env, { error: "invalid_json" }, 400);
  }

  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!validCredentialValue(newPassword)) {
    return reply(
      request,
      env,
      { error: "password_policy_failed" },
      422,
    );
  }

  if (
    !user.password_hash ||
    !user.password_salt ||
    !user.password_iterations
  ) {
    return reply(
      request,
      env,
      { error: "password_not_set" },
      409,
    );
  }

  if (
    !(await credentialMatches(currentPassword, {
      hash: user.password_hash,
      salt: user.password_salt,
      iterations: user.password_iterations,
    }))
  ) {
    return reply(
      request,
      env,
      { error: "invalid_credentials" },
      401,
    );
  }

  const currentSession = await v3db(env)
    .prepare(
      `SELECT persistent,device_label,auth_source
       FROM portal_refresh_tokens
       WHERE id=? AND portal_user_id=? AND revoked_at IS NULL`,
    )
    .bind(
      access.sessionId,
      user.id,
    )
    .first<{
      persistent: 0 | 1;
      device_label: string | null;
      auth_source: PortalAuthSource;
    }>();

  if (!currentSession) {
    return reply(
      request,
      env,
      { error: "auth_required" },
      401,
    );
  }

  const credential = await createCredential(newPassword);
  const now = v3now();

  try {
    await v3db(env).batch([
      v3db(env)
        .prepare(
          `UPDATE portal_users
           SET password_hash=?,password_salt=?,password_iterations=?,
               password_updated_at=?,must_change_password=0,updated_at=?
           WHERE id=?`,
        )
        .bind(
          credential.hash,
          credential.salt,
          credential.iterations,
          now,
          now,
          user.id,
        ),
      v3db(env)
        .prepare(
          `UPDATE portal_refresh_tokens
           SET revoked_at=?,last_used_at=?
           WHERE portal_user_id=? AND revoked_at IS NULL`,
        )
        .bind(
          now,
          now,
          user.id,
        ),
      v3db(env)
        .prepare(
          `INSERT INTO audit_log
           (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
           VALUES(?,?,?,?,?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          null,
          user.practice_id,
          "portal.password_changed",
          "portal_user",
          user.id,
          JSON.stringify({
            sessionsRevoked: true,
          }),
          now,
        ),
    ]);
  } catch {
    return reply(
      request,
      env,
      { error: "password_change_persist_failed" },
      500,
    );
  }
  const updatedUser: PortalUserRow = {
    ...user,
    password_hash: credential.hash,
    password_salt: credential.salt,
    password_iterations: credential.iterations,
    must_change_password: 0,
  };

  const replacementSession = await issuePortalSession(
    env,
    updatedUser,
    currentSession.persistent === 1,
    currentSession.device_label ?? "portal-password-change",
    undefined,
    undefined,
    currentSession.auth_source,
  );

  return reply(
    request,
    env,
    {
      ok: true,
      ...replacementSession,
    },
  );
}
// --- Patient intake submissions (patient-reported, physician-reviewed) ------

async function portalCreateSubmission(request: Request, env: V3Env) {
  const user = await requirePortalUser(request, env);
  if (!user) return reply(request, env, { error: "auth_required" }, 401);

  const submissionRateKey = await portalRateKey(
    env,
    "submission",
    user.id,
  );

  if (!(await portalRate(
    env,
    submissionRateKey,
    20,
  ))) {
    return reply(
      request,
      env,
      { error: "rate_limited" },
      429,
    );
  }
  const key = clinicalKey(env);
  if (!key) {
    return reply(
      request,
      env,
      { error: "CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED" },
      500,
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reply(request, env, { error: "invalid_json" }, 400);
  }
  const kind = String(body.kind ?? "");
  if (!["medications", "labs", "vitals", "note"].includes(kind)) {
    return reply(request, env, { error: "invalid_submission_kind" }, 422);
  }
  let payload: Record<string, unknown>;
  if (kind === "medications") {
    const medications = sanitizePatientMedications(body.medications);
    if (medications.length === 0) {
      return reply(request, env, { error: "empty_submission" }, 422);
    }
    payload = { kind, medications };
  } else if (kind === "labs") {
    const labs = sanitizePatientLabs(body.labs);
    if (labs.length === 0) {
      return reply(request, env, { error: "empty_submission" }, 422);
    }
    payload = { kind, labs };
  } else if (kind === "vitals") {
    const vitals = sanitizePatientVitals(body.vitals);
    if (!vitals) {
      return reply(request, env, { error: "empty_submission" }, 422);
    }
    payload = { kind, vitals };
  } else {
    const note = stringOrNull(body.note, MAX_NOTE_CHARS);
    if (!note) {
      return reply(request, env, { error: "empty_submission" }, 422);
    }
    payload = { kind, note };
  }
  payload.reportedBy = "patient";
  payload.submittedAt = v3now();

  const encrypted = await encryptClinicalPayload(
    payload,
    key,
    `portal-submission:${user.practice_id}:${user.patient_id}`,
  );
  const id = crypto.randomUUID();
  const now = v3now();
  try {
    await v3db(env)
      .prepare(
        `INSERT INTO portal_submissions
         (id,portal_user_id,practice_id,patient_id,kind,status,
          payload_ciphertext,payload_iv,payload_auth_tag,schema_version,
          reviewed_by,reviewed_at,encounter_id,created_at,updated_at)
         VALUES(?,?,?,?,?,'submitted',?,?,?,?,NULL,NULL,NULL,?,?)`,
      )
      .bind(
        id,
        user.id,
        user.practice_id,
        user.patient_id,
        kind,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        "portal-submission-v1",
        now,
        now,
      )
      .run();
  } catch {
    return reply(request, env, { error: "submission_persist_failed" }, 500);
  }
  await portalAudit(
    env,
    user.practice_id,
    "portal.submission_created",
    "portal_submission",
    id,
    { portalUserId: user.id, patientId: user.patient_id, kind },
  );
  return reply(request, env, {
    submission: { id, kind, status: "submitted", createdAt: now },
  });
}

async function portalListSubmissions(request: Request, env: V3Env) {
  const user = await requirePortalUser(request, env);
  if (!user) return reply(request, env, { error: "auth_required" }, 401);
  const rows = await v3db(env)
    .prepare(
      `SELECT id,kind,status,created_at,reviewed_at,encounter_id
       FROM portal_submissions
       WHERE portal_user_id=?
       ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(user.id)
    .all<{
      id: string;
      kind: string;
      status: string;
      created_at: string;
      reviewed_at: string | null;
      encounter_id: string | null;
    }>();
  return reply(request, env, {
    submissions: rows.results.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
      ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
      ...(row.encounter_id ? { encounterId: row.encounter_id } : {}),
    })),
  });
}

// --- Secure messaging (WS-3) -------------------------------------------------

type ParsedMessage = { body: string; files: File[] };

async function loadThreadForPatient(
  env: V3Env,
  threadId: string,
  user: PortalUserRow,
): Promise<PortalThreadRow | null> {
  return v3db(env)
    .prepare(
      `SELECT id,practice_id,patient_id,portal_user_id,physician_id,status,last_message_at
       FROM portal_threads
       WHERE id=? AND portal_user_id=? AND practice_id=?`,
    )
    .bind(threadId, user.id, user.practice_id)
    .first<PortalThreadRow>();
}

async function loadThreadForClinic(
  env: V3Env,
  threadId: string,
  practiceId: string,
): Promise<PortalThreadRow | null> {
  return v3db(env)
    .prepare(
      `SELECT id,practice_id,patient_id,portal_user_id,physician_id,status,last_message_at
       FROM portal_threads WHERE id=? AND practice_id=?`,
    )
    .bind(threadId, practiceId)
    .first<PortalThreadRow>();
}

async function parseMessageContent(
  request: Request,
): Promise<ParsedMessage | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return null;
    }
    let body = "";
    const payloadRaw = form.get("payload");
    if (typeof payloadRaw === "string") {
      try {
        const parsed = JSON.parse(payloadRaw) as Record<string, unknown>;
        body = String(parsed.body ?? "");
      } catch {
        return null;
      }
    }
    const files: File[] = [];
    for (const value of form.getAll("files")) {
      if (value instanceof File) files.push(value);
    }
    for (const value of form.getAll("file")) {
      if (value instanceof File) files.push(value);
    }
    return {
      body: body.trim().slice(0, MAX_MESSAGE_BODY_CHARS),
      files: files.slice(0, MAX_ATTACHMENTS_PER_MESSAGE),
    };
  }
  try {
    const parsed = await request.json() as Record<string, unknown>;
    return {
      body: String(parsed.body ?? "").trim().slice(0, MAX_MESSAGE_BODY_CHARS),
      files: [],
    };
  } catch {
    return null;
  }
}

type MessagePersistResult =
  | { ok: true; message: Record<string, unknown> }
  | { ok: false; error: string; status: number };

async function persistThreadMessage(
  env: V3Env,
  thread: PortalThreadRow,
  sender: {
    role: "patient" | "physician";
    portalUserId?: string;
    runtimeUserId?: string;
  },
  content: ParsedMessage,
  key: string,
): Promise<MessagePersistResult> {
  const bucket = mediaBucket(env);

  const files: {
    file: File;
    mediaKind: "image" | "video";
    mime: string;
  }[] = [];

  let totalMediaBytes = 0;

  for (const file of content.files) {
    const mime =
      String(file.type ?? "")
        .trim()
        .toLowerCase();

    const mediaKind =
      IMAGE_MIME_TYPES.has(mime)
        ? "image" as const
        : VIDEO_MIME_TYPES.has(mime)
          ? "video" as const
          : null;

    if (!mediaKind) {
      return {
        ok: false,
        error: "unsupported_media_type",
        status: 415,
      };
    }

    if (
      file.size <= 0 ||
      file.size > MAX_MEDIA_BYTES
    ) {
      return {
        ok: false,
        error: "media_size_rejected",
        status: 413,
      };
    }

    totalMediaBytes += file.size;

    if (
      totalMediaBytes >
      MAX_TOTAL_MEDIA_BYTES
    ) {
      return {
        ok: false,
        error: "media_total_size_rejected",
        status: 413,
      };
    }

    files.push({
      file,
      mediaKind,
      mime,
    });
  }

  if (
    files.length > 0 &&
    !bucket
  ) {
    return {
      ok: false,
      error: "PORTAL_MEDIA_NOT_CONFIGURED",
      status: 503,
    };
  }

  if (
    !content.body &&
    files.length === 0
  ) {
    return {
      ok: false,
      error: "empty_message",
      status: 422,
    };
  }

  const now = v3now();
  const messageId = crypto.randomUUID();

  const encryptedBody =
    await encryptClinicalPayload(
      { text: content.body },
      key,
      `portal-message:${thread.practice_id}:${thread.id}`,
    );

  const statements = [
    v3db(env)
      .prepare(
        `INSERT INTO portal_messages
         (id,thread_id,practice_id,sender_role,sender_portal_user_id,
          sender_runtime_user_id,body_ciphertext,body_iv,body_auth_tag,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        messageId,
        thread.id,
        thread.practice_id,
        sender.role,
        sender.portalUserId ?? null,
        sender.runtimeUserId ?? null,
        encryptedBody.ciphertext,
        encryptedBody.iv,
        encryptedBody.authTag,
        now,
      ),
    v3db(env)
      .prepare(
        `UPDATE portal_threads
         SET last_message_at=?,updated_at=?
         WHERE id=?`,
      )
      .bind(
        now,
        now,
        thread.id,
      ),
  ];

  const attachments:
    Record<string, unknown>[] = [];

  const uploadedMediaKeys:
    string[] = [];

  for (const item of files) {
    const attachmentId =
      crypto.randomUUID();

    const mediaKey =
      `portal/${thread.practice_id}/${thread.id}/${attachmentId}`;

    let bytes: ArrayBuffer;

    try {
      bytes =
        await item.file.arrayBuffer();
    } catch {
      await cleanupPortalMedia(
        bucket,
        uploadedMediaKeys,
      );

      return {
        ok: false,
        error: "media_upload_failed",
        status: 502,
      };
    }

    if (
      !portalMediaSignatureMatches(
        item.mime,
        bytes,
      )
    ) {
      await cleanupPortalMedia(
        bucket,
        uploadedMediaKeys,
      );

      return {
        ok: false,
        error: "media_signature_rejected",
        status: 415,
      };
    }

    let digest: string;

    try {
      digest =
        await sha256BytesHex(bytes);
    } catch {
      await cleanupPortalMedia(
        bucket,
        uploadedMediaKeys,
      );

      return {
        ok: false,
        error: "media_upload_failed",
        status: 502,
      };
    }

    // Track before PUT so ambiguous remote failures are also
    // eligible for compensating deletion.
    uploadedMediaKeys.push(mediaKey);

    try {
      const upload =
        await bucket!.put(
          mediaKey,
          bytes,
          {
            httpMetadata: {
              contentType: item.mime,
            },
          },
        );

      if (!upload) {
        await cleanupPortalMedia(
          bucket,
          uploadedMediaKeys,
        );

        return {
          ok: false,
          error: "media_upload_failed",
          status: 502,
        };
      }
    } catch {
      await cleanupPortalMedia(
        bucket,
        uploadedMediaKeys,
      );

      return {
        ok: false,
        error: "media_upload_failed",
        status: 502,
      };
    }

    statements.push(
      v3db(env)
        .prepare(
          `INSERT INTO portal_message_attachments
           (id,message_id,thread_id,practice_id,media_key,media_kind,mime_type,size_bytes,sha256,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          attachmentId,
          messageId,
          thread.id,
          thread.practice_id,
          mediaKey,
          item.mediaKind,
          item.mime,
          item.file.size,
          digest,
          now,
        ),
    );

    attachments.push({
      id: attachmentId,
      mediaKind: item.mediaKind,
      mimeType: item.mime,
      sizeBytes: item.file.size,
    });
  }

  statements.push(
    v3db(env)
      .prepare(
        `INSERT INTO audit_log
         (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        sender.runtimeUserId ?? null,
        thread.practice_id,
        "portal.message_sent",
        "portal_thread",
        thread.id,
        JSON.stringify({
          messageId,
          senderRole: sender.role,
          attachmentCount:
            attachments.length,
        }),
        now,
      ),
  );

  try {
    await v3db(env).batch(
      statements,
    );
  } catch {
    await cleanupPortalMedia(
      bucket,
      uploadedMediaKeys,
    );

    return {
      ok: false,
      error: "message_persist_failed",
      status: 500,
    };
  }

  return {
    ok: true,
    message: {
      id: messageId,
      threadId: thread.id,
      senderRole: sender.role,
      body: content.body,
      attachments,
      createdAt: now,
    },
  };
}
// --- Patient-side thread handlers --------------------------------------------

async function portalListThreads(request: Request, env: V3Env) {
  const user = await requirePortalUser(request, env);
  if (!user) return reply(request, env, { error: "auth_required" }, 401);
  const rows = await v3db(env)
    .prepare(
      `SELECT id,physician_id,encounter_id,status,last_message_at,created_at
       FROM portal_threads
       WHERE portal_user_id=? AND practice_id=?
       ORDER BY last_message_at DESC LIMIT 50`,
    )
    .bind(user.id, user.practice_id)
    .all<{
      id: string;
      physician_id: string;
      encounter_id: string | null;
      status: string;
      last_message_at: string;
      created_at: string;
    }>();
  return reply(request, env, {
    threads: rows.results.map((row) => ({
      id: row.id,
      physicianId: row.physician_id,
      status: row.status,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      ...(row.encounter_id ? { encounterId: row.encounter_id } : {}),
    })),
  });
}

async function portalThreadMessages(
  request: Request,
  env: V3Env,
  threadId: string,
) {
  const user = await requirePortalUser(request, env);
  if (!user) return reply(request, env, { error: "auth_required" }, 401);
  const thread = await loadThreadForPatient(env, threadId, user);
  if (!thread) return reply(request, env, { error: "thread_not_found" }, 404);
  const result = await threadMessagesPayload(
    env,
    thread,
    new URL(request.url),
  );
  return result.ok
    ? reply(request, env, result.body)
    : reply(request, env, { error: result.error }, result.status);
}

async function adminThreadMessages(
  request: Request,
  env: V3Env,
  clinician: V3User,
  threadId: string,
) {
  if (clinician.role !== "physician") {
    return reply(
      request,
      env,
      { error: "physician_authority_required" },
      403,
    );
  }

  if (!clinicianCan(clinician, "handoff.read")) {
    return reply(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  const thread = await loadThreadForClinic(
    env,
    threadId,
    clinician.practiceId,
  );

  if (!thread) {
    return reply(
      request,
      env,
      { error: "thread_not_found" },
      404,
    );
  }

  if (thread.physician_id !== clinician.id) {
    return reply(
      request,
      env,
      { error: "thread_not_assigned_to_physician" },
      403,
    );
  }

  const result = await threadMessagesPayload(
    env,
    thread,
    new URL(request.url),
  );

  return result.ok
    ? reply(request, env, result.body)
    : reply(
        request,
        env,
        { error: result.error },
        result.status,
      );
}
type ThreadMessagesResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

async function threadMessagesPayload(
  env: V3Env,
  thread: PortalThreadRow,
  url: URL,
): Promise<ThreadMessagesResult> {
  const key = clinicalKey(env);
  if (!key) {
    return {
      ok: false,
      status: 500,
      error: "CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED",
    };
  }
  const before = url.searchParams.get("before");
  const rows = await (before
    ? v3db(env)
        .prepare(
          `SELECT id,sender_role,body_ciphertext,body_iv,body_auth_tag,created_at
           FROM portal_messages WHERE thread_id=? AND created_at<?
           ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(thread.id, before)
    : v3db(env)
        .prepare(
          `SELECT id,sender_role,body_ciphertext,body_iv,body_auth_tag,created_at
           FROM portal_messages WHERE thread_id=?
           ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(thread.id)
  ).all<{
    id: string;
    sender_role: string;
    body_ciphertext: string;
    body_iv: string;
    body_auth_tag: string;
    created_at: string;
  }>();
  const attachmentRows = await v3db(env)
    .prepare(
      `SELECT id,message_id,media_kind,mime_type,size_bytes
       FROM portal_message_attachments WHERE thread_id=?`,
    )
    .bind(thread.id)
    .all<{
      id: string;
      message_id: string;
      media_kind: string;
      mime_type: string;
      size_bytes: number;
    }>();
  const attachmentsByMessage = new Map<string, Record<string, unknown>[]>();
  for (const row of attachmentRows.results) {
    const list = attachmentsByMessage.get(row.message_id) ?? [];
    list.push({
      id: row.id,
      mediaKind: row.media_kind,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
    });
    attachmentsByMessage.set(row.message_id, list);
  }
  const messages: Record<string, unknown>[] = [];
  for (const row of rows.results) {
    const body = await decryptClinicalPayload<{ text?: string }>(
      {
        ciphertext: row.body_ciphertext,
        iv: row.body_iv,
        authTag: row.body_auth_tag,
      },
      key,
      `portal-message:${thread.practice_id}:${thread.id}`,
    );
    messages.push({
      id: row.id,
      threadId: thread.id,
      senderRole: row.sender_role,
      body: body?.text ?? "",
      attachments: attachmentsByMessage.get(row.id) ?? [],
      createdAt: row.created_at,
    });
  }
  messages.reverse();
  return {
    ok: true,
    body: {
      thread: {
        id: thread.id,
        physicianId: thread.physician_id,
        status: thread.status,
        lastMessageAt: thread.last_message_at,
      },
      messages,
      nextCursor:
        rows.results.length === 50
          ? rows.results[rows.results.length - 1]?.created_at ?? null
          : null,
    },
  };
}

async function portalSendMessage(
  request: Request,
  env: V3Env,
  threadId: string,
) {
  const user = await requirePortalUser(request, env);
  if (!user) return reply(request, env, { error: "auth_required" }, 401);
  const thread = await loadThreadForPatient(env, threadId, user);
  if (!thread) return reply(request, env, { error: "thread_not_found" }, 404);
  if (thread.status !== "open") {
    return reply(request, env, { error: "portal_thread_closed" }, 409);
  }

  const messageRateKey = await portalRateKey(
    env,
    "patient-message",
    user.id,
  );

  if (!(await portalRate(
    env,
    messageRateKey,
    30,
  ))) {
    return reply(
      request,
      env,
      { error: "rate_limited" },
      429,
    );
  }
  const key = clinicalKey(env);
  if (!key) {
    return reply(
      request,
      env,
      { error: "CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED" },
      500,
    );
  }
  const content = await parseMessageContent(request);
  if (!content) return reply(request, env, { error: "invalid_message" }, 400);
  const result = await persistThreadMessage(
    env,
    thread,
    { role: "patient", portalUserId: user.id },
    content,
    key,
  );
  if (!result.ok) {
    return reply(request, env, { error: result.error }, result.status);
  }
  return reply(request, env, { message: result.message });
}

// --- Attachment downloads (authenticated, private, never public URLs) --------

async function serveAttachment(
  request: Request,
  env: V3Env,
  attachmentId: string,
  practiceId: string,
  portalUserId: string | null,
) {
  const bucket = mediaBucket(env);

  if (!bucket) {
    return reply(
      request,
      env,
      {
        error:
          "PORTAL_MEDIA_NOT_CONFIGURED",
      },
      503,
    );
  }

  const row = await (
    portalUserId
      ? v3db(env)
          .prepare(
            `SELECT a.media_key,a.mime_type,a.size_bytes,a.sha256
             FROM portal_message_attachments a
             JOIN portal_threads t ON t.id=a.thread_id
             WHERE a.id=? AND a.practice_id=? AND t.portal_user_id=?`,
          )
          .bind(
            attachmentId,
            practiceId,
            portalUserId,
          )
      : v3db(env)
          .prepare(
            `SELECT a.media_key,a.mime_type,a.size_bytes,a.sha256
             FROM portal_message_attachments a
             JOIN portal_threads t ON t.id=a.thread_id
             WHERE a.id=? AND a.practice_id=?`,
          )
          .bind(
            attachmentId,
            practiceId,
          )
  ).first<{
    media_key: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
  }>();

  if (!row) {
    return reply(
      request,
      env,
      { error: "attachment_not_found" },
      404,
    );
  }

  const object =
    await bucket.get(row.media_key);

  if (!object) {
    return reply(
      request,
      env,
      { error: "attachment_not_found" },
      404,
    );
  }

  let bytes: ArrayBuffer;
  let digest: string;

  try {
    bytes = await object.arrayBuffer();
    digest =
      await sha256BytesHex(bytes);
  } catch {
    return reply(
      request,
      env,
      { error: "attachment_read_failed" },
      502,
    );
  }

  if (
    bytes.byteLength !==
      row.size_bytes ||
    digest !== row.sha256
  ) {
    return reply(
      request,
      env,
      {
        error:
          "attachment_integrity_mismatch",
      },
      409,
    );
  }

  const normalizedMime =
    String(row.mime_type ?? "")
      .trim()
      .toLowerCase();

  const safeMime =
    IMAGE_MIME_TYPES.has(
      normalizedMime,
    ) ||
    VIDEO_MIME_TYPES.has(
      normalizedMime,
    )
      ? normalizedMime
      : "application/octet-stream";

  const extension =
    portalMediaExtension(safeMime);

  const origin =
    request.headers.get("origin");

  return new Response(
    bytes,
    {
      headers: {
        ...(isRuntimeOriginAllowed(origin, env)
          ? {
              "access-control-allow-origin":
                origin,
              vary: "Origin",
            }
          : {}),
        "content-type": safeMime,
        "content-length":
          String(bytes.byteLength),
        "cache-control":
          "private, no-store",
        "content-disposition":
          `attachment; filename="glymize-attachment.${extension}"`,
        "x-content-type-options":
          "nosniff",
        "content-security-policy":
          "default-src 'none'; sandbox",
        "referrer-policy":
          "no-referrer",
      },
    },
  );
}
async function portalDownloadAttachment(
  request: Request,
  env: V3Env,
  attachmentId: string,
) {
  const user = await requirePortalUser(request, env);
  if (!user) return reply(request, env, { error: "auth_required" }, 401);
  return serveAttachment(request, env, attachmentId, user.practice_id, user.id);
}

// --- Clinician-side portal review (runtime physician/assistant sessions) -----

function clinicianCan(clinician: V3User, permission: RuntimePermission) {
  return clinician.permissions.includes(permission);
}

type PortalSubmissionStatus =
  | "submitted"
  | "acknowledged"
  | "reviewed"
  | "archived";

function portalSubmissionTransitionAllowed(
  current: PortalSubmissionStatus,
  target: PortalSubmissionStatus,
) {
  if (current === "submitted") {
    return (
      target === "acknowledged" ||
      target === "reviewed" ||
      target === "archived"
    );
  }

  if (current === "acknowledged") {
    return (
      target === "reviewed" ||
      target === "archived"
    );
  }

  if (current === "reviewed") {
    return target === "archived";
  }

  return false;
}

async function adminSubmissionsList(
  request: Request,
  env: V3Env,
  clinician: V3User,
) {
  if (!clinicianCan(clinician, "handoff.read")) {
    return reply(request, env, { error: "permission_denied" }, 403);
  }
  const key = clinicalKey(env);
  if (!key) {
    return reply(
      request,
      env,
      { error: "CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED" },
      500,
    );
  }
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const rows = await v3db(env)
    .prepare(
      `SELECT id,portal_user_id,patient_id,kind,status,created_at,reviewed_at,
              encounter_id,payload_ciphertext,payload_iv,payload_auth_tag
       FROM portal_submissions WHERE practice_id=?
       ORDER BY created_at DESC LIMIT 200`,
    )
    .bind(clinician.practiceId)
    .all<{
      id: string;
      portal_user_id: string;
      patient_id: string;
      kind: string;
      status: string;
      created_at: string;
      reviewed_at: string | null;
      encounter_id: string | null;
      payload_ciphertext: string;
      payload_iv: string;
      payload_auth_tag: string;
    }>();
  const submissions: Record<string, unknown>[] = [];
  for (const row of rows.results) {
    if (status && row.status !== status) continue;
    if (patientId && row.patient_id !== patientId) continue;
    if (submissions.length >= 100) break;
    const payload = await decryptClinicalPayload<Record<string, unknown>>(
      {
        ciphertext: row.payload_ciphertext,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
      },
      key,
      `portal-submission:${clinician.practiceId}:${row.patient_id}`,
    );
    submissions.push({
      id: row.id,
      portalUserId: row.portal_user_id,
      patientId: row.patient_id,
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
      ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
      ...(row.encounter_id ? { encounterId: row.encounter_id } : {}),
      payload: payload ?? null,
    });
  }
  return reply(request, env, { submissions });
}

async function adminSubmissionStatus(
  request: Request,
  env: V3Env,
  clinician: V3User,
  submissionId: string,
) {
  if (clinician.role !== "physician") {
    return reply(
      request,
      env,
      { error: "physician_authority_required" },
      403,
    );
  }

  if (!clinicianCan(clinician, "handoff.write")) {
    return reply(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reply(
      request,
      env,
      { error: "invalid_json" },
      400,
    );
  }

  const targetStatus =
    String(body.status ?? "") as PortalSubmissionStatus;

  if (
    ![
      "acknowledged",
      "reviewed",
      "archived",
    ].includes(targetStatus)
  ) {
    return reply(
      request,
      env,
      { error: "invalid_submission_status" },
      422,
    );
  }

  const submission = await v3db(env)
    .prepare(
      `SELECT id,patient_id,status,reviewed_by,reviewed_at,encounter_id
       FROM portal_submissions
       WHERE id=? AND practice_id=?`,
    )
    .bind(
      submissionId,
      clinician.practiceId,
    )
    .first<{
      id: string;
      patient_id: string;
      status: PortalSubmissionStatus;
      reviewed_by: string | null;
      reviewed_at: string | null;
      encounter_id: string | null;
    }>();

  if (!submission) {
    return reply(
      request,
      env,
      { error: "submission_not_found" },
      404,
    );
  }

  const encounterIdRaw = stringOrNull(
    body.encounterId,
    64,
  );

  if (
    encounterIdRaw &&
    targetStatus !== "reviewed"
  ) {
    return reply(
      request,
      env,
      { error: "encounter_reference_requires_review" },
      422,
    );
  }

  if (targetStatus === submission.status) {
    if (
      targetStatus === "reviewed" &&
      encounterIdRaw &&
      encounterIdRaw !== submission.encounter_id
    ) {
      return reply(
        request,
        env,
        { error: "reviewed_submission_locked" },
        409,
      );
    }

    return reply(
      request,
      env,
      {
        ok: true,
        status: submission.status,
        idempotent: true,
      },
    );
  }

  if (
    !portalSubmissionTransitionAllowed(
      submission.status,
      targetStatus,
    )
  ) {
    return reply(
      request,
      env,
      {
        error: "invalid_submission_transition",
        currentStatus: submission.status,
        targetStatus,
      },
      409,
    );
  }

  let encounterId: string | null = null;

  if (encounterIdRaw) {
    const encounter = await v3db(env)
      .prepare(
        `SELECT id FROM patient_encounters
         WHERE id=? AND practice_id=? AND patient_id=?`,
      )
      .bind(
        encounterIdRaw,
        clinician.practiceId,
        submission.patient_id,
      )
      .first<{ id: string }>();

    if (!encounter) {
      return reply(
        request,
        env,
        { error: "invalid_encounter_reference" },
        422,
      );
    }

    encounterId = encounter.id;
  }

  const now = v3now();

  const updated = await v3db(env)
    .prepare(
      `UPDATE portal_submissions
       SET status=?,
           reviewed_by=CASE WHEN ?='reviewed' THEN ? ELSE reviewed_by END,
           reviewed_at=CASE WHEN ?='reviewed' THEN ? ELSE reviewed_at END,
           encounter_id=CASE
             WHEN ?='reviewed' THEN COALESCE(?,encounter_id)
             ELSE encounter_id
           END,
           updated_at=?
       WHERE id=? AND practice_id=? AND status=?`,
    )
    .bind(
      targetStatus,
      targetStatus,
      clinician.id,
      targetStatus,
      now,
      targetStatus,
      encounterId,
      now,
      submission.id,
      clinician.practiceId,
      submission.status,
    )
    .run();

  if ((updated.meta.changes ?? 0) !== 1) {
    return reply(
      request,
      env,
      { error: "submission_status_conflict" },
      409,
    );
  }

  await portalAudit(
    env,
    clinician.practiceId,
    "portal.submission_status_changed",
    "portal_submission",
    submission.id,
    {
      fromStatus: submission.status,
      status: targetStatus,
      encounterId:
        targetStatus === "reviewed"
          ? encounterId
          : null,
      physicianId: clinician.id,
    },
    clinician.id,
  );

  return reply(
    request,
    env,
    {
      ok: true,
      status: targetStatus,
    },
  );
}
async function adminThreadsList(
  request: Request,
  env: V3Env,
  clinician: V3User,
) {
  if (clinician.role !== "physician") {
    return reply(
      request,
      env,
      { error: "physician_authority_required" },
      403,
    );
  }

  if (!clinicianCan(clinician, "handoff.read")) {
    return reply(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  const rows = await v3db(env)
    .prepare(
      `SELECT id,patient_id,portal_user_id,physician_id,encounter_id,status,
              last_message_at,created_at
       FROM portal_threads
       WHERE practice_id=? AND physician_id=?
       ORDER BY last_message_at DESC LIMIT 100`,
    )
    .bind(
      clinician.practiceId,
      clinician.id,
    )
    .all<{
      id: string;
      patient_id: string;
      portal_user_id: string;
      physician_id: string;
      encounter_id: string | null;
      status: string;
      last_message_at: string;
      created_at: string;
    }>();

  return reply(request, env, {
    threads: rows.results.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      portalUserId: row.portal_user_id,
      physicianId: row.physician_id,
      status: row.status,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      ...(row.encounter_id
        ? { encounterId: row.encounter_id }
        : {}),
    })),
  });
}
async function adminThreadCreate(request: Request, env: V3Env, clinician: V3User) {
  if (clinician.role !== "physician") {
    return reply(request, env, { error: "physician_authority_required" }, 403);
  }
  if (!clinicianCan(clinician, "handoff.write")) {
    return reply(request, env, { error: "permission_denied" }, 403);
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reply(request, env, { error: "invalid_json" }, 400);
  }
  const patientId = stringOrNull(body.patientId, 64);
  if (!patientId) {
    return reply(request, env, { error: "invalid_patient_reference" }, 422);
  }
  const physicianIdRaw = stringOrNull(body.physicianId, 64);
  const physicianId = physicianIdRaw ?? clinician.id;
  const physician = await v3db(env)
    .prepare(
      `SELECT u.id FROM practice_memberships m
       JOIN runtime_users u ON u.id=m.user_id
       WHERE m.practice_id=? AND m.user_id=?
         AND m.role='physician' AND m.status='active' AND u.status='active'`,
    )
    .bind(clinician.practiceId, physicianId)
    .first<{ id: string }>();
  if (!physician) {
    return reply(request, env, { error: "invalid_physician_reference" }, 422);
  }
  const patient = await v3db(env)
    .prepare(
      `SELECT id,status FROM patient_registry WHERE id=? AND practice_id=?`,
    )
    .bind(patientId, clinician.practiceId)
    .first<{ id: string; status: string }>();
  if (!patient) {
    return reply(request, env, { error: "patient_not_found" }, 404);
  }
  if (patient.status !== "active") {
    return reply(request, env, { error: "patient_archived" }, 409);
  }
  const portalAccount = await v3db(env)
    .prepare(
      `SELECT id FROM portal_users
       WHERE practice_id=? AND patient_id=? AND status='active'`,
    )
    .bind(clinician.practiceId, patientId)
    .first<{ id: string }>();
  if (!portalAccount) {
    return reply(request, env, { error: "PORTAL_ACCOUNT_REQUIRED" }, 409);
  }
  const id = crypto.randomUUID();
  const now = v3now();
  try {
    await v3db(env)
      .prepare(
        `INSERT INTO portal_threads
         (id,practice_id,patient_id,portal_user_id,physician_id,encounter_id,
          status,last_message_at,created_at,updated_at)
         VALUES(?,?,?,?,?,NULL,'open',?,?,?)`,
      )
      .bind(
        id,
        clinician.practiceId,
        patientId,
        portalAccount.id,
        physicianId,
        now,
        now,
        now,
      )
      .run();
  } catch {
    return reply(request, env, { error: "PORTAL_THREAD_EXISTS" }, 409);
  }
  await portalAudit(
    env,
    clinician.practiceId,
    "portal.thread_created",
    "portal_thread",
    id,
    { patientId, physicianId },
    clinician.id,
  );
  return reply(request, env, {
    thread: { id, patientId, physicianId, status: "open", lastMessageAt: now, createdAt: now },
  });
}

async function adminThreadSendMessage(
  request: Request,
  env: V3Env,
  clinician: V3User,
  threadId: string,
) {
  if (clinician.role !== "physician") {
    return reply(request, env, { error: "physician_authority_required" }, 403);
  }
  if (!clinicianCan(clinician, "handoff.write")) {
    return reply(request, env, { error: "permission_denied" }, 403);
  }
  const thread = await loadThreadForClinic(env, threadId, clinician.practiceId);
  if (!thread) return reply(request, env, { error: "thread_not_found" }, 404);
  // The assigned physician owns the clinical conversation.
  if (thread.physician_id !== clinician.id) {
    return reply(
      request,
      env,
      { error: "thread_not_assigned_to_physician" },
      403,
    );
  }
  if (thread.status !== "open") {
    return reply(request, env, { error: "portal_thread_closed" }, 409);
  }
  const key = clinicalKey(env);
  if (!key) {
    return reply(
      request,
      env,
      { error: "CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED" },
      500,
    );
  }
  const content = await parseMessageContent(request);
  if (!content) return reply(request, env, { error: "invalid_message" }, 400);
  const result = await persistThreadMessage(
    env,
    thread,
    { role: "physician", runtimeUserId: clinician.id },
    content,
    key,
  );
  if (!result.ok) {
    return reply(request, env, { error: result.error }, result.status);
  }
  return reply(request, env, { message: result.message });
}

async function adminDownloadAttachment(
  request: Request,
  env: V3Env,
  clinician: V3User,
  attachmentId: string,
) {
  if (clinician.role !== "physician") {
    return reply(
      request,
      env,
      { error: "physician_authority_required" },
      403,
    );
  }

  if (!clinicianCan(clinician, "handoff.read")) {
    return reply(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  const attachmentThread = await v3db(env)
    .prepare(
      `SELECT t.physician_id
       FROM portal_message_attachments a
       JOIN portal_threads t ON t.id=a.thread_id
       WHERE a.id=? AND a.practice_id=? AND t.practice_id=?`,
    )
    .bind(
      attachmentId,
      clinician.practiceId,
      clinician.practiceId,
    )
    .first<{
      physician_id: string;
    }>();

  if (!attachmentThread) {
    return reply(
      request,
      env,
      { error: "attachment_not_found" },
      404,
    );
  }

  if (attachmentThread.physician_id !== clinician.id) {
    return reply(
      request,
      env,
      { error: "thread_not_assigned_to_physician" },
      403,
    );
  }

  return serveAttachment(
    request,
    env,
    attachmentId,
    clinician.practiceId,
    null,
  );
}
async function adminAccountCreate(request: Request, env: V3Env, clinician: V3User) {
  // Physician authority only: creating a patient's portal identity is a
  // clinical-registry action with PHI implications.
  if (clinician.role !== "physician") {
    return reply(request, env, { error: "physician_authority_required" }, 403);
  }

  if (!clinicianCan(clinician, "handoff.write")) {
    return reply(
      request,
      env,
      { error: "permission_denied" },
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return reply(request, env, { error: "invalid_json" }, 400);
  }
  const patientId = stringOrNull(body.patientId, 64);
  const login = normalizePortalLogin(String(body.login ?? ""));
  const tempPassword = String(body.tempPassword ?? "");
  if (!patientId || !login) {
    return reply(request, env, { error: "invalid_login_handle" }, 422);
  }
  if (!validCredentialValue(tempPassword)) {
    return reply(request, env, { error: "password_policy_failed" }, 422);
  }
  const key = clinicalKey(env);
  if (!key) {
    return reply(
      request,
      env,
      { error: "CLINICAL_DATA_MASTER_KEY_NOT_CONFIGURED" },
      500,
    );
  }
  const patient = await v3db(env)
    .prepare(
      `SELECT id,status FROM patient_registry WHERE id=? AND practice_id=?`,
    )
    .bind(patientId, clinician.practiceId)
    .first<{ id: string; status: string }>();
  if (!patient) {
    return reply(request, env, { error: "patient_not_found" }, 404);
  }
  if (patient.status !== "active") {
    return reply(request, env, { error: "patient_archived" }, 409);
  }
  const existingAccount = await v3db(env)
    .prepare(
      `SELECT id FROM portal_users WHERE practice_id=? AND patient_id=?`,
    )
    .bind(clinician.practiceId, patientId)
    .first<{ id: string }>();
  if (existingAccount) {
    return reply(request, env, { error: "PORTAL_ACCOUNT_EXISTS" }, 409);
  }
  const loginHash = await portalLoginHash(env, login.normalized);
  const existingHandle = await v3db(env)
    .prepare(`SELECT id FROM portal_users WHERE login_hash=?`)
    .bind(loginHash)
    .first<{ id: string }>();
  if (existingHandle) {
    return reply(request, env, { error: "PORTAL_LOGIN_HANDLE_EXISTS" }, 409);
  }
  const credential = await createCredential(tempPassword);
  const encryptedLogin = await encryptClinicalPayload(
    { value: login.normalized },
    key,
    `portal-login:${clinician.practiceId}:${patientId}`,
  );
  const id = crypto.randomUUID();
  const now = v3now();
  try {
    await v3db(env)
      .prepare(
        `INSERT INTO portal_users
         (id,practice_id,patient_id,status,login_kind,login_hash,
          login_ciphertext,login_iv,login_auth_tag,password_hash,password_salt,
          password_iterations,password_updated_at,must_change_password,
          created_by,created_at,updated_at)
         VALUES(?,?,?,'active',?,?,?,?,?,?,?,?,?,1,?,?,?)`,
      )
      .bind(
        id,
        clinician.practiceId,
        patientId,
        login.kind,
        loginHash,
        encryptedLogin.ciphertext,
        encryptedLogin.iv,
        encryptedLogin.authTag,
        credential.hash,
        credential.salt,
        credential.iterations,
        now,
        clinician.id,
        now,
        now,
      )
      .run();
  } catch {
    return reply(request, env, { error: "account_persist_failed" }, 500);
  }
  await portalAudit(
    env,
    clinician.practiceId,
    "portal.account_created",
    "portal_user",
    id,
    { patientId, loginKind: login.kind },
    clinician.id,
  );
  return reply(request, env, { portalUserId: id, mustChangePassword: true });
}

// --- Route dispatcher ---------------------------------------------------------

export async function patientPortalRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/portal/")) return null;

  // Fail closed: the entire namespace is disabled unless explicitly enabled.
  if (!portalEnabled(env)) {
    return reply(request, env, { error: "portal_disabled" }, 403);
  }

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        vary: "Origin",
      },
    });
  }

  // Patient-authenticated surface (PORTAL-ACCESS-V1 tokens).
  if (url.pathname === "/v1/portal/auth/login" && request.method === "POST") {
    return portalLogin(request, env);
  }
  if (url.pathname === "/v1/portal/auth/refresh" && request.method === "POST") {
    return portalRefresh(request, env);
  }
  if (url.pathname === "/v1/portal/auth/logout" && request.method === "POST") {
    return portalLogout(request, env);
  }
  if (url.pathname === "/v1/portal/auth/password" && request.method === "POST") {
    return portalChangePassword(request, env);
  }
  if (url.pathname === "/v1/portal/session" && request.method === "GET") {
    return portalSession(request, env);
  }
  if (portalPatientDataPath(url.pathname)) {
    const patient = await requirePortalUser(request, env);

    if (!patient) {
      return reply(
        request,
        env,
        { error: "auth_required" },
        401,
      );
    }

    const access = await portalAccessPayload(request, env);
    const authSource = access?.authSource ?? "legacy_portal";
    if (
      authSource === "legacy_portal" &&
      patient.must_change_password === 1
    ) {
      return reply(
        request,
        env,
        { error: "password_change_required" },
        403,
      );
    }
  }
  if (url.pathname === "/v1/portal/submissions" && request.method === "GET") {
    return portalListSubmissions(request, env);
  }
  if (url.pathname === "/v1/portal/submissions" && request.method === "POST") {
    return portalCreateSubmission(request, env);
  }
  if (url.pathname === "/v1/portal/threads" && request.method === "GET") {
    return portalListThreads(request, env);
  }

  const threadMessagesMatch = url.pathname.match(
    /^\/v1\/portal\/threads\/([^/]+)\/messages$/,
  );
  if (threadMessagesMatch && request.method === "GET") {
    return portalThreadMessages(
      request,
      env,
      decodeURIComponent(threadMessagesMatch[1]!),
    );
  }
  if (threadMessagesMatch && request.method === "POST") {
    return portalSendMessage(
      request,
      env,
      decodeURIComponent(threadMessagesMatch[1]!),
    );
  }

  const attachmentMatch = url.pathname.match(
    /^\/v1\/portal\/attachments\/([^/]+)$/,
  );
  if (attachmentMatch && request.method === "GET") {
    return portalDownloadAttachment(
      request,
      env,
      decodeURIComponent(attachmentMatch[1]!),
    );
  }

  // Clinician review namespace: authenticated with a RUNTIME session.
  if (url.pathname.startsWith("/v1/portal/admin/")) {
    const auth = await v3RequireRuntime(request, env);
    if (!auth) return reply(request, env, { error: "auth_required" }, 401);
    const clinician = auth.user;

    if (
      url.pathname === "/v1/portal/admin/submissions" &&
      request.method === "GET"
    ) {
      return adminSubmissionsList(request, env, clinician);
    }
    const submissionStatusMatch = url.pathname.match(
      /^\/v1\/portal\/admin\/submissions\/([^/]+)\/status$/,
    );
    if (submissionStatusMatch && request.method === "POST") {
      return adminSubmissionStatus(
        request,
        env,
        clinician,
        decodeURIComponent(submissionStatusMatch[1]!),
      );
    }
    if (url.pathname === "/v1/portal/admin/threads" && request.method === "GET") {
      return adminThreadsList(request, env, clinician);
    }
    if (url.pathname === "/v1/portal/admin/threads" && request.method === "POST") {
      return adminThreadCreate(request, env, clinician);
    }
    const adminThreadMessagesMatch = url.pathname.match(
      /^\/v1\/portal\/admin\/threads\/([^/]+)\/messages$/,
    );
    if (adminThreadMessagesMatch && request.method === "GET") {
      return adminThreadMessages(
        request,
        env,
        clinician,
        decodeURIComponent(adminThreadMessagesMatch[1]!),
      );
    }
    if (adminThreadMessagesMatch && request.method === "POST") {
      return adminThreadSendMessage(
        request,
        env,
        clinician,
        decodeURIComponent(adminThreadMessagesMatch[1]!),
      );
    }
    const adminAttachmentMatch = url.pathname.match(
      /^\/v1\/portal\/admin\/attachments\/([^/]+)$/,
    );
    if (adminAttachmentMatch && request.method === "GET") {
      return adminDownloadAttachment(
        request,
        env,
        clinician,
        decodeURIComponent(adminAttachmentMatch[1]!),
      );
    }
    if (url.pathname === "/v1/portal/admin/accounts" && request.method === "POST") {
      return adminAccountCreate(request, env, clinician);
    }
    return reply(request, env, { error: "not_found" }, 404);
  }

  return reply(request, env, { error: "not_found" }, 404);
}
