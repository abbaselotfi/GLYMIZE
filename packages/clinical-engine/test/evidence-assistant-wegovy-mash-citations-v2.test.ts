import { describe, expect, it } from "vitest";
import { retrieveApprovedEvidence } from "../src/evidence-assistant.js";

describe("Evidence Assistant WEGOVY MASH citations", () => {
  it("retrieves current product-specific MASH initiation and maintenance dosing", () => {
    const result = retrieveApprovedEvidence("دوز و تیتراسیون Wegovy برای MASH F2 F3 چیست؟", "fa", 10);
    const hits = result.hits.filter((hit) => hit.ruleId.includes("WEGOVY-MASH"));

    expect(result.sufficientEvidence).toBe(true);
    expect(hits.some((hit) => hit.ruleId === "LABEL-WEGOVY-MASH-INITIATION-SCHEDULE")).toBe(true);
    expect(hits.some((hit) => hit.textEn.includes("0.25 mg") && hit.textEn.includes("2.4 mg"))).toBe(true);
    expect(hits.flatMap((hit) => hit.sourceIds)).toContain("US-LABEL-WEGOVY-2026-06");
    expect(hits.flatMap((hit) => hit.citations).some((citation) =>
      citation.sourceId === "US-LABEL-WEGOVY-2026-06" &&
      citation.locator?.includes("Dosage and Administration"),
    )).toBe(true);
  });

  it("retrieves the product-specific safety boundary without confusing it with generic semaglutide evidence", () => {
    const result = retrieveApprovedEvidence("Wegovy MASH contraindication MTC MEN2 gastroparesis چیست؟", "fa", 10);
    const safety = result.hits.find((hit) => hit.ruleId === "LABEL-WEGOVY-MASH-SAFETY-BOUNDARY");

    expect(safety).toBeDefined();
    expect(safety?.sourceIds).toContain("US-LABEL-WEGOVY-2026-06");
    expect(safety?.textEn).toContain("MTC/MEN2");
  });
});
