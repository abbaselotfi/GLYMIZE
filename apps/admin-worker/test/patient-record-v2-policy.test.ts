import { describe, expect, it } from "vitest";
import {
  normalizePatientCode,
  validateIranianNationalId,
} from "@glymize/contracts";
import {
  nextNumericFileNumber,
  normalizeEncounterTimestamp,
  observationIndexKey,
  parseNumericFileNumber,
  resolveSmartPatientIdentifierKind,
} from "../src/patient-record-v2-policy";

describe("Patient Record v2 policy", () => {
  it("uses the shared patient identifier normalization and national-ID checksum", () => {
    expect(normalizePatientCode(" ۰۰۸-۴۵۷-۵۹۴۸ ")).toBe("0084575948");
    expect(validateIranianNationalId("۰۰۸۴۵۷۵۹۴۸")).toBe(true);
    expect(validateIranianNationalId("1111111111")).toBe(false);
  });

  it("defaults smart lookup to national ID only for a checksum-valid code", () => {
    expect(resolveSmartPatientIdentifierKind("0084575948")).toBe(
      "national_id",
    );
    expect(resolveSmartPatientIdentifierKind("1234567890")).toBe(
      "file_number",
    );
    expect(
      resolveSmartPatientIdentifierKind("0084575948", "file_number"),
    ).toBe("file_number");
    expect(
      resolveSmartPatientIdentifierKind("0084575948", "bad-kind"),
    ).toBeNull();
  });

  it("parses numeric practice file numbers without JavaScript precision loss", () => {
    const parsed = parseNumericFileNumber("۰۰۱۲");
    expect(parsed).not.toBeNull();
    expect(parsed?.normalized).toBe("0012");
    expect(parsed?.number).toBe(12n);
    expect(parsed?.width).toBe(4);

    expect(parseNumericFileNumber("A12")).toBeNull();
    expect(parseNumericFileNumber("1234567890123456789")).toBeNull();
  });

  it("increments a monotonic file-number high-water mark while preserving display width", () => {
    expect(nextNumericFileNumber("0099", 4)).toBe("0100");
    expect(nextNumericFileNumber("9999", 4)).toBe("10000");
    expect(
      nextNumericFileNumber("999999999999999999", 18),
    ).toBeNull();
  });

  it("normalizes encounter timestamps deterministically", () => {
    expect(
      normalizeEncounterTimestamp(
        "2026-08-16T10:30:00+03:30",
        "2026-08-16T00:00:00.000Z",
      ),
    ).toBe("2026-08-16T07:00:00.000Z");
    expect(
      normalizeEncounterTimestamp(
        "",
        "2026-08-16T00:00:00.000Z",
      ),
    ).toBe("2026-08-16T00:00:00.000Z");
    expect(
      normalizeEncounterTimestamp(
        "not-a-date",
        "2026-08-16T00:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("indexes canonical observations and preserves a stable raw fallback key", () => {
    expect(observationIndexKey("hba1c", "HbA1c")).toBe("hba1c");
    expect(observationIndexKey("", "Vitamin D3 / 25-OH")).toBe(
      "raw:vitamin_d3_25_oh",
    );
    expect(observationIndexKey(undefined, "")).toBe("raw:unmapped");
  });
});
