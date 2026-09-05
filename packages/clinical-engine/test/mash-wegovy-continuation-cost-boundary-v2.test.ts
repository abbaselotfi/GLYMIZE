import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WEGOVY continuation financial boundary", () => {
  it("never reuses a single-strength 30-day cost while a current WEGOVY stage is active", () => {
    const source = readFileSync(new URL("../src/decision-graph-v2/enrich.ts", import.meta.url), "utf8");
    expect(source).toContain("isWegovyMashRule && hasActiveCurrentMedication");
    expect(source).toContain("component.selectedProductCost = undefined");
    expect(source).toContain("daysOnCurrentDose");
    expect(source).toContain("cost تک-strength جایگزین آن نشده است");
  });
});
