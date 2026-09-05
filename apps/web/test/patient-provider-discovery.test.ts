import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-portal-entry.tsx", import.meta.url)),
  "utf8",
);
const discovery = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-provider-discovery.tsx", import.meta.url)),
  "utf8",
);
const client = readFileSync(
  fileURLToPath(new URL("../lib/provider-directory-client.ts", import.meta.url)),
  "utf8",
);

describe("patient-safe provider discovery", () => {
  it("is rendered only from the server-authoritative providerDirectory capability", () => {
    expect(entry).toContain("setProviderDirectoryEnabled(runtimeResult.value.providerDirectory)");
    expect(entry).toContain("<PatientProviderDiscovery enabled={providerDirectoryEnabled} />");
    expect(discovery).toContain("if (!enabled) return null");
  });

  it("uses only the patient-safe provider search read path", () => {
    expect(discovery).toContain("searchProviderDirectory");
    expect(client).toContain('fetch(endpoint(`/v1/provider-directory/providers${suffix}`)');
    expect(discovery).not.toContain("runtimeFetch(");
    expect(discovery).not.toContain("patientIdentityFetch(");
  });

  it("does not create a care relationship, referral redemption, or record access action", () => {
    expect(discovery).not.toContain("createCareRelationship");
    expect(discovery).not.toContain("redeemReferral");
    expect(discovery).not.toContain("selectPatientPracticeContext");
    expect(discovery).not.toContain("exchangeVerifiedPatientLegacyLink");
    expect(discovery).toContain("Discovery alone never grants clinical access");
  });

  it("renders only fields available on the public provider projection", () => {
    for (const field of [
      "provider.displayName",
      "provider.specialtyName",
      "provider.subspecialtyName",
      "provider.practiceDisplayName",
      "provider.publicLocation",
      "provider.medicalCouncilCode",
      "provider.visitModes",
    ]) {
      expect(discovery).toContain(field);
    }
    expect(discovery).not.toContain("physicianUserId");
    expect(discovery).not.toContain("practiceId");
    expect(discovery).not.toContain("permissions");
  });
});
