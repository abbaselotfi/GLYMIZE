import { describe, expect, it } from "vitest";
import { retrieveApprovedEvidence } from "../src/evidence-assistant.js";

describe("Phase 3 Task 5 — product and dose evidence retrieval", () => {
  it("returns the exact Toujeo product-dose label citation for a dose-specific question", () => {
    const result = retrieveApprovedEvidence(
      "دوز شروع Toujeo U-300 در دیابت نوع ۲ چیست؟",
      "fa",
    );

    const hit = result.hits.find((item) => item.ruleId.startsWith("LABEL-TOUJEO-T2-START:"));
    expect(result.sufficientEvidence).toBe(true);
    expect(hit).toBeDefined();
    expect(hit?.domain).toBe("product_dose");
    expect(hit?.engineEffect).toBe("approved_product_dose_rule");
    expect(hit?.citations).toContainEqual(expect.objectContaining({
      sourceId: "US-LABEL-TOUJEO-2026",
      sourceKind: "regulatory",
      locator: "Dosage and Administration 2.3",
    }));
  });

  it("indexes medication hard-gate evidence from the executable safety-rule builder", () => {
    const result = retrieveApprovedEvidence(
      "متفورمین در eGFR 25 چه منع یا محدودیت کلیوی دارد؟",
      "fa",
    );

    const hit = result.hits.find((item) => item.ruleId.startsWith("ADA2026-METFORMIN-EGFR30:"));
    expect(hit).toBeDefined();
    expect(hit?.domain).toBe("medication_safety");
    expect(hit?.engineEffect).toBe("hard_exclusion");
    expect(hit?.citations.some((citation) => citation.sourceId === "KDIGO-DMCKD-2022")).toBe(true);
  });
});
