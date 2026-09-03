import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { patientIdentityRoute } from "../src/platform-patient-identity";

const runtime = fs.readFileSync(
  new URL("../src/platform-patient-identity.ts", import.meta.url),
  "utf8",
);
const entry = fs.readFileSync(
  new URL("../src/platform-v3.ts", import.meta.url),
  "utf8",
);

describe("P5-A3 PatientIdentityService runtime contract", () => {
  it("is routed behind independent OFF-by-default capabilities", () => {
    expect(entry).toContain("patientIdentityRoute");
    expect(runtime).toContain("PATIENT_IDENTITY_V2_ENABLED");
    expect(runtime).toContain("PATIENT_SELF_REGISTRATION_ENABLED");
    expect(runtime).toContain("PATIENT_SMS_OTP_ENABLED");
    expect(runtime).toContain('error: "patient_identity_disabled"');
    expect(runtime).toContain('error: "self_registration_disabled"');
  });

  it("returns a bodyless CORS preflight for an allowed origin", async () => {
    const origin = "https://rc.example.test";
    const response = await patientIdentityRoute(
      new Request("https://worker.example.test/v1/patient-identity/capabilities", {
        method: "OPTIONS",
        headers: { origin },
      }),
      { ADMIN_ORIGIN: origin, SESSION_SECRET: "test-only-session-secret" },
    );
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe(origin);
    expect(await response?.text()).toBe("");
  });

  it("uses national ID only as a protected identifier", () => {
    expect(runtime).toContain("validateIranianNationalId(nationalId)");
    expect(runtime).toContain("patient-national-id:");
    expect(runtime).toContain("PATIENT_IDENTITY_LOOKUP_SECRET");
    expect(runtime).toContain("encryptClinicalPayload(");
    expect(runtime).toContain("registration_unavailable");
    expect(runtime).not.toContain("national_id TEXT");
  });

  it("creates unlinked accounts and keeps clinical linking outside registration", () => {
    const registration = runtime.slice(
      runtime.indexOf("async function register("),
      runtime.indexOf("async function login("),
    );
    expect(runtime).toContain('proofingStatus: "unverified"');
    expect(registration).toContain("linkedClinicalRecord: false");
    expect(registration).not.toContain("portal_user_account_links");
    expect(runtime).not.toContain("patient_registry");
    expect(runtime).not.toContain("care_relationships");
  });

  it("consumes a refresh parent before issuing its child and contains family replay", () => {
    const issue = runtime.slice(
      runtime.indexOf("async function issueSession("),
      runtime.indexOf("async function requirePatient("),
    );
    expect(issue.indexOf("SET revoked_at=?,last_used_at=?,replaced_by_token_id=?"))
      .toBeLessThan(issue.indexOf("await insert.run();"));
    expect(issue).toContain("consumed.meta.changes");
    expect(runtime).toContain("replaced_by_token_id=?");
    expect(runtime).toContain("refresh_token_rotation_conflict");
    expect(runtime).toContain("refresh_token_reuse_detected");
    expect(runtime).toContain("compromised_at=?");
    expect(runtime).toContain("WHERE family_id=?");
  });

  it("binds session identity, account and family in schema order", () => {
    const start = runtime.indexOf("const insert = database.prepare(");
    const end = runtime.indexOf("if (parentTokenId)", start);
    const insert = runtime.slice(start, end);
    const expectedOrder = [
      "sessionId",
      "account.id",
      "refreshHash",
      "familyId ?? sessionId",
      "parentTokenId ?? null",
    ];
    let cursor = -1;
    for (const marker of expectedOrder) {
      const next = insert.indexOf(marker, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });
});
