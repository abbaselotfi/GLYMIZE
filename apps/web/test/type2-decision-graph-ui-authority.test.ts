import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "app/type-2/type2-scenarios-client.tsx"),
  "utf8",
);

describe("Type 2 Decision Graph UI authority", () => {
  it("never presents Decision Graph compatibility score as a clinical 0-100 score", () => {
    expect(source).toContain("graphMedication.decisionGraphAuthority");
    expect(source).toContain('`DG · #${graphMedication.decisionGraphRank ?? "—"}`');
    expect(source).toContain(': `${medication.priorityScore}/100`');
  });

  it("suppresses manual dose/package costing when Graph product cost is authoritative", () => {
    expect(source).toContain("const graphCostAuthoritative = Boolean(execution?.selectedProductCost);");
    expect(source).toContain("{!graphCostAuthoritative && <div className={styles.costInputs}");
    expect(source).toContain('data-decision-graph-cost-authority="dose-and-nfi-product"');
    expect(source).toContain('data-cost-fallback="manual"');
  });

  it("keeps review-only WorldDrug options outside the Decision Graph execution projection", () => {
    expect(source).toContain('medication.outputStatus === "requires_approved_protocol"');
    expect(source).toContain("? undefined");
    expect(source).toContain(": graphMedication.decisionGraphExecution");
  });

  it("labels projected action/dose as recommendation-only and not a signed order", () => {
    expect(source).toContain('data-decision-graph-execution="recommendation-only"');
    expect(source).toContain('data-decision-graph-order-boundary="recommendation-only"');
    expect(source).toContain("not a signed medication order or Final Plan");
    expect(source).toContain("requires clinician confirmation");
  });
});
