import { describe, expect, it } from "vitest";
import {
  LAB_MASTER_REGISTRY,
  LAB_MASTER_REGISTRY_VERSION,
  normalizeLabUnit,
  resolveLabMasterEntry,
} from "../src/lab-master-registry.js";
import {
  parseClinicalLabText,
} from "../src/lab-text-parser.js";

describe("Lab Master Registry", () => {
  it("contains a broad canonical registry with unique stable keys", () => {
    expect(LAB_MASTER_REGISTRY_VERSION).toBe("2026-08-15");
    expect(LAB_MASTER_REGISTRY.length).toBeGreaterThanOrEqual(130);

    const keys = LAB_MASTER_REGISTRY.map(
      (item) => item.canonicalKey,
    );
    expect(new Set(keys).size).toBe(keys.length);

    for (const required of [
      "hba1c",
      "fbs",
      "glucose",
      "creatinine",
      "egfr",
      "uacr",
      "alt",
      "ast",
      "ldl",
      "tg",
      "hemoglobin",
      "platelet",
      "tsh",
      "vitamin_b12",
    ]) {
      expect(keys).toContain(required);
    }
  });

  it("resolves English and Persian aliases to the same canonical test", () => {
    expect(
      resolveLabMasterEntry("Hb A1c")?.canonicalKey,
    ).toBe("hba1c");
    expect(
      resolveLabMasterEntry("قند ناشتا")?.canonicalKey,
    ).toBe("fbs");
    expect(
      resolveLabMasterEntry("کراتینین")?.canonicalKey,
    ).toBe("creatinine");
  });

  it("normalizes common laboratory unit spellings", () => {
    expect(normalizeLabUnit(" mg / dL ")).toBe("mg/dL");
    expect(normalizeLabUnit("µmol/L")).toBe("umol/L");
    expect(normalizeLabUnit("10^3/uL")).toBe("10*3/uL");
  });

  it("captures reported H and L flags from OCR without deriving them", () => {
    const labs = parseClinicalLabText(
      "TSH 6.8 H uIU/mL 0.4-4.2\nCreatinine 0.5 L mg/dL 0.6-1.2",
      "lab.pdf",
      91,
    );

    expect(
      labs.find((item) => item.canonicalKey === "tsh"),
    ).toMatchObject({
      rawName: "TSH",
      interpretation: "H",
      interpretationSource: "ocr",
      verification: "unverified",
    });

    expect(
      labs.find((item) => item.canonicalKey === "creatinine"),
    ).toMatchObject({
      rawName: "Creatinine",
      interpretation: "L",
      interpretationSource: "ocr",
    });
  });

  it("supports critical HH/LL flags and qualitative observations", () => {
    const labs = parseClinicalLabText(
      "Potassium 6.8 HH mmol/L\nHBsAg Reactive",
    );

    expect(
      labs.find((item) => item.canonicalKey === "potassium")
        ?.interpretation,
    ).toBe("HH");

    expect(
      labs.find((item) => item.canonicalKey === "hbsag")
        ?.valueText?.toLowerCase(),
    ).toBe("reactive");
  });

  it("preserves source label separately from canonical identity and reference bounds", () => {
    const [lab] = parseClinicalLabText(
      "Hb A1c 7.4 H % 4.0-6.0",
      "report.jpg",
      93,
      "ocr",
    );

    expect(lab).toMatchObject({
      canonicalKey: "hba1c",
      canonicalName: "HbA1c",
      rawName: "Hb A1c",
      value: 7.4,
      unit: "%",
      referenceLow: 4,
      referenceHigh: 6,
      sourceKind: "ocr",
      interpretation: "H",
    });
  });

  it("preserves distinct repeated observations and removes exact duplicates", () => {
    const labs = parseClinicalLabText(
      "Glucose 110 mg/dL\nGlucose 165 mg/dL\nGlucose 165 mg/dL",
      "report.pdf",
      undefined,
      "pdf_text",
    );

    expect(
      labs.filter((item) => item.canonicalKey === "glucose"),
    ).toHaveLength(2);
  });


});
