import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  new URL("../migrations/0019_patient_core_allergy_problem_authority.sql", import.meta.url),
  "utf8",
);

describe("R28-06 Option A authority schema", () => {
  it("creates separate append-only allergy, problem and reconciliation responsibilities", () => {
    expect(migration).toContain("patient_core_allergy_revisions");
    expect(migration).toContain("patient_core_problem_revisions");
    expect(migration).toContain("patient_core_collection_reconciliations");
    expect(migration).toContain("PRIMARY KEY (fact_id, revision)");
    expect(migration).toContain("PRIMARY KEY (practice_id, patient_id, family, revision)");
  });

  it("stores clinical payloads encrypted rather than indexing display or diagnosis text", () => {
    expect(migration).toContain("payload_ciphertext TEXT NOT NULL");
    expect(migration).toContain("payload_iv TEXT NOT NULL");
    expect(migration).toContain("payload_auth_tag TEXT NOT NULL");
    expect(migration).not.toMatch(/display_name\s+TEXT/i);
    expect(migration).not.toMatch(/substance_key\s+TEXT/i);
    expect(migration).not.toMatch(/diagnosis\w*\s+TEXT/i);
  });

  it("enforces patient/practice ownership at the D1 storage boundary", () => {
    expect(migration).toContain("patient_core_allergy_scope_guard");
    expect(migration).toContain("patient_core_problem_scope_guard");
    expect(migration).toContain("patient_core_reconciliation_scope_guard");
    expect(migration).toContain("p.id = NEW.patient_id AND p.practice_id = NEW.practice_id");
    expect(migration).toContain("RAISE(ABORT, 'patient_scope_mismatch')");
  });

  it("allows only explicit partial or complete reconciliation and performs no synthetic backfill", () => {
    expect(migration).toContain("completeness IN ('partial','complete')");
    expect(migration).not.toMatch(/INSERT\s+INTO\s+patient_core_(allergy|problem)_revisions\s+SELECT/i);
    expect(migration).not.toContain("patient_handoffs");
    expect(migration).not.toContain("patient_encounter_snapshots SELECT");
  });
});
