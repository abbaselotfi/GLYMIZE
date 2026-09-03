import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { patientIdentityRoute } from "../src/platform-patient-identity";

const migration = fs.readFileSync(
  new URL("../migrations/0010_patient_sms_otp_schema.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../src/platform-patient-identity.ts", import.meta.url),
  "utf8",
);
describe("P5-A provider-neutral patient SMS OTP schema", () => {
  it("stores only hashed destination and code material", () => {
    expect(migration).toContain("destination_lookup_hash TEXT NOT NULL");
    expect(migration).toContain("code_hash TEXT NOT NULL");
    expect(migration).not.toMatch(/destination\s+TEXT/i);
    expect(migration).not.toMatch(/code\s+TEXT/i);
  });

  it("bounds expiry and attempts without selecting a provider", () => {
    const sql = migration.replace(/^--.*$/gm, "");
    expect(migration).toContain("expires_at TEXT NOT NULL");
    expect(migration).toContain("max_attempts INTEGER NOT NULL DEFAULT 5");
    expect(sql).not.toMatch(/provider|sms\.ir|kavenegar/i);
  });

  it("keeps the runtime capability OFF by default and exposes no OTP route", async () => {
    const response = await patientIdentityRoute(
      new Request("https://worker.example.test/v1/patient-identity/capabilities"),
      {
        ADMIN_ORIGIN: "https://rc.example.test",
        SESSION_SECRET: "test-only-session-secret",
      },
    );
    expect(await response?.json()).toMatchObject({ smsOtp: false });
    expect(runtime).toContain("PATIENT_SMS_OTP_ENABLED");
    expect(runtime).not.toMatch(/patient-identity\/(auth\/)?otp/);
  });

  it("does not touch local clinical records or create care relationships", () => {
    expect(migration).not.toContain("patient_registry");
    expect(migration).not.toContain("care_relationships");
  });
});
