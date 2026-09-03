import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { careRelationshipRoute } from "../src/platform-care-relationships";

const migration = fs.readFileSync(
  new URL("../migrations/0013_care_relationship_foundation.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../src/platform-care-relationships.ts", import.meta.url),
  "utf8",
);
const contract = fs.readFileSync(
  new URL("../../../packages/contracts/src/care-relationships.ts", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../../../docs/P5_B3_CARE_RELATIONSHIP_DESIGN.md", import.meta.url),
  "utf8",
);
const admin = fs.readFileSync(
  new URL("../src/platform-v3-admin.ts", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("P5-B3 care relationship foundation", () => {
  it("keeps one global-account relationship per practice with an optional local record", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS care_relationships");
    expect(migration).toContain("UNIQUE (patient_account_id, practice_id)");
    expect(migration).toContain("REFERENCES patient_accounts(id) ON DELETE RESTRICT");
    expect(migration).toContain("FOREIGN KEY (practice_id, local_patient_id)");
    expect(migration).toContain("REFERENCES patient_registry(practice_id, id) ON DELETE RESTRICT");
    const sql = migration.replace(/^--.*$/gm, "");
    expect(sql).not.toMatch(/UPDATE\s+patient_registry/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+patient_registry/i);
    expect(design).toContain("authoritative practice-local clinical record");
  });

  it("retains immutable referral redemption provenance", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS care_relationship_provenance");
    expect(migration).toContain("referral_redemption_id TEXT NOT NULL UNIQUE");
    expect(migration).toContain("REFERENCES referral_redemptions(id) ON DELETE RESTRICT");
    expect(runtime).toContain("p.referral_redemption_id=?");
    expect(runtime).toContain("d.patient_account_id=?");
    expect(runtime).toContain("relationship_request_unavailable");
  });

  it("requires patient authentication, explicit confirmation and rate limiting", () => {
    const requestFlow = runtime.slice(
      runtime.indexOf("async function requestRelationship("),
      runtime.indexOf("async function listPatientRelationships("),
    );
    expect(requestFlow).toContain("requirePatientAccountSession");
    expect(requestFlow).toContain('body?.confirmed !== true');
    expect(requestFlow).toContain("consumePatientRate");
    expect(requestFlow).toContain("patient.patientAccountId");
    expect(requestFlow).toContain('patient.proofingStatus === "rejected"');
    expect(requestFlow).toContain("relationship_provider_conflict");
  });

  it("keeps physician lifecycle authority separate from assistants", () => {
    const transitions = runtime.slice(
      runtime.indexOf("async function physicianTransition("),
      runtime.indexOf("async function patientRevoke("),
    );
    expect(transitions).toContain('auth.user.role !== "physician"');
    expect(transitions).toContain("assigned_physician_user_id !== auth.user.id");
    expect(transitions).toContain('physician?.irimc_status !== "verified"');
    expect(transitions).toContain('patient_proofing_status !== "verified"');
    expect(transitions).not.toContain('permissions.includes("care_relationships.manage")');
  });

  it("allows only explicit lifecycle transitions and records append-only events", () => {
    expect(contract).toContain('"requested"');
    expect(contract).toContain('"active"');
    expect(contract).toContain('"paused"');
    expect(contract).toContain('"ended"');
    expect(contract).toContain('"revoked"');
    expect(contract).toContain('"rejected"');
    expect(runtime).toContain('accept: { from: ["requested"], to: "active"');
    expect(runtime).toContain('resume: { from: ["paused"], to: "active"');
    expect(runtime).toContain("INSERT INTO care_relationship_events");
    expect(runtime).toContain("care_relationship_update_conflict");
  });

  it("never auto-matches and links a local record only through a verified bridge", () => {
    const linking = runtime.slice(
      runtime.indexOf("async function localRecordMutation("),
      runtime.indexOf("export async function careRelationshipRoute("),
    );
    expect(linking).toContain("PATIENT_RECORD_LINKING_ENABLED");
    expect(linking).toContain("portal_user_account_links");
    expect(linking).toContain("l.patient_account_id=? AND l.link_status='verified'");
    expect(linking).toContain("p.id=? AND p.practice_id=?");
    expect(linking).not.toContain("nationalId");
    expect(linking).not.toContain("patient_identifiers");
  });

  it("preserves relationship history during runtime-user and practice deletion", () => {
    expect(admin).toContain("SELECT count(*) FROM care_relationships WHERE assigned_physician_user_id=?");
    expect(admin).toContain("SELECT count(*) FROM care_relationships WHERE practice_id=?");
    expect(migration).toContain("REFERENCES practice_memberships(practice_id, user_id) ON DELETE RESTRICT");
  });

  it("is OFF by default and does not claim clinical authorization", async () => {
    const capability = await careRelationshipRoute(
      new Request("https://worker.example.test/v1/care-relationships/capabilities"),
      testEnv,
    );
    expect(await capability?.json()).toEqual({
      careRelationships: false,
      localRecordLinking: false,
      clinicalAuthorization: false,
    });
    const disabled = await careRelationshipRoute(
      new Request("https://worker.example.test/v1/care-relationships/patient"),
      testEnv,
    );
    expect(disabled?.status).toBe(403);
    expect(await disabled?.json()).toEqual({ error: "care_relationships_disabled" });
  });

  it("returns a bodyless CORS preflight only for an allowed exact origin", async () => {
    const response = await careRelationshipRoute(
      new Request("https://worker.example.test/v1/care-relationships/patient", {
        method: "OPTIONS",
        headers: { origin: testEnv.ADMIN_ORIGIN },
      }),
      testEnv,
    );
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe(testEnv.ADMIN_ORIGIN);
    expect(await response?.text()).toBe("");
  });
});
