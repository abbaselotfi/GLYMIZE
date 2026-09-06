import fs from "node:fs";
import { describe, expect, it } from "vitest";

const archiveClient = fs.readFileSync(
  new URL("../lib/patient-record-archive-client.ts", import.meta.url),
  "utf8",
);
const recordsSource = fs.readFileSync(
  new URL("../app/records/records-client.tsx", import.meta.url),
  "utf8",
);
const ordersPanel = fs.readFileSync(
  new URL("../app/records/patient-workspace-orders.tsx", import.meta.url),
  "utf8",
);

describe("Patient Workspace medication reconciliation boundary", () => {
  it("sources the visit medication list from the encounter snapshot", () => {
    expect(archiveClient).toContain("medications: snapshot.medications ?? []");
    expect(archiveClient).toContain("detail.latestSnapshot?.snapshot ?? {}");
    expect(recordsSource).toContain("selected.medications.map((medication, index)");
  });

  it("keeps signed Final Plan orders on their separate authoritative projection", () => {
    expect(recordsSource).toContain("orders={trendWorkspace.orders ?? []}");
    expect(ordersPanel).toContain(
      'data-workspace-order-authority="signed-final-plan"',
    );
    expect(ordersPanel).toContain("POST-VISIT SIGNED ORDERS");
    expect(ordersPanel).toContain("pre-visit medication reconciliation");
    expect(ordersPanel).toContain("not a signed prescription or order");
  });

  it("does not derive reconciliation from signed orders or add a second client-side authority", () => {
    expect(recordsSource).not.toContain("trendWorkspace.orders.map((medication");
    expect(ordersPanel).not.toContain("localStorage");
    expect(ordersPanel).not.toContain("runtimeFetch");
    expect(ordersPanel).not.toContain("patientIdentityFetch");
  });
});
