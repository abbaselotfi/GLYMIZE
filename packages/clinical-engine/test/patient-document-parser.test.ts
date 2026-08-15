import { describe, expect, it } from "vitest";
import { parsePatientDocumentFields } from "../src/patient-document-parser";

describe("patient document OCR field parser", () => {
  it("extracts explicit Persian identity and basic measurements from a flattened lab header", () => {
    const fields = parsePatientDocumentFields(
      "نام: علی نام خانوادگی: رضایی کد ملی: 1234567806 سن: 62 سال وزن: 84 kg قد: 174 cm HbA1c 8.1 %",
      1,
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "first_name", value: "علی", sourcePage: 1 }),
        expect.objectContaining({ field: "last_name", value: "رضایی", sourcePage: 1 }),
        expect.objectContaining({ field: "national_id", value: "1234567806" }),
        expect.objectContaining({ field: "reported_age_years", value: 62 }),
        expect.objectContaining({ field: "weight_kg", value: 84 }),
        expect.objectContaining({ field: "height_cm", value: 174 }),
      ]),
    );
  });

  it("extracts common English patient header labels", () => {
    const fields = parsePatientDocumentFields(
      "First Name: Sara Last Name: Ahmadi National ID: 1234567806 Age: 48 years Weight: 71 kg Height: 165 cm",
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "first_name", value: "Sara" }),
        expect.objectContaining({ field: "last_name", value: "Ahmadi" }),
        expect.objectContaining({ field: "reported_age_years", value: 48 }),
        expect.objectContaining({ field: "weight_kg", value: 71 }),
        expect.objectContaining({ field: "height_cm", value: 165 }),
      ]),
    );
  });

  it("does not suggest an invalid Iranian national ID", () => {
    const fields = parsePatientDocumentFields(
      "کد ملی: 1234567890 سن: 50 سال",
    );

    expect(fields.some((item) => item.field === "national_id")).toBe(false);
    expect(fields.some((item) => item.field === "reported_age_years")).toBe(true);
  });

  it("keeps generic patient name as a lower-confidence review suggestion", () => {
    const fields = parsePatientDocumentFields(
      "Patient Name: Sara Ahmadi Age: 48",
    );

    expect(fields).toContainEqual(
      expect.objectContaining({
        field: "full_name",
        value: "Sara Ahmadi",
      }),
    );
  });
  it("keeps Persian full name before age as a review suggestion", () => {
    const fields = parsePatientDocumentFields(
      "نام بیمار: سارا احمدی سن: 48 سال",
      2,
    );

    expect(fields).toContainEqual(
      expect.objectContaining({
        field: "full_name",
        value: "سارا احمدی",
        sourcePage: 2,
      }),
    );
  });

});
