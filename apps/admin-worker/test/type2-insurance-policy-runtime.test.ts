import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REVIEWED_TYPE2_INSURANCE_CLAIM_TIMING_POLICIES,
  TYPE2_INSURANCE_CLAIM_POLICY_AUTHORITY,
  type2InsurancePolicyRoute,
} from "../src/platform-type2-insurance-policies";

const runtime = fs.readFileSync(
  new URL("../src/platform-type2-insurance-policies.ts", import.meta.url),
  "utf8",
);
const platform = fs.readFileSync(
  new URL("../src/platform-v3.ts", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("trusted Type 2 claim-timing policy runtime", () => {
  it("keeps the reviewed registry empty until an authoritative policy is deliberately promoted", () => {
    expect(TYPE2_INSURANCE_CLAIM_POLICY_AUTHORITY).toBe(
      "GLYMIZE_WORKER_REVIEWED_CLAIM_TIMING_V1",
    );
    expect(REVIEWED_TYPE2_INSURANCE_CLAIM_TIMING_POLICIES).toEqual([]);
    expect(runtime).toContain("No insurer timing rule is guessed or inferred");
    expect(runtime).not.toMatch(/coveragePercent|patientShareToman|insurerShareToman/);
    expect(runtime).not.toMatch(/fetch\(|https?:\/\//);
  });

  it("requires a runtime session and explicit Type 2 permission", async () => {
    const unauthenticated = await type2InsurancePolicyRoute(
      new Request("https://worker.example.test/v1/clinical/type2/insurance-policy-snapshot"),
      testEnv,
    );
    expect(unauthenticated?.status).toBe(401);
    expect(await unauthenticated?.json()).toEqual({ error: "auth_required" });

    expect(runtime).toContain("v3RequireRuntime(request, env)");
    expect(runtime).toContain('runtime.user.permissions.includes("type2")');
    expect(runtime).toContain("type2_permission_required");
  });

  it("is wired into the Worker runtime without changing the Type 2 evaluator", () => {
    expect(platform).toContain('from "./platform-type2-insurance-policies"');
    expect(platform).toContain("type2InsurancePolicyRoute(request, env)");
    expect(runtime).toContain('url.pathname !== "/v1/clinical/type2/insurance-policy-snapshot"');
    expect(runtime).toContain('"cache-control": "no-store"');
    expect(runtime).not.toContain("@glymize/clinical-engine");
  });

  it("returns a bodyless preflight only for an allowed exact origin", async () => {
    const allowed = await type2InsurancePolicyRoute(
      new Request("https://worker.example.test/v1/clinical/type2/insurance-policy-snapshot", {
        method: "OPTIONS",
        headers: { origin: testEnv.ADMIN_ORIGIN },
      }),
      testEnv,
    );
    expect(allowed?.status).toBe(204);
    expect(await allowed?.text()).toBe("");

    const denied = await type2InsurancePolicyRoute(
      new Request("https://worker.example.test/v1/clinical/type2/insurance-policy-snapshot", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example.test" },
      }),
      testEnv,
    );
    expect(denied?.status).toBe(403);
  });
});
