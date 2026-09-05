import { describe, expect, it } from "vitest";
import { retrieveApprovedEvidence } from "../src/evidence-assistant.js";

describe("Evidence Assistant MASH executable citations", () => {
  it("retrieves the current REZDIFFRA label from the same executable dose registry", () => {
    const result = retrieveApprovedEvidence("دوز resmetirom برای MASH F2 F3 بر اساس وزن چیست؟", "fa", 10);
    const hits = result.hits.filter((hit) => hit.ruleId.includes("RESMETIROM"));

    expect(result.sufficientEvidence).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((hit) => hit.textEn.includes("80 mg"))).toBe(true);
    expect(hits.some((hit) => hit.textEn.includes("100 mg"))).toBe(true);
    expect(hits.flatMap((hit) => hit.sourceIds)).toContain("US-LABEL-REZDIFFRA-2026-07");
    expect(hits.flatMap((hit) => hit.citations).some((citation) =>
      citation.sourceId === "US-LABEL-REZDIFFRA-2026-07" &&
      citation.locator?.includes("Dosage and Administration"),
    )).toBe(true);
  });
});
