import { describe, expect, it } from "vitest";
import { evidenceForQuestion } from "../../../apps/admin-worker/src/runtime-evidence.js";

describe("online runtime evidence for WEGOVY MASH", () => {
  it("routes WEGOVY/MASH questions to the existing liver Rule Pack entry with current label provenance", () => {
    const hits = evidenceForQuestion("دوز Wegovy semaglutide برای MASH F2 F3 چیست؟");
    const liver = hits.find((hit) => hit.ruleId === "T2-LIVER-001");

    expect(liver).toBeDefined();
    expect(liver?.citations.some((citation) => citation.sourceId === "US-LABEL-WEGOVY-2026-06")).toBe(true);
    expect(liver?.citations.some((citation) => citation.sourceId === "aasld-semaglutide-mash-2025")).toBe(true);
  });
});
