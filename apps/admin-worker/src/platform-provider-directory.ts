import {
  providerVisitModes,
  type ManagedProviderProfile,
  type ProviderProfileDraftInput,
  type ProviderVisitMode,
  type PublicProviderProfile,
} from "@glymize/contracts";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { v3db, v3now, type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";

type ProviderProfileRow = {
  id: string;
  practice_id: string;
  physician_user_id: string;
  directory_status: "hidden" | "published" | "suspended";
  display_name: string;
  specialty_code: string | null;
  specialty_name: string;
  subspecialty_name: string | null;
  practice_display_name: string;
  public_location: string | null;
  visit_modes_json: string;
  languages_json: string;
  show_medical_council_code: number;
  medical_council_code?: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const visitModeSet = new Set<string>(providerVisitModes);

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

function safeText(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function optionalText(value: unknown, maximum: number) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return undefined;
  }
  return safeText(value, 1, maximum) ?? null;
}

function parseStringArray(value: unknown, maximumItems: number, maximumLength: number) {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const normalized: string[] = [];
  for (const item of value) {
    const text = safeText(item, 1, maximumLength);
    if (!text) return null;
    if (!normalized.includes(text)) normalized.push(text);
  }
  return normalized;
}

function parseDraft(value: unknown): ProviderProfileDraftInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const displayName = safeText(input.displayName, 2, 120);
  const specialtyName = safeText(input.specialtyName, 2, 120);
  const practiceDisplayName = safeText(input.practiceDisplayName, 2, 160);
  const specialtyCodeRaw = optionalText(input.specialtyCode, 40);
  const specialtyCode =
    typeof specialtyCodeRaw === "string" ? specialtyCodeRaw.toUpperCase() : specialtyCodeRaw;
  const subspecialtyName = optionalText(input.subspecialtyName, 120);
  const publicLocation = optionalText(input.publicLocation, 240);
  const visitModes = parseStringArray(input.visitModes, providerVisitModes.length, 32);
  const languages = parseStringArray(input.languages, 8, 32);
  if (
    !displayName ||
    !specialtyName ||
    !practiceDisplayName ||
    specialtyCode === null ||
    (specialtyCode !== undefined && !/^[A-Z0-9._-]{1,40}$/.test(specialtyCode)) ||
    subspecialtyName === null ||
    publicLocation === null ||
    !visitModes ||
    !visitModes.every((mode) => visitModeSet.has(mode)) ||
    !languages ||
    typeof input.showMedicalCouncilCode !== "boolean"
  ) {
    return null;
  }
  return {
    displayName,
    specialtyCode,
    specialtyName,
    subspecialtyName,
    practiceDisplayName,
    publicLocation,
    visitModes: visitModes as ProviderVisitMode[],
    languages,
    showMedicalCouncilCode: input.showMedicalCouncilCode,
  };
}

function storedArray(value: string, maximumItems: number, maximumLength: number) {
  try {
    return parseStringArray(JSON.parse(value), maximumItems, maximumLength) ?? [];
  } catch {
    return [];
  }
}

function managedProfile(row: ProviderProfileRow): ManagedProviderProfile {
  return {
    id: row.id,
    practiceId: row.practice_id,
    physicianUserId: row.physician_user_id,
    directoryStatus: row.directory_status,
    displayName: row.display_name,
    specialtyCode: row.specialty_code ?? undefined,
    specialtyName: row.specialty_name,
    subspecialtyName: row.subspecialty_name ?? undefined,
    practiceDisplayName: row.practice_display_name,
    publicLocation: row.public_location ?? undefined,
    visitModes: storedArray(
      row.visit_modes_json,
      providerVisitModes.length,
      32,
    ).filter((mode): mode is ProviderVisitMode => visitModeSet.has(mode)),
    languages: storedArray(row.languages_json, 8, 32),
    showMedicalCouncilCode: row.show_medical_council_code === 1,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicProfile(row: ProviderProfileRow): PublicProviderProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    specialtyCode: row.specialty_code ?? undefined,
    specialtyName: row.specialty_name,
    subspecialtyName: row.subspecialty_name ?? undefined,
    practiceDisplayName: row.practice_display_name,
    publicLocation: row.public_location ?? undefined,
    visitModes: storedArray(
      row.visit_modes_json,
      providerVisitModes.length,
      32,
    ).filter((mode): mode is ProviderVisitMode => visitModeSet.has(mode)),
    languages: storedArray(row.languages_json, 8, 32),
    medicalCouncilCode: row.medical_council_code ?? undefined,
    publishedAt: row.published_at!,
  };
}

function safeProviderId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ? value : null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function publicProjection() {
  return `p.id,p.practice_id,p.physician_user_id,p.directory_status,p.display_name,
          p.specialty_code,p.specialty_name,p.subspecialty_name,p.practice_display_name,
          p.public_location,p.visit_modes_json,p.languages_json,p.show_medical_council_code,
          CASE WHEN p.show_medical_council_code=1 THEN u.medical_council_code ELSE NULL END AS medical_council_code,
          p.published_at,p.created_at,p.updated_at`;
}

async function searchProviders(request: Request, env: V3Env) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (query.length === 1 || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) {
    return reply(request, env, { error: "invalid_search_query" }, 400);
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
    return reply(request, env, { error: "invalid_limit" }, 400);
  }
  const database = v3db(env);
  const joins = `FROM provider_profiles p
    JOIN practice_memberships m
      ON m.practice_id=p.practice_id AND m.user_id=p.physician_user_id
    JOIN runtime_users u ON u.id=p.physician_user_id
    WHERE p.directory_status='published'
      AND m.role='physician' AND m.status='active'
      AND u.role='physician' AND u.status='active' AND u.irimc_status='verified'`;
  const statement = query
    ? database.prepare(
        `SELECT ${publicProjection()}
         ${joins}
           AND (
             p.display_name LIKE ? ESCAPE '\\'
             OR p.specialty_name LIKE ? ESCAPE '\\'
             OR COALESCE(p.subspecialty_name,'') LIKE ? ESCAPE '\\'
             OR p.practice_display_name LIKE ? ESCAPE '\\'
             OR (p.show_medical_council_code=1 AND u.medical_council_code LIKE ? ESCAPE '\\')
           )
         ORDER BY p.display_name,p.id
         LIMIT ?`,
      ).bind(...Array(5).fill(`%${escapeLike(query)}%`), requestedLimit)
    : database.prepare(
        `SELECT ${publicProjection()}
         ${joins}
         ORDER BY p.display_name,p.id
         LIMIT ?`,
      ).bind(requestedLimit);
  const rows = await statement.all<ProviderProfileRow>();
  return reply(request, env, { providers: rows.results.map(publicProfile) });
}

async function getPublicProvider(request: Request, env: V3Env, profileId: string) {
  const row = await v3db(env).prepare(
    `SELECT ${publicProjection()}
     FROM provider_profiles p
     JOIN practice_memberships m
       ON m.practice_id=p.practice_id AND m.user_id=p.physician_user_id
     JOIN runtime_users u ON u.id=p.physician_user_id
     WHERE p.id=? AND p.directory_status='published'
       AND m.role='physician' AND m.status='active'
       AND u.role='physician' AND u.status='active' AND u.irimc_status='verified'`,
  ).bind(profileId).first<ProviderProfileRow>();
  return row
    ? reply(request, env, { provider: publicProfile(row) })
    : reply(request, env, { error: "provider_not_found" }, 404);
}

async function requirePhysician(request: Request, env: V3Env) {
  const auth = await v3RequireRuntime(request, env);
  return auth?.user.role === "physician" ? auth : null;
}

async function getManagedProfile(request: Request, env: V3Env) {
  const auth = await requirePhysician(request, env);
  if (!auth) return reply(request, env, { error: "physician_auth_required" }, 401);
  const row = await v3db(env).prepare(
    `SELECT id,practice_id,physician_user_id,directory_status,display_name,specialty_code,
            specialty_name,subspecialty_name,practice_display_name,public_location,
            visit_modes_json,languages_json,show_medical_council_code,published_at,
            created_at,updated_at
     FROM provider_profiles WHERE practice_id=? AND physician_user_id=?`,
  ).bind(auth.user.practiceId, auth.user.id).first<ProviderProfileRow>();
  return reply(request, env, { profile: row ? managedProfile(row) : null });
}

async function saveManagedProfile(request: Request, env: V3Env) {
  const auth = await requirePhysician(request, env);
  if (!auth) return reply(request, env, { error: "physician_auth_required" }, 401);
  const draft = parseDraft(await request.json().catch(() => null));
  if (!draft) return reply(request, env, { error: "invalid_provider_profile" }, 400);
  const now = v3now();
  const database = v3db(env);
  const profileId = crypto.randomUUID();
  const results = await database.batch<ProviderProfileRow>([
    database.prepare(
      `INSERT INTO provider_profiles
       (id,practice_id,physician_user_id,directory_status,display_name,specialty_code,
        specialty_name,subspecialty_name,practice_display_name,public_location,
        visit_modes_json,languages_json,show_medical_council_code,published_at,created_at,updated_at)
       VALUES(?,?,?,'hidden',?,?,?,?,?,?,?,?,?,NULL,?,?)
       ON CONFLICT(practice_id,physician_user_id) DO UPDATE SET
         display_name=excluded.display_name,
         specialty_code=excluded.specialty_code,
         specialty_name=excluded.specialty_name,
         subspecialty_name=excluded.subspecialty_name,
         practice_display_name=excluded.practice_display_name,
         public_location=excluded.public_location,
         visit_modes_json=excluded.visit_modes_json,
         languages_json=excluded.languages_json,
         show_medical_council_code=excluded.show_medical_council_code,
         updated_at=excluded.updated_at
       RETURNING *`,
    ).bind(
      profileId,
      auth.user.practiceId,
      auth.user.id,
      draft.displayName,
      draft.specialtyCode ?? null,
      draft.specialtyName,
      draft.subspecialtyName ?? null,
      draft.practiceDisplayName,
      draft.publicLocation ?? null,
      JSON.stringify(draft.visitModes),
      JSON.stringify(draft.languages),
      draft.showMedicalCouncilCode ? 1 : 0,
      now,
      now,
    ),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,?,?,'provider_profile.saved','provider_profile',p.id,NULL,?
       FROM provider_profiles p
       WHERE p.practice_id=? AND p.physician_user_id=?`,
    ).bind(
      crypto.randomUUID(),
      auth.user.id,
      auth.user.practiceId,
      now,
      auth.user.practiceId,
      auth.user.id,
    ),
  ]);
  const row = results[0]?.results[0];
  if (!row) return reply(request, env, { error: "provider_profile_save_failed" }, 500);
  return reply(request, env, { profile: managedProfile(row) });
}

async function setManagedVisibility(
  request: Request,
  env: V3Env,
  action: "publish" | "hide",
) {
  const auth = await requirePhysician(request, env);
  if (!auth) return reply(request, env, { error: "physician_auth_required" }, 401);
  const body = await request.json().catch(() => null) as { confirmed?: unknown } | null;
  if (body?.confirmed !== true) {
    return reply(request, env, { error: "explicit_confirmation_required" }, 400);
  }
  const now = v3now();
  const database = v3db(env);
  const current = await database.prepare(
    `SELECT p.id,p.directory_status,u.irimc_status
     FROM provider_profiles p
     JOIN runtime_users u ON u.id=p.physician_user_id
     WHERE p.practice_id=? AND p.physician_user_id=?`,
  ).bind(auth.user.practiceId, auth.user.id).first<{
    id: string;
    directory_status: ProviderProfileRow["directory_status"];
    irimc_status: string | null;
  }>();
  if (!current) return reply(request, env, { error: "provider_profile_not_found" }, 404);
  if (current.directory_status === "suspended") {
    return reply(request, env, { error: "provider_profile_suspended" }, 409);
  }
  if (action === "publish" && current.irimc_status !== "verified") {
    return reply(request, env, { error: "provider_identity_verification_required" }, 409);
  }
  const status = action === "publish" ? "published" : "hidden";
  const results = await database.batch<ProviderProfileRow>([
    database.prepare(
      `UPDATE provider_profiles
       SET directory_status=?,published_at=?,updated_at=?
       WHERE id=? AND practice_id=? AND physician_user_id=? AND directory_status<>'suspended'
       RETURNING *`,
    ).bind(
      status,
      action === "publish" ? now : null,
      now,
      current.id,
      auth.user.practiceId,
      auth.user.id,
    ),
    database.prepare(
      `INSERT INTO audit_log
       (id,actor_user_id,practice_id,action,target_type,target_id,meta_json,created_at)
       SELECT ?,?,?,?,'provider_profile',p.id,NULL,?
       FROM provider_profiles p
       WHERE p.id=? AND p.practice_id=? AND p.physician_user_id=?
         AND p.directory_status=? AND p.updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      auth.user.id,
      auth.user.practiceId,
      `provider_profile.${status}`,
      now,
      current.id,
      auth.user.practiceId,
      auth.user.id,
      status,
      now,
    ),
  ]);
  const row = results[0]?.results[0];
  if (!row) return reply(request, env, { error: "provider_profile_update_conflict" }, 409);
  return reply(request, env, { profile: managedProfile(row) });
}

export async function providerDirectoryRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/provider-directory/")) return null;
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!isRuntimeOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    return reply(request, env, null, 204);
  }
  if (url.pathname === "/v1/provider-directory/capabilities" && request.method === "GET") {
    return reply(request, env, {
      providerDirectory: enabled(env.PROVIDER_DIRECTORY_ENABLED),
    });
  }
  if (!enabled(env.PROVIDER_DIRECTORY_ENABLED)) {
    return reply(request, env, { error: "provider_directory_disabled" }, 403);
  }
  if (url.pathname === "/v1/provider-directory/providers" && request.method === "GET") {
    return searchProviders(request, env);
  }
  const publicProvider = url.pathname.match(/^\/v1\/provider-directory\/providers\/([^/]+)$/);
  if (publicProvider && request.method === "GET") {
    const profileId = safeProviderId(publicProvider[1]!);
    if (!profileId) return reply(request, env, { error: "invalid_provider_id" }, 400);
    return getPublicProvider(request, env, profileId);
  }
  if (url.pathname === "/v1/provider-directory/manage/profile") {
    if (request.method === "GET") return getManagedProfile(request, env);
    if (request.method === "PUT") return saveManagedProfile(request, env);
  }
  if (url.pathname === "/v1/provider-directory/manage/profile/publish" && request.method === "POST") {
    return setManagedVisibility(request, env, "publish");
  }
  if (url.pathname === "/v1/provider-directory/manage/profile/hide" && request.method === "POST") {
    return setManagedVisibility(request, env, "hide");
  }
  return reply(request, env, { error: "not_found" }, 404);
}
