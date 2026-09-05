import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../app/type-2/type2-scenarios-client.tsx", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

describe("Type 2 structured intake request wiring", () => {
  it("uses the typed structured request and renders the conditional field component", () => {
    expect(source).toContain('Type2StructuredConsiderationRequestV2');
    expect(source).toContain('Type2StructuredContextFields');
    expect(source).toContain('draft={structuredContext}');
    expect(source).toContain('factors={factors}');
    expect(source).toContain('worldDrugDomains={worldDrugDomains}');
  });

  it("projects explicit structured draft data into clinicalContext before submit", () => {
    expect(source).toContain('structuredClinicalContextFromDraft(structuredContext, { factors, worldDrugDomains })');
    expect(source).toContain('...specialist');
    expect(source).toContain('clinicalContext: clinicalContextPayload()');
    expect(source).toContain('body: JSON.stringify(request)');
  });

  it("preserves the legacy pregnancy marker while leaving diabetes type to explicit pregnancyCare data", () => {
    expect(source).toContain('pregnancy: factors.includes("pregnancy")');
    expect(source).not.toContain('diabetesType: factors.includes("pregnancy")');
  });

  it("does not infer diabetic-foot infection from the legacy factor", () => {
    const payloadStart = source.indexOf("function clinicalContextPayload");
    const payloadEnd = source.indexOf("function applyPatientHandoff", payloadStart);
    const payloadSource = source.slice(payloadStart, payloadEnd);
    expect(payloadSource).not.toContain('diabeticFoot: {');
    expect(payloadSource).toContain('structuredClinicalContextFromDraft');
  });

  it("keeps the scenario, costing, and output logic paths in place", () => {
    expect(source).toContain('buildType2TreatmentScenarios');
    expect(source).toContain('clinicianCostingProfileForMedication');
    expect(source).toContain('scenario.kind === "worlddrug_review"');
    expect(source).toContain('assessment.recommendation.urgentReview');
  });
});
