import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../app/type-2/type2-scenarios-client.tsx", import.meta.url));
const coreIntakePath = fileURLToPath(new URL("../app/type-2/type2-core-intake-ui.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
const coreIntakeSource = readFileSync(coreIntakePath, "utf8");

describe("Type 2 structured intake request wiring", () => {
  it("uses the typed structured request and renders the conditional field component", () => {
    expect(source).toContain("Type2StructuredConsiderationRequestV2");
    expect(source).toContain("Type2StructuredContextFields");
    expect(source).toContain("draft={structuredContext}");
    expect(source).toContain("factors={factors}");
    expect(source).toContain("worldDrugDomains={worldDrugDomains}");
  });

  it("projects explicit structured draft data and DOB-first age through the extracted clinical-context boundary before submit", () => {
    expect(source).toContain("type2ClinicalContextFromActiveIntake");
    expect(source).toContain(
      "clinicalContext: type2ClinicalContextFromActiveIntake({ context, structuredContext, factors, worldDrugDomains, patientAge })",
    );
    expect(source).toContain("Type2PatientAgeField");
    expect(source).toContain("type2PatientAgeDraftFromPatientData(record, patient)");
    expect(coreIntakeSource).toContain(
      "structuredClinicalContextFromDraft(structuredContext, { factors, worldDrugDomains })",
    );
    expect(coreIntakeSource).toContain("type2PatientAgeFromDraft");
    expect(coreIntakeSource).toContain("ageYears: age.ageYears");
    expect(coreIntakeSource).toContain("...specialist");
    expect(source).toContain("body: JSON.stringify(request)");
  });

  it("preserves the legacy pregnancy marker while leaving diabetes type to explicit pregnancyCare data", () => {
    expect(coreIntakeSource).toContain('pregnancy: factors.includes("pregnancy")');
    expect(coreIntakeSource).not.toContain('diabetesType: factors.includes("pregnancy")');
  });

  it("does not infer diabetic-foot infection from the legacy factor", () => {
    expect(coreIntakeSource).toContain("structuredClinicalContextFromDraft");
    expect(coreIntakeSource).not.toContain('factors.includes("diabetic_foot")');
    expect(coreIntakeSource).not.toContain("diabeticFoot: {");
  });

  it("keeps the scenario, costing, and output logic paths in place", () => {
    expect(source).toContain("buildType2TreatmentScenarios");
    expect(source).toContain("clinicianCostingProfileForMedication");
    expect(source).toContain('scenario.kind === "worlddrug_review"');
    expect(source).toContain("assessment.recommendation.urgentReview");
  });
});
