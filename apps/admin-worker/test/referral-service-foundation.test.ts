import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { referralServiceRoute } from "../src/platform-referral-service";

const migration = fs.readFileSync(
  new URL("../migrations/0012_referral_service_foundation.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../src/platform-referral-service.ts", import.meta.url),
  "utf8",
);
const identityRuntime = fs.readFileSync(
  new URL("../src/platform-patient-identity.ts", import.meta.url),
  "utf8",
);
const contract = fs.readFileSync(
  new URL("../../../packages/contracts/src/referrals.ts", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../../../docs/P5_B2_REFERRAL_SERVICE_DESIGN.md", import.meta.url),
  "utf8",
);

const testEnv = {
  ADMIN_ORIGIN: "https://rc.example.test",
  SESSION_SECRET: "test-only-session-secret",
};

describe("P5-B2 referral service foundation", () => {
  it("stores only a unique keyed code hash with bounded lifecycle metadata", () => {
    expect(migration).toContain("code_hash TEXT NOT NULL UNIQUE");
    expect(migration).toContain("code_hint TEXT NOT NULL");
    expect(migration).toContain("max_uses INTEGER NOT NULL DEFAULT 1");
    expect(migration).toContain("max_uses BETWEEN 1 AND 100");
    expect(migration).toContain("expires_at TEXT NOT NULL");
    expect(migration).toContain("revoked_at TEXT");
    expect(migration).not.toMatch(/\bcode\s+TEXT/i);
    expect(runtime).toContain("randomToken(18)");
    expect(runtime).toContain("hmacHex(secret, `referral-code:${code}`)");
    expect(runtime).toContain("REFERRAL_CODE_LOOKUP_SECRET_PREVIOUS");
  });

  it("keeps redemption separate from care relationship and patient records", () => {
    const sql = migration.replace(/^--.*$/gm, "");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS referral_redemptions");
    expect(migration).toContain("REFERENCES patient_accounts(id) ON DELETE RESTRICT");
    expect(migration).toContain("'pending_care_relationship'");
    expect(migration).toContain("UNIQUE (referral_id, patient_account_id)");
    expect(sql).not.toMatch(/ALTER TABLE\s+patient_registry/i);
    expect(sql).not.toMatch(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?care_relationship/i);
    expect(runtime).not.toContain("patient_registry");
    expect(runtime).not.toContain("care_relationships");
    expect(design).toContain("never creates a clinical-data grant");
  });

  it("requires an authorized issuer and a verified published intended provider", () => {
    expect(runtime).toContain('auth.user.role === "physician"');
    expect(runtime).toContain('auth.user.permissions.includes("referrals.manage")');
    expect(runtime).toContain("p.directory_status='published'");
    expect(runtime).toContain("u.irimc_status='verified'");
    expect(runtime).toContain("intended_provider_unavailable");
    const admin = fs.readFileSync(
      new URL("../src/platform-v3-admin.ts", import.meta.url),
      "utf8",
    );
    expect(admin).toContain("SELECT count(*) FROM referral_invites");
    expect(admin).toContain("SELECT count(*) FROM referral_redemptions");
  });

  it("returns the credential once and keeps it out of the QR request path and audit metadata", () => {
    expect(contract).toContain("The plaintext credential is returned exactly once");
    expect(runtime).toContain("/portal/#referral=${encodeURIComponent(code)}");
    expect(runtime).toContain(
      "JSON.stringify({ intendedPhysicianUserId, maxUses, expiresAt })",
    );
    expect(runtime).not.toContain("JSON.stringify({ code");
  });

  it("consumes capacity atomically and makes same-account retries idempotent", () => {
    const redemption = runtime.slice(
      runtime.indexOf("async function redeemReferral("),
      runtime.indexOf("export async function referralServiceRoute("),
    );
    expect(redemption.indexOf("INSERT INTO referral_redemptions"))
      .toBeLessThan(redemption.indexOf("SET use_count=use_count+1"));
    expect(redemption).toContain(
      "WHERE id=? AND EXISTS(SELECT 1 FROM referral_redemptions WHERE id=?)",
    );
    expect(redemption).toContain("existingRedemption(env, referral.id, patient.patientAccountId)");
    expect(redemption).toContain('patient.proofingStatus === "rejected"');
    expect(redemption).toContain('body?.confirmed !== true');
    expect(redemption).toContain("patient_account.referral_redeemed");
  });

  it("exposes only a narrow patient-session helper to the referral boundary", () => {
    const helper = identityRuntime.slice(
      identityRuntime.indexOf("export async function requirePatientAccountSession"),
      identityRuntime.indexOf("function legacyLinkSummary"),
    );
    expect(helper).toContain("patientAccountId");
    expect(helper).toContain("proofingStatus");
    expect(helper).toContain("sessionId");
    expect(helper).not.toContain("password_hash");
    expect(helper).not.toContain("lookup_hash");
  });

  it("is OFF by default and returns a bodyless exact-origin preflight", async () => {
    const capability = await referralServiceRoute(
      new Request("https://worker.example.test/v1/referrals/capabilities"),
      testEnv,
    );
    expect(await capability?.json()).toEqual({
      referralService: false,
      patientRedemption: false,
    });
    const disabled = await referralServiceRoute(
      new Request("https://worker.example.test/v1/referrals"),
      testEnv,
    );
    expect(disabled?.status).toBe(403);
    expect(await disabled?.json()).toEqual({ error: "referral_service_disabled" });
    const preflight = await referralServiceRoute(
      new Request("https://worker.example.test/v1/referrals/inspect", {
        method: "OPTIONS",
        headers: { origin: testEnv.ADMIN_ORIGIN },
      }),
      testEnv,
    );
    expect(preflight?.status).toBe(204);
    expect(await preflight?.text()).toBe("");
  });

  it("uses generic unavailable errors and rate limits every abuse surface", () => {
    expect(runtime).toContain('error: "referral_unavailable"');
    expect(runtime).toContain("inspect-ip:");
    expect(runtime).toContain("redeem-ip:");
    expect(runtime).toContain("redeem-account:");
    expect(runtime).toContain("issue:");
  });
});
