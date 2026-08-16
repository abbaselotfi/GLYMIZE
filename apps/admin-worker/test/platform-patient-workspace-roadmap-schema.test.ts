import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Patient Record v2 workspace roadmap/schema contracts", () => {
  const roadmap = fs.readFileSync(
    new URL(
      "../../../docs/GLYMIZE_CLINICAL_PRODUCT_ROADMAP.md",
      import.meta.url,
    ),
    "utf8",
  );
  const dataModel = fs.readFileSync(
    new URL("../../../docs/DATA_MODEL.md", import.meta.url),
    "utf8",
  );
  const architecture = fs.readFileSync(
    new URL("../../../docs/ARCHITECTURE.md", import.meta.url),
    "utf8",
  );
  const queue = fs.readFileSync(
    new URL(
      "../../../docs/IMPLEMENTATION_QUEUE_2026-08-15.md",
      import.meta.url,
    ),
    "utf8",
  );
  const migration = fs.readFileSync(
    new URL(
      "../migrations/0003_longitudinal_patient_records.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const contracts = fs.readFileSync(
    new URL(
      "../../../packages/contracts/src/patient-record-v2.ts",
      import.meta.url,
    ),
    "utf8",
  );

  it("separates the stable patient from dated encounters", () => {
    expect(roadmap).toContain("Patient ≠ Encounter");
    expect(migration).toContain("patient_registry");
    expect(migration).toContain("patient_encounters");
    expect(contracts).toContain("PatientLongitudinalSummary");
    expect(contracts).toContain("PatientEncounterSummary");
  });

  it("uses national ID as default lookup without making it the primary key", () => {
    expect(roadmap).toContain(
      "National ID is the default/first-priority lookup mode",
    );
    expect(roadmap).toContain(
      "authoritative identity remains the practice-scoped random `patient_id`",
    );
    expect(dataModel).toContain(
      "کد ملی در UI می‌تواند lookup پیش‌فرض باشد",
    );
  });

  it("defines an explicit monotonic practice file-number allocator", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS patient_file_number_allocators",
    );
    expect(migration).toContain("allocation_status");
    expect(migration).toContain("last_allocated_number");
    expect(roadmap).toContain("monotonic file-number allocator/high-water mark");
    expect(queue).toContain("monotonic allocator");
    expect(contracts).toContain("PatientFileNumberAllocatorState");
  });

  it("keeps physician patient/encounter notes revisioned and encrypted", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS patient_note_threads",
    );
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS patient_note_revisions",
    );
    expect(migration).toContain("physician_only");
    expect(migration).toContain("payload_ciphertext");
    expect(roadmap).toContain("Patient note");
    expect(roadmap).toContain("Encounter note");
    expect(contracts).toContain("PhysicianNoteRevision");
  });

  it("defines Patient Workspace timeline, trends and presentation-only modes", () => {
    expect(roadmap).toContain("Patient Workspace");
    expect(roadmap).toContain("compact mini-chart");
    expect(roadmap).toContain("existing physician `layoutPreset`");
    expect(roadmap).toContain("`auto`");
    expect(roadmap).toContain("`focused_workflow`");
    expect(roadmap).toContain("`compact_cards`");
    expect(roadmap).toContain("`command_center`");
    expect(architecture).toContain("Patient Workspace یک read model");
    expect(contracts).toContain("PatientTrendSeries");
    expect(contracts).toContain("patientWorkspaceModes");
  });

  it("freezes migration 0003 after isolated RC rehearsal while keeping Production gated", () => {
    expect(migration).toContain(
      "DESIGN/SCHEMA ONLY until explicitly applied through the RC migration gate",
    );
    expect(roadmap).toContain("Migration `0003` is now frozen");
    expect(queue).toContain("applied migration `0003` is frozen");
    expect(roadmap).toContain(
      "Apply Patient Record v2 to Production only after runtime RC/browser acceptance",
    );
  });
});
