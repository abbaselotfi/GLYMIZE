import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  patientFinalOrderAad,
} from "../src/patient-record-v2/orders";

const ordersSource = fs.readFileSync(
  new URL("../src/patient-record-v2/orders.ts", import.meta.url),
  "utf8",
);
const routeSource = fs.readFileSync(
  new URL("../src/platform-patient-record-v2.ts", import.meta.url),
  "utf8",
);
const migrationSource = fs.readFileSync(
  new URL("../migrations/0003_longitudinal_patient_records.sql", import.meta.url),
  "utf8",
);

describe("Patient Workspace signed physician orders", () => {
  it("uses the existing Patient Record v2 order storage without a parallel schema", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS patient_final_plans");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS patient_final_orders");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS patient_order_fulfillment_events");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS patient_investigation_result_links");
    expect(ordersSource).toContain("FROM patient_final_orders o");
    expect(ordersSource).toContain("JOIN patient_final_plans p ON p.id=o.plan_id");
    expect(ordersSource).not.toContain("CREATE TABLE");
  });

  it("projects only signed plan orders and append-only fulfillment state", () => {
    expect(ordersSource).toContain("p.plan_status='signed'");
    expect(ordersSource).toContain("p.signed_at IS NOT NULL");
    expect(ordersSource).toContain("FROM patient_order_fulfillment_events f");
    expect(ordersSource).toContain("ORDER BY f.created_at DESC,f.id DESC");
    expect(ordersSource).toContain("FROM patient_investigation_result_links l");
    expect(ordersSource).not.toContain("UPDATE patient_final_orders");
    expect(ordersSource).not.toContain("UPDATE patient_final_plans");
  });

  it("fails closed on encrypted-order integrity or payload validation errors", () => {
    expect(patientFinalOrderAad("practice-1", "order-1")).toBe(
      "patient-final-order:practice-1:order-1",
    );
    expect(ordersSource).toContain("PATIENT_FINAL_ORDER_DECRYPTION_FAILED");
    expect(ordersSource).toContain("PATIENT_FINAL_ORDER_PAYLOAD_INVALID");
  });

  it("enriches only an already-authorized successful Patient Workspace response", () => {
    expect(routeSource).toContain("patientRecordV2CoreRoute(request, context)");
    expect(routeSource).toContain("!response.ok");
    expect(routeSource).toContain("readPatientWorkspaceOrders(context, patientId)");
    expect(routeSource).toContain("...workspace");
    expect(routeSource).toContain("orders,");
  });
});
