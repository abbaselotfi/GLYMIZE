import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  emptyType2StructuredIntakeDraft,
  structuredClinicalContextFromDraft,
} from "../app/type-2/type2-structured-intake-ui";

function draft(patch: Partial<typeof emptyType2StructuredIntakeDraft> = {}) {
  return { ...emptyType2StructuredIntakeDraft, ...patch };
}

describe("Type 2 structured intake UI model", () => {
  it("does not turn domain activation into a diagnosis", () => {
    const context = structuredClinicalContextFromDraft(draft(), {
      factors: ["diabetic_foot", "pregnancy"],
      worldDrugDomains: ["neuropathy", "retinopathy", "nutrition_support"],
    });
    expect(context.diabeticFoot).toBeUndefined();
    expect(context.pregnancyCare).toBeUndefined();
    expect(context.neuropathy).toBeUndefined();
    expect(context.retinopathy).toBeUndefined();
    expect(context.nutritionSupport).toBeUndefined();
  });

  it("projects only explicit diabetic-foot infection facts", () => {
    const context = structuredClinicalContextFromDraft(draft({
      footUlcerPresent: "yes",
      footClinicalInfection: "no",
    }), {
      factors: ["diabetic_foot"],
      worldDrugDomains: [],
    });
    expect(context.diabeticFoot).toEqual(expect.objectContaining({
      footUlcerPresent: true,
      clinicalInfectionPresent: false,
    }));
    expect(context.diabeticFoot?.infectionSeverity).toBeUndefined();
  });

  it("keeps entered foot facts dormant when the foot pathway is not active", () => {
    const context = structuredClinicalContextFromDraft(draft({
      footUlcerPresent: "yes",
      footClinicalInfection: "yes",
      footInfectionSeverity: "moderate",
    }), { factors: [], worldDrugDomains: [] });
    expect(context.diabeticFoot).toBeUndefined();
  });

  it("projects retinopathy severity and DME only from explicit entries", () => {
    const context = structuredClinicalContextFromDraft(draft({
      retinopathyPresent: "yes",
      retinopathySeverity: "moderate_npdr",
      diabeticMacularEdema: "no",
    }), { factors: [], worldDrugDomains: ["retinopathy"] });
    expect(context.retinopathy).toEqual(expect.objectContaining({
      diabeticRetinopathyPresent: true,
      severity: "moderate_npdr",
      diabeticMacularEdema: false,
    }));
  });

  it("projects a clinician-confirmed painful-DPN phenotype only under the neuropathy domain", () => {
    const context = structuredClinicalContextFromDraft(draft({
      dpnConfirmed: "yes",
      dpnPainfulSymptoms: "yes",
      dpnAtypicalFeatures: "no",
    }), { factors: [], worldDrugDomains: ["neuropathy"] });
    expect(context.neuropathy).toEqual({
      diabeticPeripheralNeuropathyConfirmed: true,
      painfulSymptoms: true,
      atypicalFeaturesPresent: false,
    });
  });

  it("requires an explicit nutrition intent before creating nutrition context", () => {
    const noIntent = structuredClinicalContextFromDraft(draft({
      documentedMicronutrientDeficiency: "yes",
      deficiencyName: "Vitamin B12",
    }), { factors: [], worldDrugDomains: ["nutrition_support"] });
    expect(noIntent.nutritionSupport).toBeUndefined();

    const withIntent = structuredClinicalContextFromDraft(draft({
      nutritionIntent: "documented_deficiency",
      documentedMicronutrientDeficiency: "yes",
      deficiencyName: "Vitamin B12",
      deficiencyLabValueKnown: "yes",
    }), { factors: [], worldDrugDomains: ["nutrition_support"] });
    expect(withIntent.nutritionSupport).toEqual(expect.objectContaining({
      intent: "documented_deficiency",
      documentedMicronutrientDeficiency: true,
      deficiencyName: "Vitamin B12",
      deficiencyLabValueKnown: true,
    }));
  });

  it("does not invent pregnancy diabetes type from the pregnancy factor", () => {
    const context = structuredClinicalContextFromDraft(draft(), {
      factors: ["pregnancy"],
      worldDrugDomains: [],
    });
    expect(context.pregnancyCare).toBeUndefined();
  });

  it("projects explicit pregnancy type and glucose data without adding treatment decisions", () => {
    const context = structuredClinicalContextFromDraft(draft({
      pregnancyDiabetesType: "gdm",
      gestationalAgeWeeks: "28",
      fastingGlucose: "99",
      twoHourPostprandialGlucose: "122",
    }), { factors: ["pregnancy"], worldDrugDomains: [] });
    expect(context.pregnancyCare).toEqual(expect.objectContaining({
      diabetesType: "gdm",
      gestationalAgeWeeks: 28,
    }));
    expect(context.glycemia).toEqual({
      fastingPlasmaGlucoseMgDl: 99,
      twoHourPostprandialGlucoseMgDl: 122,
      randomGlucoseMgDl: undefined,
    });
  });

  it("keeps malformed numeric text out of the structured payload", () => {
    const context = structuredClinicalContextFromDraft(draft({
      fastingGlucose: "not-a-number",
      randomGlucose: "180",
    }), { factors: [], worldDrugDomains: [] });
    expect(context.glycemia).toEqual({
      fastingPlasmaGlucoseMgDl: undefined,
      twoHourPostprandialGlucoseMgDl: undefined,
      randomGlucoseMgDl: 180,
    });
  });
});

describe("Type 2 structured context field surface", () => {
  const sourcePath = fileURLToPath(new URL("../app/type-2/type2-structured-context-fields.tsx", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");

  it("renders named conditional panels and warns that domain selection is not diagnosis", () => {
    expect(source).toContain('data-testid="pregnancy-structured-fields"');
    expect(source).toContain('data-testid="diabetic-foot-structured-fields"');
    expect(source).toContain('data-testid="retinopathy-structured-fields"');
    expect(source).toContain('data-testid="neuropathy-structured-fields"');
    expect(source).toContain('data-testid="nutrition-structured-fields"');
    expect(source).toContain("Selecting a domain is not a diagnosis");
  });

  it("keeps pregnancy type and foot infection severity as explicit clinician inputs", () => {
    expect(source).toContain("pregnancyDiabetesType");
    expect(source).toContain("footInfectionSeverity");
    expect(source).toContain("IWGDF/IDSA severity");
  });
});
