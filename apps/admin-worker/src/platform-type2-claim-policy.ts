import { isRuntimeOriginAllowed } from "./platform-cors";
import { type V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";
import {
  reviewedType2ClaimPolicies,
  TYPE2_CLAIM_POLICY_REGISTRY_REVISION,
} from "./type2-claim-policy-registry";

const routePath = "/v1/clinical/type2/insurance-claim-policies";

function json(request: Request, env: V3Env, body: unknown, status = 200) {
  const origin = request.headers.get("origin");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(isRuntimeOriginAllowed(origin, env)
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "authorization, content-type",
            "access-control-allow-methods": "GET, OPTIONS",
            vary: "Origin",
          }
        : {}),
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function type2ClaimPolicyRoute(
  request: Request,
  env: V3Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== routePath) return null;

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
        "access-control-allow-methods": "GET, OPTIONS",
        vary: "Origin",
      },
    });
  }

  if (request.method !== "GET") {
    return json(request, env, { error: "method_not_allowed" }, 405);
  }

  const runtime = await v3RequireRuntime(request, env);
  if (!runtime) return json(request, env, { error: "auth_required" }, 401);
  if (!runtime.user.permissions.includes("type2")) {
    return json(request, env, { error: "type2_permission_required" }, 403);
  }

  try {
    const now = Date.now();
    return json(request, env, {
      schemaVersion: 1,
      authority: "trusted_runtime",
      registryRevision: TYPE2_CLAIM_POLICY_REGISTRY_REVISION,
      generatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
      policies: reviewedType2ClaimPolicies(),
    });
  } catch {
    return json(request, env, { error: "claim_policy_registry_invalid" }, 503);
  }
}
