import { isRuntimeOriginAllowed } from "./platform-cors";
import { validCredentialValue } from "./platform-v3-credential";
import { verifyCurrentCredential } from "./platform-v3-current-credential";
import { saveCredential } from "./platform-v3-store-credential";
import type { V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";

function reply(request: Request, env: V3Env, body: unknown, status = 200) {
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

export async function profileCredential(request: Request, env: V3Env) {
  const auth = await v3RequireRuntime(request, env);
  if (!auth) return reply(request, env, { error: "auth_required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return reply(request, env, { error: "invalid_json" }, 400);
  }

  const next = String(body.newPassword ?? "");
  if (!validCredentialValue(next)) {
    return reply(request, env, { error: "password_policy" }, 422);
  }

  const current = await verifyCurrentCredential(
    env,
    auth.user.id,
    body.currentPassword,
  );

  // First authenticated setup is allowed when no credential exists.
  // Every later password change requires the existing credential.
  if (current.exists && !current.valid) {
    return reply(request, env, { error: "current_password_invalid" }, 401);
  }

  try {
    const saved = await saveCredential(
      env,
      auth.user.id,
      next,
      auth.access.sessionId,
    );
    return reply(request, env, {
      ready: true,
      userId: auth.user.id,
      passwordUpdatedAt: saved.updatedAt,
      otherSessionsRevoked: true,
    });
  } catch {
    return reply(request, env, { error: "credential_update_failed" }, 500);
  }
}