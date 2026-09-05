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
const relationships = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-care-relationships.tsx", import.meta.url)),
  "utf8",
);
const client = readFileSync(
  fileURLToPath(new URL("../lib/care-relationship-client.ts", import.meta.url)),
  "utf8",
);

describe("patient care relationship governance", () => {
  it("requires both the runtime capability and the service capability boundary", () => {
    expect(entry).toContain("setCareRelationshipsEnabled(runtimeResult.value.careRelationships)");
    expect(entry).toContain("careRelationshipsEnabled={careRelationshipsEnabled}");
    expect(relationships).toContain("getCareRelationshipCapabilities()");
    expect(relationships).toContain(
      "capabilities.careRelationships && capabilities.clinicalAuthorization === false",
    );
    expect(relationships).toContain("if (!enabled || !ready || !available) return null");
  });

  it("exists only inside the authenticated global-patient account branch", () => {
    const accountBranch = identity.indexOf("if (account) {");
    const careSurface = identity.indexOf("<PatientCareRelationships");
    const identityEntry = identity.indexOf('data-patient-surface="identity-entry"');
    expect(accountBranch).toBeGreaterThanOrEqual(0);
    expect(careSurface).toBeGreaterThan(accountBranch);
    expect(identityEntry).toBeGreaterThan(careSurface);
    expect(identity.match(/<PatientCareRelationships\b/g)).toHaveLength(1);
  });

  it("keeps referral redemption and relationship creation as separate explicit actions", () => {
    expect(referral).toContain("onRedeemed?.(next)");
    expect(identity).toContain("onRedeemed={(redemption) => setPendingCareRelationshipReferral(redemption)}");
    expect(relationships).toContain('pendingReferral.status !== "pending_care_relationship"');
    expect(relationships).toContain("await requestCareRelationship({");
    expect(relationships).toContain("referralRedemptionId: pendingReferral.id");
    expect(relationships).toContain("confirmed: true");
    expect(relationships).toContain("Confirm and request care relationship");

    const patientClientEnd = client.indexOf("export async function listPracticeCareRelationships");
    const patientClient = client.slice(0, patientClientEnd);
    expect(patientClient).toContain('patientIdentityFetch("/v1/care-relationships/requests"');
    expect(patientClient).toContain('patientIdentityFetch("/v1/care-relationships/patient"');
    expect(patientClient).toContain("/patient-revoke");
    expect(patientClient).not.toContain("runtimeFetch(");
  });

  it("allows patient revocation only for the backend-authorized active states with a second confirmation", () => {
    for (const status of ['"requested"', '"active"', '"paused"']) {
      expect(relationships).toContain(status);
    }
    expect(relationships).toContain("PATIENT_REVOCABLE.has(relationship.status)");
    expect(relationships).toContain("setConfirmingRevokeId(relationship.id)");
    expect(relationships).toContain("async function confirmRevoke(relationshipId: string)");
    expect(relationships).toContain("await revokePatientCareRelationship(relationshipId, {");
    expect(relationships).toContain('reasonCode: "patient_requested"');
    expect(relationships).toContain("Confirm revocation");
  });

  it("renders patient-safe provider/status data without exposing management or record-link actions", () => {
    for (const field of [
      "relationship.provider.displayName",
      "relationship.provider.specialtyName",
      "relationship.provider.practiceDisplayName",
      "relationship.status",
      "relationship.updatedAt",
      "relationship.activatedAt",
      "relationship.terminalAt",
    ]) {
      expect(relationships).toContain(field);
    }
    for (const forbidden of [
      "assignedPhysicianUserId",
      "patientAccountId",
      "practiceId",
      "localPatientId",
      "linkedLocalRecord",
      "listPracticeCareRelationships",
      "transitionCareRelationship",
      "linkCareRelationshipLocalRecord",
      "unlinkCareRelationshipLocalRecord",
      "runtimeFetch(",
      "exchangeVerifiedPatientLegacyLink",
      "selectPatientPracticeContext",
    ]) {
      expect(relationships).not.toContain(forbidden);
    }
    expect(relationships).toContain("does not by itself authorize record viewing or cross-practice access");
    expect(relationships).toContain("does not grant record access");
  });
});
