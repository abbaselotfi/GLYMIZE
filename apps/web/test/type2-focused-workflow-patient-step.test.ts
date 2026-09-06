import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const patientStepSource = fs.readFileSync(
  path.join(root, "app/components/patient-handoff-lookup.tsx"),
  "utf8",
);
const type2Source = fs.readFileSync(
  path.join(root, "app/type-2/type2-scenarios-client.tsx"),
  "utf8",
);

describe("Focused Workflow optional Patient step", () => {
  it("keeps Patient as the first optional workflow step rather than a gate", () => {
    expect(patientStepSource).toContain('data-focused-workflow-patient-step="optional"');
    expect(patientStepSource).toContain("PATIENT · OPTIONAL FIRST STEP");
    expect(patientStepSource).toContain("Continue without patient record");
    expect(patientStepSource).toContain("The Type 2 workflow remains fully available.");

    const patientStepPosition = type2Source.indexOf("<PatientHandoffLookup");
    const formPosition = type2Source.indexOf('<form className={styles.form}');
    expect(patientStepPosition).toBeGreaterThanOrEqual(0);
    expect(formPosition).toBeGreaterThan(patientStepPosition);
  });

  it("uses Patient Record v2 smart resolution with explicit identifier override", () => {
    expect(patientStepSource).toContain("resolvePatient({");
    expect(patientStepSource).toContain('lookupMode === "auto"');
    expect(patientStepSource).toContain('<option value="national_id">');
    expect(patientStepSource).toContain('<option value="file_number">');
    expect(patientStepSource).toContain('<option value="other">');
    expect(patientStepSource).toContain("getPatientWorkspace(resolved.patient.patientId)");
    expect(patientStepSource).toContain('item.source === "care_team"');
    expect(patientStepSource).toContain('item.status === "ready_for_physician"');
    expect(patientStepSource).toContain("openPatientRecordArchiveItem(archiveItem)");
  });

  it("keeps legacy compatibility read-only and never silently promotes from the physician workflow", () => {
    expect(patientStepSource).toContain("lookupLegacyPatientHandoff");
    expect(patientStepSource).toContain('resolution: "legacy_handoff"');
    expect(patientStepSource).toContain("this workflow never performs automatic promotion");
    expect(patientStepSource).not.toContain("promoteLegacyHandoff");
    expect(patientStepSource).not.toContain("createPatientEncounter");
    expect(patientStepSource).not.toContain("revisePatientEncounter");
  });

  it("offers the Care Team route without attaching patient identity to the Type 2 clinical request", () => {
    expect(patientStepSource).toContain('window.location.assign("/care-team")');
    expect(patientStepSource).toContain('window.sessionStorage.setItem("glymize:care-team-edit-code"');

    const requestBlockStart = type2Source.indexOf("const request: Type2StructuredConsiderationRequestV2");
    const requestBlockEnd = type2Source.indexOf("setStatus", requestBlockStart);
    const requestBlock = type2Source.slice(requestBlockStart, requestBlockEnd);
    expect(requestBlock).not.toContain("patientId");
    expect(requestBlock).not.toContain("identifier");
  });
});
