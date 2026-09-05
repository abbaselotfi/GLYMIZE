import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveCurrentMedicationAdministrationV2,
} from "../src/decision-graph-v2/current-medication-interval.js";

describe("current medication interval model", () => {
  it("preserves a weekly dose as an interval without inventing a daily dose", () => {
    const result = resolveCurrentMedicationAdministrationV2({
      genericName: "Semaglutide",
      doseAmount: 0.25,
      doseUnit: "mg",
      administrationsPerPeriod: 1,
      administrationPeriodDays: 7,
      // Conflicting legacy fields must not override explicit interval semantics.
      frequencyPerDay: 1,
      totalDailyDose: 99,
      totalDailyDoseUnit: "mg",
    }, "MD-SEMAGLUTIDE", "mg");

    expect(result.intervalIssue).toBeUndefined();
    expect(result.administrationInterval?.source).toBe("explicit_interval");
    expect(result.administrationInterval?.periodDays).toBe(7);
    expect(result.administrationInterval?.administrationsPerPeriod).toBe(1);
    expect(result.administrationInterval?.perAdministrationDose[0]).toMatchObject({ amount: 0.25, unit: "mg" });
    expect(result.administrationInterval?.scheduleText).toBe("once weekly");
    expect(result.dailyDose).toBeUndefined();
    expect(result.administrationsPerDay).toBeUndefined();
  });

  it("keeps legacy daily medication behavior backward-compatible", () => {
    const result = resolveCurrentMedicationAdministrationV2({
      genericName: "Metformin",
      doseAmount: 500,
      doseUnit: "mg",
      frequencyPerDay: 2,
    }, "MD-METFORMIN", "mg");

    expect(result.intervalIssue).toBeUndefined();
    expect(result.dailyDose?.[0]).toMatchObject({ amount: 1000, unit: "mg" });
    expect(result.administrationsPerDay).toBe(2);
    expect(result.administrationInterval).toMatchObject({
      administrationsPerPeriod: 2,
      periodDays: 1,
      source: "legacy_daily",
    });
    expect(result.administrationInterval?.perAdministrationDose[0]?.amount).toBe(500);
  });

  it("supports explicit one-day intervals while preserving real daily totals", () => {
    const result = resolveCurrentMedicationAdministrationV2({
      genericName: "Example",
      doseAmount: 10,
      doseUnit: "mg",
      administrationsPerPeriod: 3,
      administrationPeriodDays: 1,
    }, "MD-EXAMPLE", "mg");

    expect(result.dailyDose?.[0]?.amount).toBe(30);
    expect(result.administrationsPerDay).toBe(3);
    expect(result.administrationInterval?.source).toBe("explicit_interval");
  });

  it("fails closed when an explicit interval is partial or invalid", () => {
    const partial = resolveCurrentMedicationAdministrationV2({
      genericName: "Semaglutide",
      doseAmount: 0.5,
      doseUnit: "mg",
      administrationsPerPeriod: 1,
      frequencyPerDay: 1,
      totalDailyDose: 0.5,
    }, "MD-SEMAGLUTIDE", "mg");
    expect(partial.intervalIssue).toContain("administrationPeriodDays");
    expect(partial.dailyDose).toBeUndefined();
    expect(partial.administrationInterval).toBeUndefined();

    const invalid = resolveCurrentMedicationAdministrationV2({
      genericName: "Semaglutide",
      doseAmount: 0.5,
      doseUnit: "mg",
      administrationsPerPeriod: 1,
      administrationPeriodDays: 0,
    }, "MD-SEMAGLUTIDE", "mg");
    expect(invalid.intervalIssue).toBeDefined();
    expect(invalid.dailyDose).toBeUndefined();
  });

  it("keeps the Type2 adapter wired to the interval resolver and runtime extension", () => {
    const source = readFileSync(new URL("../src/type2-decision-graph-compat.ts", import.meta.url), "utf8");
    expect(source).toContain("resolveCurrentMedicationAdministrationV2");
    expect(source).toContain("administrationInterval: administration.administrationInterval");
    expect(source).toContain("intervalIssue: administration.intervalIssue");
    expect(source).toContain("brandName: current.brandName");
    expect(source).toContain("durationDays: current.durationDays");
  });
});
