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

});
