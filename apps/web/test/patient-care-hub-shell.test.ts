import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shell = readFileSync(
  fileURLToPath(new URL("../app/patient/patient-care-hub-shell.tsx", import.meta.url)),
  "utf8",
);
const patientPage = readFileSync(
  fileURLToPath(new URL("../app/patient/page.tsx", import.meta.url)),
  "utf8",
);
const portalPage = readFileSync(
  fileURLToPath(new URL("../app/portal/page.tsx", import.meta.url)),
  "utf8",
);

describe("Patient Care Hub shell", () => {
  it("provides a dedicated patient route while preserving the legacy /portal entry", () => {
    expect(patientPage).toContain("PatientCareHubShell");
    expect(portalPage).toContain("PatientCareHubShell");
    expect(shell).toContain('data-app="patient-care-hub"');
    expect(shell).toContain('data-actor="patient"');
  });

  it("reuses the existing patient identity / portal entry instead of duplicating authentication", () => {
    expect(shell).toContain('import PatientPortalEntry from "../portal/patient-portal-entry"');
    expect(shell).toContain("<PatientPortalEntry />");
    expect(shell).not.toContain("loginPatientIdentity(");
    expect(shell).not.toContain("registerPatientIdentity(");
  });

  it("keeps the patient app structurally separate from clinician and assistant shells", () => {
    expect(shell).not.toContain('href="/account"');
    expect(shell).not.toContain("glymize-internal-shell");
    expect(shell).not.toContain("global-topbar");
    expect(shell).not.toContain("ClinicianShell");
  });

  it("states the practice-local record boundary and rejects silent cross-practice merging", () => {
    expect(shell).toContain("هر پرونده درمانی همچنان متعلق به همان مطب می‌ماند");
    expect(shell).toContain("records from different practices are never silently merged");
    expect(shell).toContain("کد ملی به‌تنهایی دسترسی به پرونده پزشکی ایجاد نمی‌کند");
  });
});
