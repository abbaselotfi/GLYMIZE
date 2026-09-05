import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const landing = readFileSync(
  fileURLToPath(new URL("../app/page.tsx", import.meta.url)),
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

describe("canonical patient entry", () => {
  it("routes every public patient CTA to /patient", () => {
    expect(landing.match(/data-actor="patient" href="\/patient"/g)).toHaveLength(1);
    expect(landing).toContain('className={styles.secondaryCta}\n              href="/patient"');
    expect(landing).not.toContain('data-actor="patient" href="/portal"');
    expect(landing).not.toContain('className={styles.secondaryCta}\n              href="/portal"');
  });

  it("keeps clinician and assistant entry on /account", () => {
    expect(landing).toContain('data-actor="clinician" href="/account"');
    expect(landing).toContain('className={styles.primaryCta} href="/account"');
  });

  it("keeps /portal only as a compatibility route to the same patient shell", () => {
    expect(patientPage).toContain("PatientCareHubShell");
    expect(portalPage).toContain("PatientCareHubShell");
    expect(portalPage).not.toContain("PatientPortalEntry");
  });
});
