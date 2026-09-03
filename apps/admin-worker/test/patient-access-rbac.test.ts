import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  authorizePatientRoute,
  isSelfApproval,
  PATIENT_ROUTE_REQUIREMENTS,
  patientRoleAllows,
  type PatientAccessRole,
} from "../src/patient-access-rbac";
import platformHandler from "../src/platform-index";
import { patientIdentityRoute } from "../src/platform-patient-identity";
import { patientPortalRoute } from "../src/platform-patient-portal";
import { patientRecordV2Route } from "../src/platform-patient-record-v2";

const migration = fs.readFileSync(
  new URL("../migrations/0018_patient_access_rbac.sql", import.meta.url),
  "utf8",
);
const platform = fs.readFileSync(new URL("../src/platform-index.ts", import.meta.url), "utf8");
const records = fs.readFileSync(
  new URL("../src/platform-patient-record-v2.ts", import.meta.url),
  "utf8",
);
const portal = fs.readFileSync(
  new URL("../src/platform-patient-portal.ts", import.meta.url),
  "utf8",
);
const identity = fs.readFileSync(
  new URL("../src/platform-patient-identity.ts", import.meta.url),
  "utf8",
);
const admin = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

function roleDatabase(...roles: Array<PatientAccessRole | null>) {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const database = {
    prepare(query: string) {
      const call = { query, values: [] as unknown[] };
      calls.push(call);
      return {
        bind(...values: unknown[]) {
          call.values = values;
          return {
            async first() {
              const role = roles.shift() ?? null;
              return role ? { role } : null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { calls, database };
}

describe("patient-adjacent Worker RBAC", () => {
  it("migrates active memberships to persisted editor and approver roles", () => {
    expect(migration).toContain("patient_access_role_assignments");
    expect(migration).toContain("role IN ('editor','approver')");
    expect(migration).toContain("WHEN 'physician' THEN 'approver'");
    expect(migration).toContain("ELSE 'editor'");
    expect(migration).toContain("patient_access_role_membership_insert");
    expect(migration).toContain("patient_access_role_membership_update");
  });

  it("checks the persisted role again for every route authorization", async () => {
    const { calls, database } = roleDatabase("editor", null);

    const first = await authorizePatientRoute(
      database,
      "user-1",
      "practice-1",
      "patient_record.encounter.revise",
    );
    const second = await authorizePatientRoute(
      database,
      "user-1",
      "practice-1",
      "patient_record.encounter.revise",
    );

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.query).toContain("patient_access_role_assignments");
    expect(calls[0]?.query).toContain("m.status='active'");
    expect(calls[0]?.query).toContain("u.status='active'");
    expect(calls[0]?.values).toEqual(["user-1", "practice-1"]);
  });

  it("allows editors to draft but never to approve", () => {
    expect(patientRoleAllows("editor", "editor")).toBe(true);
    expect(patientRoleAllows("editor", "approver")).toBe(false);
    expect(patientRoleAllows("approver", "editor")).toBe(true);
    expect(patientRoleAllows("approver", "approver")).toBe(true);
    expect(patientRoleAllows(null, "editor")).toBe(false);
    expect(isSelfApproval("user-1", "user-1")).toBe(true);
    expect(isSelfApproval("user-2", "user-1")).toBe(false);
  });

  it("assigns a route policy to every patient-record and clinician-portal operation", () => {
    expect(PATIENT_ROUTE_REQUIREMENTS).toMatchObject({
      "patient_record.patient.create": "editor",
      "patient_record.identifier.create": "editor",
      "patient_record.encounter.create": "editor",
      "patient_record.encounter.read": "editor",
      "patient_record.encounter.revise": "editor",
      "patient_record.encounter.approve": "approver",
      "portal_clinician.submission.read": "editor",
      "portal_clinician.submission.manage": "editor",
      "portal_clinician.submission.approve": "approver",
      "portal_clinician.thread.read": "editor",
      "portal_clinician.thread.write": "editor",
      "portal_clinician.attachment.read": "editor",
      "portal_clinician.account.create": "editor",
      "patient_identity.legacy_link.request": "editor",
      "patient_identity.legacy_link.approve": "approver",
    });

    for (const route of Object.keys(PATIENT_ROUTE_REQUIREMENTS)) {
      expect(`${platform}\n${records}\n${portal}\n${identity}`).toContain(route);
    }
  });

  it("keeps authentication ahead of route authorization and rejects self-approval", () => {
    expect(platform).toContain('if (!auth) return json(request,env,{error:"auth_required"},401);');
    expect(portal).toContain(
      'if (!auth) return reply(request, env, { error: "auth_required" }, 401);',
    );
    expect(identity).toContain('{ error: reply(request, env, { error: "auth_required" }, 401) }');
    expect(records).toContain('{ error: "self_approval_forbidden" }');
    expect(identity).toContain('{ error: "self_approval_forbidden" }');
  });

  it("rejects unauthenticated patient-record, portal-clinician, and identity-review requests", async () => {
    const baseEnv = {
      ADMIN_ORIGIN: "https://admin.example",
      ADMIN_PATH_PREFIX: "/admin",
      SESSION_SECRET: "test-session-secret-that-is-long-enough",
    };

    const recordResponse = await platformHandler.fetch(
      new Request("https://worker.example/v1/patients/archive"),
      baseEnv as never,
    );
    const portalResponse = await patientPortalRoute(
      new Request("https://worker.example/v1/portal/admin/submissions"),
      { ...baseEnv, PATIENT_PORTAL_V1_ENABLED: "true" },
    );
    const identityResponse = await patientIdentityRoute(
      new Request("https://worker.example/v1/patient-identity/legacy-links"),
      { ...baseEnv, PATIENT_IDENTITY_V2_ENABLED: "true" },
    );

    expect(recordResponse.status).toBe(401);
    expect(await recordResponse.json()).toEqual({ error: "auth_required" });
    expect(portalResponse?.status).toBe(401);
    expect(await portalResponse?.json()).toEqual({ error: "auth_required" });
    expect(identityResponse?.status).toBe(401);
    expect(await identityResponse?.json()).toEqual({ error: "auth_required" });
  });

  it("denies a recognized patient route before data access when its route role is absent", async () => {
    let databaseTouched = false;
    const response = await patientRecordV2Route(
      new Request("https://worker.example/v1/patients/archive"),
      {
        database: new Proxy({} as D1Database, {
          get() {
            databaseTouched = true;
            throw new Error("database should not be read after denial");
          },
        }),
        clinicalSecret: "test-clinical-secret",
        user: {
          id: "user-1",
          role: "assistant",
          practiceId: "practice-1",
          permissions: ["handoff.read"],
          layoutPreset: "auto",
        },
        authorize: async (route) => {
          expect(route).toBe("patient_record.archive.read");
          return false;
        },
        respond: (body, status = 200) => Response.json(body, { status }),
        audit: async () => undefined,
      },
    );

    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({
      error: "patient_role_required",
      requiredRole: "editor",
    });
    expect(databaseTouched).toBe(false);
  });

  it("limits the hardcoded GitHub principal to the documented catalogue exception", () => {
    expect(admin).toContain('url.pathname === "/catalog/publish"');
    expect(admin).toContain('session.source !== "github"');
    expect(records).not.toContain("ALLOWED_GITHUB_LOGIN");
    expect(portal).not.toContain("ALLOWED_GITHUB_LOGIN");
    expect(identity).not.toContain("ALLOWED_GITHUB_LOGIN");
  });
});
