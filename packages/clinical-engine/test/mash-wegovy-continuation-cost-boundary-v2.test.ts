import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WEGOVY continuation financial boundary", () => {
  it("never reuses a single-strength 30-day cost while interval authority is delegated to the continuation calculator", () => {
    const enrichSource = readFileSync(
      new URL("../src/decision-graph-v2/enrich.ts", import.meta.url),
      "utf8",
    );
    const continuationSource = readFileSync(
      new URL("../src/decision-graph-v2/wegovy-continuation-cost.ts", import.meta.url),
      "utf8",
    );

    expect(enrichSource).toContain("isWegovyMashRule && hasActiveCurrentMedication");
    expect(enrichSource).toContain("component.selectedProductCost = undefined");
    expect(enrichSource).toContain("buildWegovyMashContinuationWindowCostV2");
    expect(enrichSource).toContain("cost تک-strength جایگزین آن نشده است");

    expect(continuationSource).toContain("currentMedicationAdministrationIntervalV2");
    expect(continuationSource).toContain("interval.daysOnCurrentDose");
    expect(continuationSource).toContain("selectedPlanMatchesClinicalContinuation");
  });
});
