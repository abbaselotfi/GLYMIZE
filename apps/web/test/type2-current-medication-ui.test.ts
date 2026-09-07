import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type2CurrentMedicationPayload } from "../app/type-2/type2-current-medication-ui";

describe("active Type 2 medication intake model", () => {
  it("projects a represented daily regimen without changing dose semantics", () => {
    expect(type2CurrentMedicationPayload([{
      id: "row-1",
      genericMedicationId: "metformin",
      genericName: " Metformin ",
      doseAmount: "500",
      doseUnit: "mg",
      frequencyPerDay: "2",
      status: "active",
    }])).toEqual([expect.objectContaining({
      genericMedicationId: "metformin",
      genericName: "Metformin",
      doseAmount: 500,
      doseUnit: "mg",
      frequencyPerDay: 2,
      totalDailyDose: 1000,
      totalDailyDoseUnit: "mg",
      status: "active",
    })]);
  });

  it("carries explicitly documented interval and stage facts without deriving them", () => {
    const [medication] = type2CurrentMedicationPayload([{
      id: "row-1",
      genericName: "Semaglutide",
      brandName: " Wegovy ",
      doseAmount: "0.5",
      doseUnit: "mg",
      frequencyPerDay: "",
      administrationsPerPeriod: "1",
      administrationPeriodDays: "7",
      daysOnCurrentDose: "28",
      therapyPhase: "escalation",
      nextAdministrationInDays: "3",
      durationDays: "70",
      status: "active",
    }]);

    expect(medication).toMatchObject({
      genericName: "Semaglutide",
      brandName: "Wegovy",
      doseAmount: 0.5,
      doseUnit: "mg",
      administrationsPerPeriod: 1,
      administrationPeriodDays: 7,
      daysOnCurrentDose: 28,
      therapyPhase: "escalation",
      nextAdministrationInDays: 3,
      durationDays: 70,
    });
    expect(medication?.frequencyPerDay).toBeUndefined();
    expect(medication?.totalDailyDose).toBeUndefined();
  });

  it("never infers weekly interval or treatment phase from Wegovy name or dose", () => {
    const [medication] = type2CurrentMedicationPayload([{
      id: "row-1",
      genericName: "Semaglutide",
      brandName: "Wegovy",
      doseAmount: "1.7",
      doseUnit: "mg",
      frequencyPerDay: "",
      status: "active",
    }]);

    expect(medication?.administrationsPerPeriod).toBeUndefined();
    expect(medication?.administrationPeriodDays).toBeUndefined();
    expect(medication?.daysOnCurrentDose).toBeUndefined();
    expect(medication?.therapyPhase).toBeUndefined();
    expect(medication?.nextAdministrationInDays).toBeUndefined();
  });

  it("preserves a partial explicit interval so the engine can fail closed", () => {
    const [medication] = type2CurrentMedicationPayload([{
      id: "row-1",
      genericName: "Semaglutide",
      doseAmount: "0.5",
      doseUnit: "mg",
      frequencyPerDay: "",
      administrationsPerPeriod: "1",
      administrationPeriodDays: "",
      status: "active",
    }]);

    expect(medication?.administrationsPerPeriod).toBe(1);
    expect(medication?.administrationPeriodDays).toBeUndefined();
    expect(medication?.frequencyPerDay).toBeUndefined();
    expect(medication?.totalDailyDose).toBeUndefined();
  });

  it("keeps incomplete daily dose data partial instead of inventing a daily total", () => {
    const [medication] = type2CurrentMedicationPayload([{
      id: "row-1",
      genericName: "Semaglutide",
      doseAmount: "1",
      doseUnit: "mg",
      frequencyPerDay: "",
      status: "active",
    }]);

    expect(medication?.doseAmount).toBe(1);
    expect(medication?.frequencyPerDay).toBeUndefined();
    expect(medication?.totalDailyDose).toBeUndefined();
  });

  it("drops empty medication rows and blank brand identity", () => {
    expect(type2CurrentMedicationPayload([{
      id: "row-empty",
      genericName: "  ",
      doseAmount: "500",
      doseUnit: "mg",
      frequencyPerDay: "2",
      status: "active",
    }])).toEqual([]);

    const [medication] = type2CurrentMedicationPayload([{
      id: "row-brand",
      genericName: "Metformin",
      brandName: "   ",
      doseAmount: "500",
      doseUnit: "mg",
      frequencyPerDay: "2",
      status: "active",
    }]);
    expect(medication?.brandName).toBeUndefined();
  });

  it("wires the scenario shell to the dedicated reconciliation row component", () => {
    const scenarioSource = readFileSync(new URL("../app/type-2/type2-scenarios-client.tsx", import.meta.url), "utf8");
    const rowSource = readFileSync(new URL("../app/type-2/type2-current-medication-row.tsx", import.meta.url), "utf8");
    expect(scenarioSource).toContain('import Type2CurrentMedicationRow from "./type2-current-medication-row"');
    expect(scenarioSource).toContain("<Type2CurrentMedicationRow");
    expect(scenarioSource).not.toContain("medications.map((item, index) => <div className={styles.currentMed}");
    expect(rowSource).toContain("administrationsPerPeriod");
    expect(rowSource).toContain("administrationPeriodDays");
    expect(rowSource).toContain("daysOnCurrentDose");
    expect(rowSource).toContain("therapyPhase");
    expect(rowSource).toContain("nextAdministrationInDays");
    expect(rowSource).toContain("brandName");
  });
});
