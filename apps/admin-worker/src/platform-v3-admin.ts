import adminHandler from "./index";
import { createCredential, validCredentialValue } from "./platform-v3-credential";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";
import {
  defaultPhysicianPermissions,
  normalizeEmail,
  normalizeIranMobile,
  normalizeMedicalCouncilCode,
  sanitizeRuntimePermissions,
  type RuntimePermission,
} from "./runtime-security";

type AdminIdentity = {
  login: string;
  source: "github" | "runtime";
  userId?: string;
  permissions: RuntimePermission[];
};

function json(request: Request, env: V3Env, body: unknown, status = 200) {
  const origin = request.headers.get("origin");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(origin === env.ADMIN_ORIGIN
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "authorization, content-type",
            "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
            vary: "Origin",
          }
        : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function adminIdentity(request: Request, env: V3Env): Promise<AdminIdentity | null> {
  const runtime = await v3RequireRuntime(request, env);
  if (runtime && runtime.user.permissions.includes("admin.users")) {
    return {
      login: `${runtime.user.firstName} ${runtime.user.lastName}`.trim() || runtime.user.id,
      source: "runtime",
      userId: runtime.user.id,
      permissions: runtime.user.permissions,
    };
  }

  const token = bearer(request);
  if (!token) return null;
  const delegated = new Request(`${new URL(request.url).origin}/session`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, origin: env.ADMIN_ORIGIN },
  });
  const response = await adminHandler.fetch(delegated, env as never);
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    login?: unknown;
    source?: unknown;
    userId?: unknown;
    permissions?: unknown;
  } | null;
  const login = typeof payload?.login === "string" ? payload.login.trim() : "";
  if (!login) return null;
  const source = payload?.source === "runtime" ? "runtime" : "github";
  const permissions = sanitizeRuntimePermissions(payload?.permissions);
  if (source === "runtime" && !permissions.includes("admin.users")) return null;
  return {
    login,
    source,
    userId: typeof payload?.userId === "string" ? payload.userId : undefined,
    permissions,
  };
}

function safeName(value: unknown) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 120 && !/[\u0000-\u001f]/.test(name) ? name : null;
}

function safePracticeName(value: unknown, lastName: string) {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return `Dr. ${lastName}`.slice(0, 160);
  return raw.length <= 160 && !/[\u0000-\u001f]/.test(raw) ? raw : null;
}

function normalizeOptionalEmail(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return normalizeEmail(String(value));
}

function normalizeOptionalMobile(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return normalizeIranMobile(String(value));
}

async function auditAdmin(
  env: V3Env,
  admin: AdminIdentity,
  action: string,
  targetId: string,
  practiceId?: string | null,
  meta?: Record<string, unknown>,
) {
  await v3db(env)
    .prepare(
      `INSERT INTO audit_log
       (id, actor_user_id, practice_id, action, target_type, target_id, meta_json, created_at)
       VALUES (?, ?, ?, ?, 'user', ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      admin.source === "runtime" ? admin.userId ?? null : null,
      practiceId ?? null,
      action,
      targetId,
      JSON.stringify({ adminLogin: admin.login, adminSource: admin.source, ...(meta ?? {}) }),
      v3now(),
    )
    .run();
}

async function identifierConflict(
  env: V3Env,
  input: { medicalCouncilCode?: string | null; email?: string | null; mobile?: string | null },
  excludeUserId = "",
) {
  const row = await v3db(env)
    .prepare(
      `SELECT id, first_name, last_name, medical_council_code, email_norm, mobile_norm
       FROM runtime_users
       WHERE id<>?
         AND (
           (? IS NOT NULL AND medical_council_code=?)
           OR (? IS NOT NULL AND email_norm=?)
           OR (? IS NOT NULL AND mobile_norm=?)
         )
       LIMIT 1`,
    )
    .bind(
      excludeUserId,
      input.medicalCouncilCode ?? null,
      input.medicalCouncilCode ?? null,
      input.email ?? null,
      input.email ?? null,
      input.mobile ?? null,
      input.mobile ?? null,
    )
    .first<any>();
  if (!row) return null;
  const conflicts: string[] = [];
  if (input.medicalCouncilCode && row.medical_council_code === input.medicalCouncilCode) conflicts.push("medicalCouncilCode");
  if (input.email && row.email_norm === input.email) conflicts.push("email");
  if (input.mobile && row.mobile_norm === input.mobile) conflicts.push("mobile");
  return {
    existingUserId: row.id as string,
    existingDisplayName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
    conflicts,
  };
}

async function listUsers(request: Request, env: V3Env) {
  const rows = await v3db(env)
    .prepare(
      `SELECT
         u.id, u.role, u.status, u.first_name, u.last_name, u.email_norm, u.mobile_norm,
         u.medical_council_code, u.irimc_status, u.irimc_verification_source, u.layout_preset,
         u.created_at,
         CASE WHEN u.password_hash IS NOT NULL THEN 1 ELSE 0 END AS password_set,
         (
           SELECT p.id
           FROM practice_memberships m
           JOIN practices p ON p.id=m.practice_id
           WHERE m.user_id=u.id
           ORDER BY m.created_at
           LIMIT 1
         ) AS practice_id,
         (
           SELECT p.name
           FROM practice_memberships m
           JOIN practices p ON p.id=m.practice_id
           WHERE m.user_id=u.id
           ORDER BY m.created_at
           LIMIT 1
         ) AS practice_name,
         (
           SELECT m.permissions_json
           FROM practice_memberships m
           WHERE m.user_id=u.id
           ORDER BY m.created_at
           LIMIT 1
         ) AS permissions_json
       FROM runtime_users u
       ORDER BY u.created_at DESC`,
    )
    .all<any>();

  return json(
    request,
    env,
    rows.results.map((row: any) => ({
      id: row.id,
      role: row.role,
      status: row.status,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email_norm ?? undefined,
      mobile: row.mobile_norm ?? undefined,
      medicalCouncilCode: row.medical_council_code ?? undefined,
      irimcStatus: row.irimc_status ?? undefined,
      verificationSource: row.irimc_verification_source ?? undefined,
      practiceId: row.practice_id ?? undefined,
      practiceName: row.practice_name ?? undefined,
      layoutPreset: row.layout_preset ?? "auto",
      passwordSet: row.password_set === 1,
      createdAt: row.created_at,
      permissions: sanitizeRuntimePermissions(
        (() => {
          try {
            return row.permissions_json ? JSON.parse(row.permissions_json) : [];
          } catch {
            return [];
          }
        })(),
      ),
    })),
  );
}

async function createPhysician(request: Request, env: V3Env, admin: AdminIdentity) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }

  const medicalCouncilCode = normalizeMedicalCouncilCode(String(body.medicalCouncilCode ?? ""));
  const firstName = safeName(body.firstName);
  const lastName = safeName(body.lastName);
  const email = normalizeOptionalEmail(body.email);
  const mobile = normalizeOptionalMobile(body.mobile);
  const practiceName = lastName ? safePracticeName(body.practiceName, lastName) : null;
  const password = String(body.password ?? "");
  const permissions =
    body.permissions === undefined
      ? defaultPhysicianPermissions()
      : sanitizeRuntimePermissions(body.permissions);

  if (
    !/^\d{3,12}$/.test(medicalCouncilCode) ||
    !firstName ||
    !lastName ||
    !practiceName ||
    (!email && !mobile) ||
    !validCredentialValue(password)
  ) {
    return json(request, env, { error: "invalid_admin_physician_account" }, 422);
  }

  const conflict = await identifierConflict(env, { medicalCouncilCode, email, mobile });
  if (conflict) {
    return json(
      request,
      env,
      { error: "account_identifier_already_registered", ...conflict },
      409,
    );
  }

  const credential = await createCredential(password);
  const db = v3db(env);
  const userId = crypto.randomUUID();
  const practiceId = crypto.randomUUID();
  const now = v3now();

  await db.batch([
    db
      .prepare(
        `INSERT INTO runtime_users
         (id, role, status, first_name, last_name, email_norm, mobile_norm, medical_council_code,
          irimc_status, irimc_verified_at, irimc_verification_source,
          profile_photo, profile_photo_source, layout_preset,
          password_hash, password_salt, password_iterations, password_updated_at,
          created_at, updated_at)
         VALUES (?, 'physician', 'active', ?, ?, ?, ?, ?,
                 'unavailable', NULL, 'admin_manual',
                 NULL, 'none', 'auto',
                 ?, ?, ?, ?,
                 ?, ?)`,
      )
      .bind(
        userId,
        firstName,
        lastName,
        email,
        mobile,
        medicalCouncilCode,
        credential.hash,
        credential.salt,
        credential.iterations,
        now,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO practices
         (id, owner_physician_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(practiceId, userId, practiceName, now, now),
    db
      .prepare(
        `INSERT INTO practice_memberships
         (practice_id, user_id, role, status, permissions_json, invited_by, created_at, updated_at)
         VALUES (?, ?, 'physician', 'active', ?, ?, ?, ?)`,
      )
      .bind(practiceId, userId, JSON.stringify(permissions), userId, now, now),
  ]);

  await auditAdmin(env, admin, "admin.user_created", userId, practiceId, {
    role: "physician",
    verificationSource: "admin_manual",
    irimcVerified: false,
    permissions,
  });

  return json(
    request,
    env,
    {
      created: true,
      userId,
      practiceId,
      verificationSource: "admin_manual",
      irimcStatus: "unavailable",
    },
    201,
  );
}

async function updateUser(
  request: Request,
  env: V3Env,
  admin: AdminIdentity,
  userId: string,
) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }

  const db = v3db(env);
  const current = await db
    .prepare(
      `SELECT id, role, status, first_name, last_name, email_norm, mobile_norm, medical_council_code
       FROM runtime_users WHERE id=?`,
    )
    .bind(userId)
    .first<any>();
  if (!current) return json(request, env, { error: "user_not_found" }, 404);

  const status =
    body.status === undefined ? current.status : String(body.status);
  if (!["active", "disabled"].includes(status)) {
    return json(request, env, { error: "invalid_user_status" }, 422);
  }

  const firstName =
    body.firstName === undefined ? current.first_name : safeName(body.firstName);
  const lastName =
    body.lastName === undefined ? current.last_name : safeName(body.lastName);
  const email =
    body.email === undefined ? current.email_norm : normalizeOptionalEmail(body.email);
  const mobile =
    body.mobile === undefined ? current.mobile_norm : normalizeOptionalMobile(body.mobile);
  const medicalCouncilCode =
    body.medicalCouncilCode === undefined
      ? current.medical_council_code
      : normalizeMedicalCouncilCode(String(body.medicalCouncilCode ?? ""));

  if (!firstName || !lastName || (!email && !mobile)) {
    return json(request, env, { error: "invalid_user_update" }, 422);
  }
  if (
    current.role === "physician" &&
    (!medicalCouncilCode || !/^\d{3,12}$/.test(medicalCouncilCode))
  ) {
    return json(request, env, { error: "invalid_medical_council_code" }, 422);
  }

  const conflict = await identifierConflict(
    env,
    {
      medicalCouncilCode:
        current.role === "physician" ? medicalCouncilCode : null,
      email,
      mobile,
    },
    userId,
  );
  if (conflict) {
    return json(
      request,
      env,
      { error: "account_identifier_already_registered", ...conflict },
      409,
    );
  }

  const now = v3now();
  await db
    .prepare(
      `UPDATE runtime_users
       SET status=?, first_name=?, last_name=?, email_norm=?, mobile_norm=?,
           medical_council_code=?, updated_at=?
       WHERE id=?`,
    )
    .bind(
      status,
      firstName,
      lastName,
      email,
      mobile,
      current.role === "physician" ? medicalCouncilCode : null,
      now,
      userId,
    )
    .run();

  if (body.permissions !== undefined) {
    const permissions = sanitizeRuntimePermissions(body.permissions);
    await db
      .prepare(
        `UPDATE practice_memberships
         SET permissions_json=?, updated_at=?
         WHERE user_id=?`,
      )
      .bind(JSON.stringify(permissions), now, userId)
      .run();
  }

  if (status === "disabled") {
    await db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at=COALESCE(revoked_at, ?)
         WHERE user_id=?`,
      )
      .bind(now, userId)
      .run();
  }

  const practice = await db
    .prepare(
      `SELECT practice_id FROM practice_memberships
       WHERE user_id=? ORDER BY created_at LIMIT 1`,
    )
    .bind(userId)
    .first<{ practice_id?: string }>();

  await auditAdmin(env, admin, "admin.user_updated", userId, practice?.practice_id ?? null, {
    status,
    permissions:
      body.permissions === undefined
        ? undefined
        : sanitizeRuntimePermissions(body.permissions),
  });

  return json(request, env, { updated: true });
}

async function resetPassword(
  request: Request,
  env: V3Env,
  admin: AdminIdentity,
  userId: string,
) {
  let body: { newPassword?: unknown };
  try {
    body = (await request.json()) as { newPassword?: unknown };
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }
  if (!validCredentialValue(body.newPassword)) {
    return json(request, env, { error: "password_policy_failed" }, 422);
  }

  const db = v3db(env);
  const exists = await db
    .prepare(`SELECT id FROM runtime_users WHERE id=?`)
    .bind(userId)
    .first<{ id: string }>();
  if (!exists) return json(request, env, { error: "user_not_found" }, 404);

  const credential = await createCredential(body.newPassword as string);
  const now = v3now();

  await db.batch([
    db
      .prepare(
        `UPDATE runtime_users
         SET password_hash=?, password_salt=?, password_iterations=?,
             password_updated_at=?, updated_at=?
         WHERE id=?`,
      )
      .bind(
        credential.hash,
        credential.salt,
        credential.iterations,
        now,
        now,
        userId,
      ),
    db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at=COALESCE(revoked_at, ?)
         WHERE user_id=?`,
      )
      .bind(now, userId),
  ]);

  const practice = await db
    .prepare(
      `SELECT practice_id FROM practice_memberships
       WHERE user_id=? ORDER BY created_at LIMIT 1`,
    )
    .bind(userId)
    .first<{ practice_id?: string }>();

  await auditAdmin(
    env,
    admin,
    "admin.user_password_reset",
    userId,
    practice?.practice_id ?? null,
  );

  return json(request, env, { updated: true, sessionsRevoked: true });
}

async function purgeOrDeleteUser(
  request: Request,
  env: V3Env,
  admin: AdminIdentity,
  userId: string,
) {
  let body: { confirmUserId?: unknown } = {};
  try {
    const raw = await request.text();
    body = raw ? (JSON.parse(raw) as { confirmUserId?: unknown }) : {};
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }

  if (String(body.confirmUserId ?? "") !== userId) {
    return json(request, env, { error: "delete_confirmation_required" }, 422);
  }
  if (admin.source === "runtime" && admin.userId === userId) {
    return json(
      request,
      env,
      { error: "self_delete_requires_github_superadmin" },
      403,
    );
  }

  const db = v3db(env);
  const user = await db
    .prepare(
      `SELECT id, role FROM runtime_users WHERE id=?`,
    )
    .bind(userId)
    .first<{ id: string; role: string }>();
  if (!user) return json(request, env, { error: "user_not_found" }, 404);

  const ownerPractice = await db
    .prepare(`SELECT id FROM practices WHERE owner_physician_id=? LIMIT 1`)
    .bind(userId)
    .first<{ id: string }>();

  const directClinicalRefs = await db
    .prepare(
      `SELECT (
         (SELECT count(*) FROM patient_handoffs WHERE created_by=? OR updated_by=?) +
         (SELECT count(*) FROM patient_encounters WHERE created_by=? OR updated_by=?) +
         (SELECT count(*) FROM patient_note_threads WHERE created_by=?) +
         (SELECT count(*) FROM patient_note_revisions WHERE authored_by=?) +
         (SELECT count(*) FROM patient_encounter_snapshots WHERE created_by=?) +
         (SELECT count(*) FROM patient_observations WHERE created_by=?) +
         (SELECT count(*) FROM patient_final_plans WHERE authored_by=? OR signed_by=?) +
         (SELECT count(*) FROM patient_order_fulfillment_events WHERE updated_by=?) +
         (SELECT count(*) FROM patient_investigation_result_links WHERE linked_by=?) +
         (SELECT count(*) FROM portal_users WHERE created_by=?) +
         (SELECT count(*) FROM portal_threads WHERE physician_id=?)
       ) AS count`,
    )
    .bind(
      userId, userId,
      userId, userId,
      userId,
      userId,
      userId,
      userId,
      userId, userId,
      userId,
      userId,
      userId,
      userId,
    )
    .first<{ count: number }>();

  let canHardDelete = (directClinicalRefs?.count ?? 0) === 0;
  let practiceId: string | null = null;

  if (ownerPractice?.id) {
    practiceId = ownerPractice.id;
    const practiceStats = await db
      .prepare(
        `SELECT
           (SELECT count(*) FROM patient_handoffs WHERE practice_id=?) AS handoffs,
           (SELECT count(*) FROM patient_registry WHERE practice_id=?) AS patients_v2,
           (SELECT count(*) FROM practice_memberships WHERE practice_id=? AND user_id<>?) AS other_members`,
      )
      .bind(
        ownerPractice.id,
        ownerPractice.id,
        ownerPractice.id,
        userId,
      )
      .first<{
        handoffs: number;
        patients_v2: number;
        other_members: number;
      }>();
    canHardDelete =
      canHardDelete &&
      (practiceStats?.handoffs ?? 0) === 0 &&
      (practiceStats?.patients_v2 ?? 0) === 0 &&
      (practiceStats?.other_members ?? 0) === 0;
  } else {
    const membership = await db
      .prepare(
        `SELECT practice_id FROM practice_memberships
         WHERE user_id=? ORDER BY created_at LIMIT 1`,
      )
      .bind(userId)
      .first<{ practice_id: string }>();
    practiceId = membership?.practice_id ?? null;
  }

  const now = v3now();

  if (canHardDelete) {
    if (ownerPractice?.id) {
      await db
        .prepare(`DELETE FROM practices WHERE id=?`)
        .bind(ownerPractice.id)
        .run();
    }
    await db.prepare(`DELETE FROM runtime_users WHERE id=?`).bind(userId).run();
    await auditAdmin(env, admin, "admin.user_hard_deleted", userId, null, {
      preservedClinicalHistory: false,
    });
    return json(request, env, {
      deleted: true,
      mode: "hard_deleted",
      identifiersReleased: true,
      clinicalHistoryPreserved: true,
    });
  }

  const tombstone = `deleted-${userId.slice(0, 8)}`;
  await db.batch([
    db
      .prepare(
        `UPDATE runtime_users
         SET status='disabled',
             first_name='Deleted',
             last_name=?,
             email_norm=NULL,
             mobile_norm=NULL,
             medical_council_code=NULL,
             irimc_status=NULL,
             irimc_verified_at=NULL,
             irimc_verification_source='admin_deleted',
             profile_photo=NULL,
             profile_photo_source='none',
             password_hash=NULL,
             password_salt=NULL,
             password_iterations=NULL,
             password_updated_at=NULL,
             updated_at=?
         WHERE id=?`,
      )
      .bind(tombstone, now, userId),
    db
      .prepare(
        `UPDATE practice_memberships
         SET status='disabled', updated_at=?
         WHERE user_id=?`,
      )
      .bind(now, userId),
    db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at=COALESCE(revoked_at, ?)
         WHERE user_id=?`,
      )
      .bind(now, userId),
    db.prepare(`DELETE FROM otp_challenges WHERE user_id=?`).bind(userId),
  ]);

  await auditAdmin(env, admin, "admin.user_identity_purged", userId, practiceId, {
    preservedClinicalHistory: true,
    identifiersReleased: true,
  });

  return json(request, env, {
    deleted: true,
    mode: "identity_purged",
    identifiersReleased: true,
    clinicalHistoryPreserved: true,
  });
}

export async function adminRuntimeRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/admin/runtime/users")) return null;

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (origin !== env.ADMIN_ORIGIN) {
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

  const admin = await adminIdentity(request, env);
  if (!admin) return json(request, env, { error: "admin_auth_required" }, 401);

  if (url.pathname === "/v1/admin/runtime/users") {
    if (request.method === "GET") return listUsers(request, env);
    if (request.method === "POST") return createPhysician(request, env, admin);
    return json(request, env, { error: "method_not_allowed" }, 405);
  }

  const passwordMatch = url.pathname.match(
    /^\/v1\/admin\/runtime\/users\/([^/]+)\/password$/,
  );
  if (passwordMatch && request.method === "POST") {
    return resetPassword(
      request,
      env,
      admin,
      decodeURIComponent(passwordMatch[1]!),
    );
  }

  const userMatch = url.pathname.match(/^\/v1\/admin\/runtime\/users\/([^/]+)$/);
  if (userMatch) {
    const userId = decodeURIComponent(userMatch[1]!);
    if (request.method === "PATCH") return updateUser(request, env, admin, userId);
    if (request.method === "DELETE") {
      return purgeOrDeleteUser(request, env, admin, userId);
    }
    return json(request, env, { error: "method_not_allowed" }, 405);
  }

  return json(request, env, { error: "not_found" }, 404);
}
