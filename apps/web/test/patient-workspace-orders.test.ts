import fs from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = fs.readFileSync(
  new URL("../app/records/patient-workspace-orders.tsx", import.meta.url),
  "utf8",
);
const recordsSource = fs.readFileSync(
  new URL("../app/records/records-client.tsx", import.meta.url),
  "utf8",
);

describe("Patient Workspace signed orders UI", () => {
  it("renders only the authoritative Workspace order projection", () => {
    expect(recordsSource).toContain("orders={trendWorkspace.orders ?? []}");
    expect(recordsSource).toContain("<PatientWorkspaceOrders");
    expect(panelSource).toContain("PatientWorkspaceOrderSummary[]");
    expect(panelSource).not.toContain("localStorage");
    expect(panelSource).not.toContain("patientIdentityFetch");
    expect(panelSource).not.toContain("runtimeFetch");
  });

  it("keeps physician-authored medication and investigation details distinct", () => {
    expect(panelSource).toContain('"genericName" in item.order');
    expect(panelSource).toContain('item.orderKind === "medication"');
    expect(panelSource).toContain("item.order.displayName");
    expect(panelSource).toContain("item.order.fastingRequired === true");
  });

  it("shows factual fulfillment state without exposing internal identifiers", () => {
    expect(panelSource).toContain("stateLabels[item.state]");
    expect(panelSource).toContain("item.hasLinkedResult");
    expect(panelSource).not.toContain(">{item.orderId}<");
    expect(panelSource).not.toContain(">{item.planId}<");
    expect(panelSource).not.toContain(">{item.encounterId}<");
  });

  it("opens the exact source encounter through the existing v2 bridge", () => {
    expect(panelSource).toContain("onOpenEncounter(item.encounterId)");
    expect(recordsSource).toContain("onOpenEncounter={openTrendSourceEncounter}");
  });
});
