import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Patient Workspace What changed wiring", () => {
  const adapterSource = fs.readFileSync(
    new URL("../lib/patient-trend-workspace-client.ts", import.meta.url),
    "utf8",
  );
  const recordsSource = fs.readFileSync(
    new URL("../app/records/records-client.tsx", import.meta.url),
    "utf8",
  );
  const panelSource = fs.readFileSync(
    new URL("../app/records/patient-visit-changes.tsx", import.meta.url),
    "utf8",
  );

  it("compares only the newest two authoritative workspace encounters", () => {
    expect(adapterSource).toContain("right.encounterAt.localeCompare(left.encounterAt)");
    expect(adapterSource).toContain(".slice(0, 2)");
    expect(adapterSource).toContain("openPatientTrendSourceEncounter");
    expect(adapterSource).toContain("buildPatientVisitChangeSummary(current, previous)");
  });

  it("uses encounter dates from Patient Workspace instead of snapshot update timestamps", () => {
    expect(adapterSource).toContain("currentAt: currentEncounter.encounterAt");
    expect(adapterSource).toContain("previousAt: previousEncounter.encounterAt");
  });

  it("keeps the change panel supplementary and does not block authoritative record access", () => {
    expect(recordsSource).toContain("Change projection is supplementary");
    expect(recordsSource).toContain("setVisitChanges(null)");
    expect(recordsSource).toContain("PatientVisitChanges");
    expect(recordsSource).toContain("encounterCount={trendWorkspace.encounters.length}");
  });

  it("states that the UI does not infer significance or causality", () => {
    expect(panelSource).toContain("does not infer improvement, worsening, clinical significance, or causality");
    expect(panelSource).not.toContain("clinicalEngine");
    expect(panelSource).not.toContain("patientIdentityFetch");
    expect(panelSource).not.toContain("patientPortalFetch");
  });
});
