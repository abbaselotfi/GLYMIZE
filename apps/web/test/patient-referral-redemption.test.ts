import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-portal-entry.tsx", import.meta.url)),
  "utf8",
);
const identity = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-identity-portal.tsx", import.meta.url)),
  "utf8",
);
const referral = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-referral-redemption.tsx", import.meta.url)),
  "utf8",
);
const client = readFileSync(
  fileURLToPath(new URL("../lib/referral-client.ts", import.meta.url)),
  "utf8",
);

describe("patient referral inspection and redemption", () => {
  it("is gated by server-authoritative referral capabilities and authenticated patient identity", () => {
    expect(entry).toContain("setReferralServiceEnabled(runtimeResult.value.referralService)");
    expect(entry).toContain("referralServiceEnabled={referralServiceEnabled}");
    expect(referral).toContain("getReferralCapabilities()");
    expect(referral).toContain("capabilities.referralService && capabilities.patientRedemption");
    expect(referral).toContain("if (!enabled || !ready || !patientRedemptionEnabled) return null");

    const accountBranch = identity.indexOf("if (account) {");
    const identityEntry = identity.indexOf('data-patient-surface="identity-entry"');
    const referralSurface = identity.indexOf("<PatientReferralRedemption");
    expect(accountBranch).toBeGreaterThanOrEqual(0);
    expect(referralSurface).toBeGreaterThan(accountBranch);
    expect(identityEntry).toBeGreaterThan(referralSurface);
    expect(identity.match(/<PatientReferralRedemption\b/g)).toHaveLength(1);
  });

  it("keeps inspection read-only and requires a separate explicit redemption action", () => {
    expect(referral).toContain("const next = await inspectReferralCode(normalized)");
    expect(referral).toContain("async function redeem()");
    expect(referral).toContain("const next = await redeemReferralCode(inspectedCode)");
    expect(referral).toContain('type="button" disabled={busy} onClick={() => void redeem()}');

    const inspectStart = referral.indexOf("async function inspect(");
    const redeemStart = referral.indexOf("async function redeem()");
    expect(inspectStart).toBeGreaterThanOrEqual(0);
    expect(redeemStart).toBeGreaterThan(inspectStart);
    expect(referral.slice(inspectStart, redeemStart)).not.toContain("redeemReferralCode(");
  });

  it("uses patient identity authentication and explicit confirmation for redemption", () => {
    const redeemClientStart = client.indexOf("export async function redeemReferralCode");
    const managedReferralStart = client.indexOf("export async function listManagedReferrals");
    expect(redeemClientStart).toBeGreaterThanOrEqual(0);
    expect(managedReferralStart).toBeGreaterThan(redeemClientStart);
    const redeemClient = client.slice(redeemClientStart, managedReferralStart);
    expect(redeemClient).toContain('patientIdentityFetch("/v1/referrals/redeem"');
    expect(redeemClient).toContain("JSON.stringify({ code, confirmed: true })");
    expect(redeemClient).not.toContain("runtimeFetch(");
  });

  it("does not expose managed referral or record-access mutation surfaces", () => {
    expect(referral).not.toContain("runtimeFetch(");
    expect(referral).not.toContain("issueManagedReferral");
    expect(referral).not.toContain("revokeManagedReferral");
    expect(referral).not.toContain("selectPatientPracticeContext");
    expect(referral).not.toContain("exchangeVerifiedPatientLegacyLink");
    expect(referral).toContain("does not by itself grant clinical-record access");
    expect(referral).toContain("Record access requires separate authorization");
  });

  it("renders only the patient-safe referral inspection projection", () => {
    for (const field of [
      "inspection.provider.displayName",
      "inspection.provider.specialtyName",
      "inspection.provider.practiceDisplayName",
      "inspection.purposeLabel",
      "inspection.expiresAt",
      "inspection.remainingUses",
    ]) {
      expect(referral).toContain(field);
    }
    expect(referral).not.toContain("physicianUserId");
    expect(referral).not.toContain("practiceId");
    expect(referral).not.toContain("permissions");
  });
});
