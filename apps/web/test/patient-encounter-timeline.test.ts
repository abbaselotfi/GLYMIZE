import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Patient Workspace encounter timeline", () => {
  const timelineSource = fs.readFileSync(
    new URL("../app/records/patient-encounter-timeline.tsx", import.meta.url),
    "utf8",
  );
  const recordsSource = fs.readFileSync(
    new URL("../app/records/records-client.tsx", import.meta.url),
    "utf8",
  );

  it("uses the authoritative Patient Workspace encounter list and orders visits newest first", () => {
    expect(recordsSource).toContain("encounters={trendWorkspace.encounters}");
    expect(timelineSource).toContain("right.encounterAt.localeCompare(left.encounterAt)");
    expect(timelineSource).not.toContain("patient_handoffs");
    expect(timelineSource).not.toContain("localStorage");
  });

  it("expands the newest encounter by default and keeps older visits collapsible", () => {
    expect(timelineSource).toContain("const newestId = ordered[0]?.encounterId ?? null");
    expect(timelineSource).toContain("useState<string | null>(newestId)");
    expect(timelineSource).toContain("setExpandedId(newestId)");
    expect(timelineSource).toContain("aria-expanded={expanded}");
  });

  it("shows lifecycle metadata without rendering internal record identifiers as content", () => {
    expect(timelineSource).toContain("statusLabel(encounter.status, fa)");
    expect(timelineSource).toContain("encounter.latestSnapshotRevision");
    expect(timelineSource).toContain("encounter.latestSignedPlanId");
    expect(timelineSource).not.toContain(">{encounter.encounterId}<");
    expect(timelineSource).not.toContain(">{encounter.latestSignedPlanId}<");
  });

  it("opens an exact practice-scoped source encounter through the existing v2 bridge", () => {
    expect(timelineSource).toContain("onOpenEncounter(encounterId)");
    expect(recordsSource).toContain("onOpenEncounter={openTrendSourceEncounter}");
    expect(recordsSource).toContain("openPatientTrendSourceEncounter");
  });

  it("does not create a second workspace preference or clinical authority", () => {
    expect(timelineSource).not.toContain("layoutPreset");
    expect(timelineSource).not.toContain("runtimeFetch");
    expect(timelineSource).not.toContain("patientIdentityFetch");
    expect(timelineSource).not.toContain("patientPortalFetch");
  });
});
