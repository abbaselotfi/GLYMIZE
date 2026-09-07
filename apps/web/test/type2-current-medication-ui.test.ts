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

  it("keeps incomplete dose data partial instead of inventing a daily total", () => {
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

  it("drops empty medication rows", () => {
    expect(type2CurrentMedicationPayload([{
      id: "row-1",
      genericName: "  ",
      doseAmount: "500",
      doseUnit: "mg",
      frequencyPerDay: "2",
      status: "active",
    }])).toEqual([]);
  });
});
