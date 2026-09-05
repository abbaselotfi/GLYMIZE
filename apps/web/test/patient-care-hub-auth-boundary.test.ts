import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const identityPortal = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-identity-portal.tsx", import.meta.url)),
  "utf8",
);
const authenticatedHub = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-care-hub.tsx", import.meta.url)),
  "utf8",
);

describe("authenticated Patient Care Hub boundary", () => {
  it("moves the post-authenticated account surface out of the identity-entry component", () => {
    expect(identityPortal).toContain('import PatientCareHub from "./patient-care-hub"');
    expect(identityPortal).toContain("<PatientCareHub");
    expect(identityPortal).toContain('data-patient-surface="identity-entry"');
    expect(identityPortal).not.toContain("GLOBAL PATIENT ACCOUNT");
  });

  it("keeps authentication authority in PatientIdentityPortal rather than duplicating it in the hub", () => {
    expect(identityPortal).toContain("loginPatientIdentity");
    expect(identityPortal).toContain("logoutPatientIdentity");
    expect(authenticatedHub).not.toContain("loginPatientIdentity");
    expect(authenticatedHub).not.toContain("registerPatientIdentity");
    expect(authenticatedHub).not.toContain("logoutPatientIdentity");
  });

  it("treats practice records as verified separate destinations, not a merged global chart", () => {
    expect(authenticatedHub).toContain('data-patient-surface="care-hub"');
    expect(authenticatedHub).toContain("links.map");
    expect(authenticatedHub).toContain("link.portalUserId");
    expect(authenticatedHub).toContain("link.practiceName");
    expect(authenticatedHub).toContain("does not merge records across organizations");
    expect(authenticatedHub).toContain("never exposes clinical data without a verified link");
  });

  it("keeps a linked practice unavailable when the legacy practice portal is disabled", () => {
    expect(authenticatedHub).toContain("legacyPortalEnabled ?");
    expect(authenticatedHub).toContain("This practice portal is currently unavailable");
    expect(authenticatedHub).toContain("onOpenPractice(link)");
  });
});
