import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("clinician longitudinal Patient Record v2 trends", () => {
  const panelSource = fs.readFileSync(
    new URL("../app/records/patient-trend-panel.tsx", import.meta.url),
    "utf8",
  );
  const recordsSource = fs.readFileSync(
    new URL("../app/records/records-client.tsx", import.meta.url),
    "utf8",
  );
  const adapterSource = fs.readFileSync(
    new URL("../lib/patient-trend-workspace-client.ts", import.meta.url),
    "utf8",
  );

  it("renders generic canonical series instead of a hard-coded diabetes analyte list", () => {
    expect(panelSource).toContain("trends.filter");
    expect(panelSource).toContain("series.displayName");
    expect(panelSource).toContain("series.canonicalKey");
    expect(panelSource).not.toContain('canonicalKey === "hba1c"');
    expect(panelSource).not.toContain('canonicalKey === "glucose"');
  });

  it("draws connected geometry only from confirmed measurements", () => {
    expect(panelSource).toContain('point.verification === "confirmed"');
    expect(panelSource).toContain("series.chartEligible");
    expect(panelSource).toContain("Unverified — not used in the trend line");
  });

  it("keeps exact source encounters reachable from expanded measurements", () => {
    expect(panelSource).toContain("point.observedAt");
    expect(panelSource).toContain("point.encounterId");
    expect(panelSource).toContain("Open source encounter");
    expect(adapterSource).toContain("openPatientRecordArchiveItem(archiveItem)");
    expect(adapterSource).toContain("encounterId: encounter.encounterId");
  });

  it("loads trends only through the official practice-scoped Patient Workspace", () => {
    expect(adapterSource).toContain('from "./patient-record-v2-client"');
    expect(adapterSource).toContain("getPatientWorkspace(item.patientId)");
    expect(adapterSource).toContain('item.source !== "patient_record_v2"');
    expect(adapterSource).not.toContain("patientIdentityFetch");
    expect(adapterSource).not.toContain("patientPortalFetch");
  });

  it("wires the longitudinal panel into the existing clinician records surface", () => {
    expect(recordsSource).toContain("PatientTrendPanel");
    expect(recordsSource).toContain("trendWorkspace.trends");
    expect(recordsSource).toContain("loadPatientTrendWorkspaceForArchiveItem");
    expect(recordsSource).toContain("loadPatientTrendWorkspaceForRecord");
    expect(recordsSource).toContain("openPatientTrendSourceEncounter");
  });
});
