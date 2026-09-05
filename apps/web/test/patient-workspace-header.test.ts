import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("stable Patient Workspace header", () => {
  const headerSource = fs.readFileSync(
    new URL("../app/records/patient-workspace-header.tsx", import.meta.url),
    "utf8",
  );
  const recordsSource = fs.readFileSync(
    new URL("../app/records/records-client.tsx", import.meta.url),
    "utf8",
  );

  it("renders patient identity from the stable Patient Record v2 aggregate", () => {
    expect(headerSource).toContain("workspace.patient");
    expect(headerSource).toContain("patient.demographics?.firstName");
    expect(headerSource).toContain("patient.demographics?.lastName");
    expect(headerSource).toContain("patient.identifiers.map");
    expect(headerSource).toContain("identifier.displayMask");
    expect(headerSource).toContain("identifier.isPrimary");
  });

  it("shows longitudinal context rather than binding the header to the selected encounter", () => {
    expect(headerSource).toContain("workspace.encounters.length");
    expect(headerSource).toContain("patient.latestEncounterAt ?? workspace.encounters[0]?.encounterAt");
    expect(headerSource).not.toContain("PatientHandoffRecord");
    expect(headerSource).not.toContain("selected");
  });

  it("does not render internal patient or identifier IDs as visible content", () => {
    expect(headerSource).not.toContain(">{patient.patientId}<");
    expect(headerSource).not.toContain(">{identifier.id}<");
    expect(headerSource).toContain("key={identifier.id}");
  });

  it("uses the stable header only for v2 workspace records and preserves legacy compatibility", () => {
    expect(recordsSource).toContain("trendWorkspace ? (");
    expect(recordsSource).toContain("<PatientWorkspaceHeader");
    expect(recordsSource).toContain("<div className={styles.previewTitle}>");
    expect(recordsSource).toContain("selected.patientCodeDisplay");
  });

  it("introduces no new data fetch, storage, or patient portal authority", () => {
    expect(headerSource).not.toContain("fetch(");
    expect(headerSource).not.toContain("localStorage");
    expect(headerSource).not.toContain("runtimeFetch");
    expect(headerSource).not.toContain("patientIdentityFetch");
    expect(headerSource).not.toContain("patientPortalFetch");
  });
});
