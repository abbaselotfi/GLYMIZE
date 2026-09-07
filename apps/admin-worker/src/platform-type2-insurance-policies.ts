import { isRuntimeOriginAllowed } from "./platform-cors";
import type { V3Env } from "./platform-v3-base";
import { v3RequireRuntime } from "./platform-v3-session";

export const TYPE2_INSURANCE_CLAIM_POLICY_AUTHORITY =
  "GLYMIZE_WORKER_REVIEWED_CLAIM_TIMING_V1";

export interface RuntimeInsuranceClaimTimingPolicy {
  id: string;
  provider: string;
  productId?: string;
  masterDrugId?: string;
  claimTiming: {
    groupKey: string;
    windowDays: number;
    maxClaimsPerWindow: number;
    minimumDaysBetweenClaims: number;
    allowDistinctProductsWithinWindow: boolean;
  };
  reviewState: "approved";
  effectiveAt?: string;
  sourceReference?: string;
}

/**
 * No insurer timing rule is guessed or inferred. This registry stays empty
 * until an authoritative source is reviewed and deliberately promoted through
 * a separate evidence/change-control task.
 */
export const REVIEWED_TYPE2_INSURANCE_CLAIM_TIMING_POLICIES:
  readonly RuntimeInsuranceClaimTimingPolicy[] = [];

function reply(request: Request, env: V3Env, body: unknown, status = 200) {
  const origin = request.headers.get("origin");
  return new Response(status === 204 ? null : JSON.stringify(body), {
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

export async function type2InsurancePolicyRoute(request: Request, env: V3Env) {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/clinical/type2/insurance-policy-snapshot") return null;

  if (request.method === "OPTIONS") {
    return isRuntimeOriginAllowed(request.headers.get("origin"), env)
      ? reply(request, env, null, 204)
      : reply(request, env, { error: "origin_not_allowed" }, 403);
  }

  if (request.method !== "GET") {
    return reply(request, env, { error: "method_not_allowed" }, 405);
  }

  const runtime = await v3RequireRuntime(request, env);
  if (!runtime) return reply(request, env, { error: "auth_required" }, 401);
  if (!runtime.user.permissions.includes("type2")) {
    return reply(request, env, { error: "type2_permission_required" }, 403);
  }

  return reply(request, env, {
    schemaVersion: 1,
    authority: TYPE2_INSURANCE_CLAIM_POLICY_AUTHORITY,
    reviewState: "approved",
    policies: REVIEWED_TYPE2_INSURANCE_CLAIM_TIMING_POLICIES,
  });
}
