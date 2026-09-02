import fs from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = fs.readFileSync(
  new URL("../src/platform-patient-identity.ts", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../migrations/0008_reviewed_patient_legacy_links.sql", import.meta.url),
  "utf8",
);
const portalSessionMigration = fs.readFileSync(
  new URL("../migrations/0009_portal_session_auth_source.sql", import.meta.url),
  "utf8",
);
const portalRuntime = fs.readFileSync(
  new URL("../src/platform-patient-portal.ts", import.meta.url),
  "utf8",
);
const contracts = fs.readFileSync(
  new URL("../../../packages/contracts/src/patient-identity.ts", import.meta.url),
  "utf8",
);

describe("P5-A reviewed practice-local record linking", () => {
  it("adds explicit reviewer evidence without introducing the P5-B domain", () => {
    expect(migration).toContain("requested_by_runtime_user_id");
    expect(migration).toContain("verification_method");
    expect(migration).toContain("reviewed_at");
    expect(migration).not.toMatch(/CREATE TABLE[^;]*care_relationships/i);
    expect(migration).not.toContain("ALTER TABLE patient_registry");
    expect(migration).not.toContain("INSERT INTO portal_user_account_links");
  });

  it("keeps every mutation behind an independent OFF-by-default gate", () => {
    expect(runtime).toContain("PATIENT_RECORD_LINKING_ENABLED");
    expect(runtime).toContain('error: "record_linking_disabled"');
    expect(runtime).toContain("recordLinkingEnabled(env)");
    expect(runtime).toContain("recordLinking:");
  });

  it("requires practice-scoped request and physician/admin confirmation", () => {
    expect(runtime).toContain("id=? AND practice_id=? AND status='active'");
    expect(runtime).toContain('permissions.includes("handoff.read")');
    expect(runtime).toContain('permissions.includes("admin.users")');
    expect(runtime).toContain('user.role !== "physician"');
    expect(runtime).toContain('body.confirmed !== true');
    expect(runtime).toContain("status='active' AND proofing_status<>'rejected'");
    expect(runtime).toContain("invalid_link_transition");
  });

  it("never accepts identifier equality as proof or merges local records", () => {
    const linking = runtime.slice(runtime.indexOf("async function patientLinks("));
    expect(linking).not.toContain("identityHash(");
    expect(linking).not.toContain("nationalId");
    expect(runtime).not.toContain("patient_registry");
    expect(runtime).not.toContain("care_relationships");
  });

  it("shares stable patient and review contracts with the web client", () => {
    expect(contracts).toContain("PatientIdentityCapabilities");
    expect(contracts).toContain("PatientIdentitySessionResult");
    expect(contracts).toContain("PatientLegacyLinkRequestInput");
    expect(contracts).toContain("PatientLegacyLinkDecisionInput");
    expect(contracts).toContain("do not model or");
  });

  it("exchanges only a verified, proofed link and preserves its auth source", () => {
    expect(runtime).toContain("identity_proofing_required");
    expect(runtime).toContain("issuePortalSessionForVerifiedPatientLink");
    expect(runtime).toContain("patient_account.portal_session_exchanged");
    expect(runtime).toContain("auth_source='patient_identity'");
    expect(portalRuntime).toContain("l.link_status='verified'");
    expect(portalRuntime).toContain("a.proofing_status='verified'");
    expect(portalRuntime).toContain('"patient_identity"');
    expect(portalRuntime).toContain("token.auth_source");
    expect(portalSessionMigration).toContain("auth_source TEXT NOT NULL DEFAULT 'legacy_portal'");
    expect(portalSessionMigration).toContain("'legacy_portal','patient_identity'");
  });
});
