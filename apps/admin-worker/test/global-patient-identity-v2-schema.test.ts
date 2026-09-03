import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  new URL("../migrations/0007_global_patient_identity_v2.sql", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../../../docs/P5_A3_GLOBAL_PATIENT_IDENTITY_DESIGN.md", import.meta.url),
  "utf8",
);

describe("P5-A3 global patient identity foundation", () => {
  it("creates a global account without practice or clinical-record ownership", () => {
    const account = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS patient_accounts"),
      migration.indexOf("CREATE INDEX IF NOT EXISTS patient_accounts_status_updated_idx"),
    );
    expect(account).not.toContain("practice_id");
    expect(account).not.toContain("patient_id");
    expect(account).toContain("proofing_status");
    expect(account).toContain("password_hash");
  });

  it("stores keyed lookup and encrypted identity values without plaintext columns", () => {
    expect(migration).toContain("patient_account_identities");
    expect(migration).toContain("lookup_hash TEXT NOT NULL");
    expect(migration).toContain("value_ciphertext TEXT NOT NULL");
    expect(migration).toContain("value_auth_tag TEXT NOT NULL");
    expect(migration).not.toMatch(/national_id\s+TEXT/i);
    expect(migration).not.toMatch(/mobile\s+TEXT/i);
  });

  it("keeps legacy linking reviewed and separate from care relationships", () => {
    expect(migration).toContain("portal_user_account_links");
    expect(migration).toContain("link_status TEXT NOT NULL DEFAULT 'pending'");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS care_relationships");
    expect(migration).not.toContain("INSERT INTO portal_user_account_links");
  });

  it("is additive and preserves the frozen practice-local patient record", () => {
    expect(migration).not.toContain("ALTER TABLE patient_registry");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DELETE FROM");
    expect(design).toContain("patient_registry` remains the authoritative practice-local clinical file");
    expect(design).toContain("runtime activation remains OFF");
  });
});
