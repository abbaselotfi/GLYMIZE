import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("final plan and investigation roadmap contracts", () => {
  const roadmap = fs.readFileSync(
    new URL(
      "../../../docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md",
      import.meta.url,
    ),
    "utf8",
  );
  const migration = fs.readFileSync(
    new URL(
      "../migrations/0003_longitudinal_patient_records.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const orders = fs.readFileSync(
    new URL(
      "../../../packages/contracts/src/physician-orders.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const rulePack = fs.readFileSync(
    new URL(
      "../../../packages/clinical-engine/src/rule-pack.ts",
      import.meta.url,
    ),
    "utf8",
  );

  it("defines Final Plan as medication plus investigation orders", () => {
    expect(roadmap).toContain(
      "Physician final plan, medication/investigation orders and care-team execution",
    );
    expect(orders).toContain("PhysicianMedicationOrder");
    expect(orders).toContain("PhysicianInvestigationOrder");
    expect(orders).toContain("medicationOrders:");
    expect(orders).toContain("investigationOrders:");
  });

  it("preserves medication and investigation payer registration codes", () => {
    expect(orders).toContain("genericCode?: string");
    expect(orders).toContain("brandCode?: string");
    expect(orders).toContain("genericRegistryCode?: string");
    expect(orders).toContain("brandRegistryCode?: string");
    expect(orders).toContain("ircCode?: string");
    expect(orders).toContain("serviceCode?: string");
  });

  it("keeps Care Team fulfillment separate from immutable physician orders", () => {
    expect(migration).toContain("patient_final_plans");
    expect(migration).toContain("patient_final_orders");
    expect(migration).toContain(
      "patient_order_fulfillment_events",
    );
    expect(migration).toContain(
      "patient_investigation_result_links",
    );
  });

  it("permits engine investigation suggestions only through explicit rule actions", () => {
    expect(rulePack).toContain(
      "ClinicalInvestigationRuleAction",
    );
    expect(rulePack).toContain("missingDataActions?");
    expect(roadmap).toContain("REQUEST_INVESTIGATION");
  });
});
