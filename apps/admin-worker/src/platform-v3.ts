import platformHandler from "./platform-index";
import { isRuntimeOriginAllowed } from "./platform-cors";
import { adminRuntimeRoute } from "./platform-v3-admin";
import { patientPortalRoute } from "./platform-patient-portal";
import { patientIdentityRoute } from "./platform-patient-identity";
import { providerDirectoryRoute } from "./platform-provider-directory";
import { referralServiceRoute } from "./platform-referral-service";
import { assistantCredentialLogin, credentialLogin } from "./platform-v3-login";
import { profileCredential } from "./platform-v3-profile-password";
import type { V3Env } from "./platform-v3-base";

type Env = V3Env;

function json(request: Request, env: Env, body: unknown, status = 200) {
  const origin = request.headers.get("origin");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(isRuntimeOriginAllowed(origin, env)
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

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/v1/auth/password") {
      return credentialLogin(request, env);
    }

    if (
      request.method === "POST" &&
      url.pathname === "/v1/auth/assistant/password"
    ) {
      return assistantCredentialLogin(request, env);
    }

    if (request.method === "PATCH" && url.pathname === "/v1/profile/password") {
      return profileCredential(request, env);
    }

    if (request.method === "GET" && url.pathname === "/v1/platform-v3") {
      return json(request, env, {
        version: 3,
        status: "ready",
        capabilities: {
          passwordLogin: true,
          assistantPasswordLogin: true,
          passwordSetup: true,
          adminUsers: true,
          patientPortal:
            String(env.PATIENT_PORTAL_V1_ENABLED ?? "")
              .trim()
              .toLowerCase() === "true",
          patientIdentityV2:
            String(env.PATIENT_IDENTITY_V2_ENABLED ?? "")
              .trim()
              .toLowerCase() === "true",
          providerDirectory:
            String(env.PROVIDER_DIRECTORY_ENABLED ?? "")
              .trim()
              .toLowerCase() === "true",
          referralService:
            String(env.REFERRAL_SERVICE_ENABLED ?? "")
              .trim()
              .toLowerCase() === "true",
        },
      });
    }

    const patientIdentity = await patientIdentityRoute(request, env);
    if (patientIdentity) return patientIdentity;

    const providerDirectory = await providerDirectoryRoute(request, env);
    if (providerDirectory) return providerDirectory;

    const referralService = await referralServiceRoute(request, env);
    if (referralService) return referralService;

    // WS-2/WS-3: patient portal + clinician portal review namespace.
    // Fails closed unless PATIENT_PORTAL_V1_ENABLED === "true".
    const portal = await patientPortalRoute(request, env);
    if (portal) return portal;

    const adminRuntime = await adminRuntimeRoute(request, env);
    if (adminRuntime) return adminRuntime;

    return platformHandler.fetch(request, env as never);
  },
};
