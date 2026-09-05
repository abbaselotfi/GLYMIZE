import { describe, expect, it } from "vitest";
import { retrieveApprovedEvidence } from "../src/evidence-assistant.js";

describe("Evidence Assistant cardiometabolic product citations", () => {
  it("retrieves the exact rosuvastatin CrCl label rule", () => {
    const result = retrieveApprovedEvidence("rosuvastatin dose CrCl severe renal impairment", "en", 10);
    const hit = result.hits.find((item) => item.ruleId.includes("ROSUVASTATIN"));

    expect(result.sufficientEvidence).toBe(true);
    expect(hit).toBeDefined();
    expect(hit?.sourceIds).toContain("US-LABEL-ROSUVASTATIN-2026");
    expect(hit?.citations.some((citation) => citation.locator?.includes("2.5"))).toBe(true);
  });

  it("retrieves finerenone eGFR/potassium initiation evidence from the exact label", () => {
    const result = retrieveApprovedEvidence("finerenone starting dose eGFR potassium albuminuria", "en", 10);
    const hit = result.hits.find((item) => item.ruleId.includes("FINERENONE"));

    expect(result.sufficientEvidence).toBe(true);
    expect(hit).toBeDefined();
    expect(hit?.sourceIds).toContain("US-LABEL-KERENDIA-2025");
    expect(hit?.citations.some((citation) => citation.sourceKind === "regulatory")).toBe(true);
  });
});
