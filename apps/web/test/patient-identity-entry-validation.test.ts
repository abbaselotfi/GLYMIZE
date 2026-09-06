import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toAsciiDigits, validateIranianNationalId } from "@glymize/contracts";

const portal = readFileSync(
  fileURLToPath(new URL("../app/portal/patient-identity-portal.tsx", import.meta.url)),
  "utf8",
);
const client = readFileSync(
  fileURLToPath(new URL("../lib/patient-identity-client.ts", import.meta.url)),
  "utf8",
);

describe("patient identity entry validation", () => {
  it("normalizes Persian and Arabic digits before national-ID validation", () => {
    expect(toAsciiDigits("۱۲۳۴۵۶۷۸۹۱")).toBe("1234567891");
    expect(toAsciiDigits("١٢٣٤٥٦٧٨٩١")).toBe("1234567891");
    expect(validateIranianNationalId("1234567891")).toBe(true);
    expect(validateIranianNationalId("1234567890")).toBe(false);
  });

  it("wires the patient form to the shared Iranian national-ID validator", () => {
    expect(portal).toContain("toAsciiDigits(value)");
    expect(portal).toContain("validateIranianNationalId(nationalId)");
    expect(portal).toContain("disabled={busy || !nationalIdValid || !passwordValid}");
    expect(portal).toContain("maxLength={128}");
  });

  it("distinguishes duplicate registration from malformed registration", () => {
    expect(client).toContain('response.status === 409');
    expect(client).toContain('new Error("account_already_exists")');
    expect(portal).toContain('code === "account_already_exists"');
    expect(portal).toContain('code === "registration_unavailable"');
  });
});
