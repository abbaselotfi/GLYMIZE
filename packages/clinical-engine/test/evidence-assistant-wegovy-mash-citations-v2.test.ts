import { describe, expect, it } from "vitest";
import { retrieveApprovedEvidence } from "../src/evidence-assistant.js";

describe("Evidence Assistant WEGOVY MASH citations", () => {
  it("retrieves the executable product-bound MASH initiation rule", () => {
    const result = retrieveApprovedEvidence("دوز شروع و تیتراسیون Wegovy برای MASH F2 F3 چیست؟", "fa", 12);
    const initiation = result.hits.find((hit) => hit.ruleId.startsWith("LABEL-WEGOVY-MASH-INIT-0_25:"));

    expect(result.sufficientEvidence).toBe(true);
    expect(initiation).toBeDefined();
    expect(initiation?.textEn).toContain("0.25 mg");
    expect(initiation?.sourceIds).toContain("US-LABEL-WEGOVY-2026-06");
    expect(initiation?.citations.some((citation) =>
      citation.sourceId === "US-LABEL-WEGOVY-2026-06" &&
      citation.locator?.includes("Dosage and Administration"),
    )).toBe(true);
  });

  it("retrieves the executable 2.4 mg maintenance rule and the safety boundary", () => {
    const maintenanceResult = retrieveApprovedEvidence("دوز نگهدارنده Wegovy برای MASH 2.4 mg هفته‌ای چیست؟", "fa", 12);
    const maintenance = maintenanceResult.hits.find((hit) => hit.ruleId.startsWith("LABEL-WEGOVY-MASH-MAINT-2_4:"));
    expect(maintenance).toBeDefined();
    expect(maintenance?.textEn).toContain("2.4 mg");
    expect(maintenance?.sourceIds).toContain("US-LABEL-WEGOVY-2026-06");

    const safetyResult = retrieveApprovedEvidence("Wegovy MASH contraindication MTC MEN2 gastroparesis چیست؟", "fa", 10);
    const safety = safetyResult.hits.find((hit) => hit.ruleId === "LABEL-WEGOVY-MASH-SAFETY-BOUNDARY");
    expect(safety).toBeDefined();
    expect(safety?.sourceIds).toContain("US-LABEL-WEGOVY-2026-06");
    expect(safety?.textEn).toContain("MTC/MEN2");
  });
});
