import { describe, expect, it } from "vitest";
import {
  allowedInsulinTargets,
  calculateInsulinConversion,
  getInsulinTherapy,
  premixComposition,
  selectSoliquaStartingPen,
  splitDoseArithmetic,
} from "../src/insulin-conversion.js";

describe("GLYMIZE insulin conversion regression suite", () => {
  it("01 exposes Soliqua for a basal source", () => {
    expect(allowedInsulinTargets("glargine-u100").some((x) => x.id === "soliqua")).toBe(true);
  });

  it("02 exposes Soliqua for a premix source", () => {
    expect(allowedInsulinTargets("aspart-mix-30").some((x) => x.id === "soliqua")).toBe(true);
  });

  it("03 never exposes prandial target for basal source", () => {
    expect(allowedInsulinTargets("glargine-u100").some((x) => x.category === "prandial")).toBe(false);
  });

  it("04 keeps prandial source inside prandial category", () => {
    expect(allowedInsulinTargets("aspart-u100").every((x) => x.category === "prandial")).toBe(true);
  });

  it("05 converts uncomplicated basal analog switch unit for unit", () => {
    const r = calculateInsulinConversion({ sourceId: "glargine-u100", targetId: "degludec-u100", totalDailyDose: 24 });
    expect(r.estimatedTotalDailyDose).toBe(24);
    expect(r.factor).toBe(1);
  });

  it("06 supports conservative 20 percent reduction for high hypoglycemia risk", () => {
    const r = calculateInsulinConversion({ sourceId: "glargine-u100", targetId: "degludec-u100", totalDailyDose: 40, highHypoglycemiaRisk: true });
    expect(r.factor).toBe(0.8);
    expect(r.estimatedTotalDailyDose).toBe(32);
  });

  it("07 reduces U300 to U100 to 80 percent", () => {
    const r = calculateInsulinConversion({ sourceId: "glargine-u300", targetId: "glargine-u100", totalDailyDose: 50 });
    expect(r.factor).toBe(0.8);
    expect(r.estimatedTotalDailyDose).toBe(40);
  });

  it("08 starts U300 at 80 percent after BID NPH", () => {
    const r = calculateInsulinConversion({ sourceId: "nph-u100", targetId: "glargine-u300", totalDailyDose: 50, sourceFrequency: 2 });
    expect(r.factor).toBe(0.8);
    expect(r.estimatedTotalDailyDose).toBe(40);
  });

  it("09 accepts a reported TID basal regimen but requires specialist review", () => {
    const r = calculateInsulinConversion({ sourceId: "nph-u100", targetId: "degludec-u100", totalDailyDose: 60, sourceFrequency: 3 });
    expect(r.factor).toBe(0.8);
    expect(r.estimatedTotalDailyDose).toBe(48);
    expect(r.specialistReview).toBe(true);
  });

  it("10 calculates NovoMix basal/prandial fractions correctly", () => {
    expect(premixComposition(getInsulinTherapy("aspart-mix-30")!, 60)).toEqual({ basalPercent: 70, prandialPercent: 30, basalDose: 42, prandialDose: 18 });
  });

  it("11 fixes legacy premix bug by using dose times basal fraction", () => {
    const r = calculateInsulinConversion({ sourceId: "aspart-mix-30", targetId: "glargine-u100", totalDailyDose: 60, sourceFrequency: 2 });
    expect(r.sourceComposition?.basalDose).toBe(42);
    expect(r.estimatedTotalDailyDose).toBe(42);
    expect(r.requiresPrandialPlan).toBe(true);
    expect(r.specialistReview).toBe(true);
  });

  it("12 calculates Humalog Mix 25 basal fraction", () => {
    const r = calculateInsulinConversion({ sourceId: "lispro-mix-25", targetId: "glargine-u100", totalDailyDose: 40, sourceFrequency: 2 });
    expect(r.estimatedTotalDailyDose).toBe(30);
  });

  it("13 calculates Humalog Mix 50 basal fraction", () => {
    const r = calculateInsulinConversion({ sourceId: "lispro-mix-50", targetId: "glargine-u100", totalDailyDose: 40, sourceFrequency: 2 });
    expect(r.estimatedTotalDailyDose).toBe(20);
  });

  it("14 selects Suliqua 100/50 at adjusted basal 19", () => {
    expect(selectSoliquaStartingPen(19)).toMatchObject({ pen: "100/50", startingDose: 10 });
  });

  it("15 selects Suliqua 100/50 at adjusted basal 20 to 29", () => {
    expect(selectSoliquaStartingPen(20)).toMatchObject({ pen: "100/50", startingDose: 20 });
    expect(selectSoliquaStartingPen(29)).toMatchObject({ pen: "100/50", startingDose: 20 });
  });

  it("16 selects Suliqua 100/33 at adjusted basal 30 to 60", () => {
    expect(selectSoliquaStartingPen(30)).toMatchObject({ pen: "100/33", startingDose: 30 });
    expect(selectSoliquaStartingPen(60)).toMatchObject({ pen: "100/33", startingDose: 30 });
  });

  it("17 blocks Suliqua beyond supported adjusted basal range", () => {
    expect(() => selectSoliquaStartingPen(61)).toThrow("SOLIQUA_RANGE");
  });

  it("18 converts premix to Suliqua only from basal fraction and flags prandial plan", () => {
    const r = calculateInsulinConversion({ sourceId: "aspart-mix-30", targetId: "soliqua", totalDailyDose: 40, sourceFrequency: 2 });
    expect(r.adjustedBasalDose).toBe(28);
    expect(r.estimatedTotalDailyDose).toBe(20);
    expect(r.soliqua?.pen).toBe("100/50");
    expect(r.requiresPrandialPlan).toBe(true);
    expect(r.specialistReview).toBe(true);
  });

  it("19 keeps rapid analog interchange one-to-one", () => {
    const r = calculateInsulinConversion({ sourceId: "aspart-u100", targetId: "lispro-u100", totalDailyDose: 30, sourceFrequency: 3, conservativeReduction: true });
    expect(r.factor).toBe(1);
    expect(r.estimatedTotalDailyDose).toBe(30);
  });

  it("20 reduces rapid analog to Regular by 20 percent", () => {
    const r = calculateInsulinConversion({ sourceId: "aspart-u100", targetId: "regular-u100", totalDailyDose: 30, sourceFrequency: 3 });
    expect(r.factor).toBe(0.8);
    expect(r.estimatedTotalDailyDose).toBe(24);
  });

  it("21 refuses unsafe cross-category prandial switching", () => {
    expect(() => calculateInsulinConversion({ sourceId: "aspart-u100", targetId: "glargine-u100", totalDailyDose: 30, sourceFrequency: 3 })).toThrow("INSUFFICIENT_REGIMEN");
  });

  it("22 keeps arithmetic split sum equal to TDD", () => {
    const split = splitDoseArithmetic(41, 3);
    expect(split.map((x) => x.dose)).toEqual([14, 14, 13]);
    expect(split.reduce((sum, x) => sum + x.dose, 0)).toBe(41);
  });

  it("23 warns that premix target split is arithmetic, not autonomous prescribing", () => {
    const r = calculateInsulinConversion({ sourceId: "glargine-u100", targetId: "aspart-mix-30", totalDailyDose: 40, targetFrequency: 2 });
    expect(r.arithmeticSchedule?.reduce((sum, x) => sum + x.dose, 0)).toBe(40);
    expect(r.warnings.join(" ")).toMatch(/arithmetically/);
  });

  it("24 rejects invalid dose and same product", () => {
    expect(() => calculateInsulinConversion({ sourceId: "nph-u100", targetId: "glargine-u100", totalDailyDose: 0 })).toThrow("INVALID_DOSE");
    expect(() => calculateInsulinConversion({ sourceId: "nph-u100", targetId: "nph-u100", totalDailyDose: 20 })).toThrow("SAME_INSULIN");
  });

  it("25 hides FRC from type 1 target list", () => {
    expect(allowedInsulinTargets("glargine-u100", { diabetesType: "type_1" }).some((x) => x.id === "soliqua")).toBe(false);
  });

  it("26 blocks numeric FRC conversion in type 1 diabetes", () => {
    expect(() => calculateInsulinConversion({ sourceId: "glargine-u100", targetId: "soliqua", totalDailyDose: 30, diabetesType: "type_1" })).toThrow("FRC_TYPE2_ONLY");
  });

  it("27 stops automatic Suliqua conversion in severe renal impairment or ESRD", () => {
    expect(() => calculateInsulinConversion({ sourceId: "glargine-u100", targetId: "soliqua", totalDailyDose: 30, diabetesType: "type_2", severeRenalImpairmentOrEsrd: true })).toThrow("SOLIQUA_SEVERE_RENAL_NOT_RECOMMENDED");
  });

  it("28 stops automatic Suliqua conversion in severe gastroparesis", () => {
    expect(() => calculateInsulinConversion({ sourceId: "glargine-u100", targetId: "soliqua", totalDailyDose: 30, diabetesType: "type_2", severeGastroparesis: true })).toThrow("SOLIQUA_SEVERE_GI_NOT_RECOMMENDED");
  });

  it("29 flags non-label-specific BID basal consolidation for clinical review", () => {
    const r = calculateInsulinConversion({ sourceId: "glargine-u100", targetId: "degludec-u100", totalDailyDose: 40, sourceFrequency: 2 });
    expect(r.factor).toBe(0.8);
    expect(r.specialistReview).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/conservative switching guardrail/);
  });

});
