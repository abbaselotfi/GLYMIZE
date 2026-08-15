import { describe, expect, it } from "vitest";
import { normalizeOcrDigits, parseClinicalLabText } from "../src/lab-text-parser.js";

describe("pre-visit OCR lab parser", () => {
  it("normalizes Persian and Arabic digits", () => {
    expect(normalizeOcrDigits("۱۲۳٤٥٦")).toBe("123456");
  });

  it("extracts HbA1c and leaves it unverified", () => {
    const [lab] = parseClinicalLabText("HbA1c 7.8 %   4.0-6.0", "lab.jpg", 88);
    expect(lab).toMatchObject({ canonicalKey: "hba1c", value: 7.8, unit: "%", verification: "unverified", ocrConfidence: 88 });
  });

  it("extracts Persian-digit HbA1c", () => {
    const [lab] = parseClinicalLabText("HbA1c ۷٫۲ %");
    expect(lab?.value).toBe(7.2);
  });

  it("extracts eGFR and UACR", () => {
    const labs = parseClinicalLabText("eGFR 29 mL/min/1.73m2\nUACR 315 mg/g");
    expect(labs.find((x) => x.canonicalKey === "egfr")?.value).toBe(29);
    expect(labs.find((x) => x.canonicalKey === "uacr")?.value).toBe(315);
  });

  it("extracts common Persian FBS label", () => {
    const labs = parseClinicalLabText("قند ناشتا ۱۴۸ mg/dL");
    expect(labs.find((x) => x.canonicalKey === "fbs")?.value).toBe(148);
  });

  it("preserves a document date when recognizable", () => {
    const [lab] = parseClinicalLabText("Date 2026/08/09\nCreatinine 1.2 mg/dL");
    expect(lab?.observedAt).toBe("2026/08/09");
  });

  it("does not invent a lab when no numeric value follows the test name", () => {
    expect(parseClinicalLabText("HbA1c pending\neGFR not reported")).toHaveLength(0);
  });

  it("preserves distinct repeated same-analyte observations for review", () => {
  const labs = parseClinicalLabText("HbA1c 7.2 %\nHbA1c 7.3 %");
  expect(labs.filter((x) => x.canonicalKey === "hba1c")).toHaveLength(2);
});
  it("09 keeps the PDF page marker for traceability", () => {
    const labs = parseClinicalLabText("--- page 1 ---\nnoise\n--- page 2 ---\nHbA1c 7.4 %", "lab.pdf");
    expect(labs.find((item) => item.canonicalKey === "hba1c")?.sourcePage).toBe(2);
  });

  it("extracts multiple analytes from one OCR-flattened line", () => {
    const labs = parseClinicalLabText(
      "HbA1c 8.0 % 5.7-6.4 FBG 158 mg/dL 70-99 Creatinine 1.0 mg/dL 0.5-1.1 eGFR 68 mL/min/1.73m2 >=90 UACR 55 mg/g <30 Total Cholesterol 205 mg/dL <200 Triglycerides 175 mg/dL <150 LDL-C 108 mg/dL <100 ALT 26 U/L <33",
      "flattened-lab.pdf",
      76,
    );

    expect(labs.find((x) => x.canonicalKey === "hba1c")).toMatchObject({
      value: 8,
      unit: "%",
    });
    expect(labs.find((x) => x.canonicalKey === "fbs")).toMatchObject({
      value: 158,
      unit: "mg/dL",
    });
    expect(labs.find((x) => x.canonicalKey === "creatinine")).toMatchObject({
      value: 1,
      unit: "mg/dL",
    });
    expect(labs.find((x) => x.canonicalKey === "egfr")).toMatchObject({
      value: 68,
      referenceRange: ">=90",
      referenceLow: 90,
    });
    expect(labs.find((x) => x.canonicalKey === "uacr")).toMatchObject({
      value: 55,
      unit: "mg/g",
      referenceRange: "<30",
      referenceHigh: 30,
    });
    expect(labs.find((x) => x.canonicalKey === "total_cholesterol")?.value).toBe(205);
    expect(labs.find((x) => x.canonicalKey === "tg")?.value).toBe(175);
    expect(labs.find((x) => x.canonicalKey === "ldl")?.value).toBe(108);
    expect(labs.find((x) => x.canonicalKey === "alt")).toMatchObject({
      value: 26,
      unit: "U/L",
      referenceRange: "<33",
      referenceHigh: 33,
    });
  });

  it("keeps units scoped to each analyte window on a flattened line", () => {
    const labs = parseClinicalLabText(
      "HbA1c 8.0 % 5.7-6.4 Creatinine 1.0 mg/dL 0.5-1.1",
    );

    expect(labs.find((x) => x.canonicalKey === "hba1c")?.unit).toBe("%");
    expect(labs.find((x) => x.canonicalKey === "creatinine")?.unit).toBe("mg/dL");
  });

  it("preserves distinct repeated analytes flattened onto one line", () => {
    const labs = parseClinicalLabText(
      "HbA1c 7.2 % HbA1c 7.3 %",
    );
    const a1c = labs.filter((x) => x.canonicalKey === "hba1c");

    expect(a1c).toHaveLength(2);
    expect(a1c.map((x) => x.value)).toEqual([7.2, 7.3]);
    expect(new Set(a1c.map((x) => x.id)).size).toBe(2);
  });

});
