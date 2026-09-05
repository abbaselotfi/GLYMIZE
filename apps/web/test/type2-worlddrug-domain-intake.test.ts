import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { medicationClinicalDomains } from "@glymize/contracts";

const sourcePath = fileURLToPath(
  new URL("../app/type-2/type2-scenarios-client.tsx", import.meta.url),
);
const source = readFileSync(sourcePath, "utf8");

const factorBackedDomains = {
  diabetes: "currentHba1c",
  cardiovascular: 'key: "ascvd"',
  kidney: 'key: "ckd"',
  liver: 'key: "masld_mash"',
  obesity: 'key: "weight_priority"',
  heart_failure: 'key: "heart_failure"',
  ascvd: 'key: "ascvd"',
  masld_mash: 'key: "masld_mash"',
  diabetic_foot: 'key: "diabetic_foot"',
  pregnancy: 'key: "pregnancy"',
} as const;

const explicitWorldDrugDomains = [
  "cardiovascular",
  "hypertension",
  "lipids",
  "neuropathy",
  "retinopathy",
  "nutrition_support",
] as const;

describe("Type 2 WorldDrug domain intake", () => {
  it("provides a patient-input path for every current MedicationClinicalDomain", () => {
    const covered = new Set<string>([
      ...Object.keys(factorBackedDomains),
      ...explicitWorldDrugDomains,
    ]);

    expect([...medicationClinicalDomains].filter((domain) => !covered.has(domain))).toEqual([]);

    for (const marker of Object.values(factorBackedDomains)) {
      expect(source).toContain(marker);
    }
    for (const domain of explicitWorldDrugDomains) {
      expect(source).toContain(`key: "${domain}"`);
    }
  });

  it("sends selected review domains to the assessment request without turning them into a clinical rank", () => {
    expect(source).toContain("activeClinicalDomains: worldDrugDomains");
    expect(source).toContain('scenario.kind !== "worlddrug_review"');
    expect(source).toContain('scenario.kind === "worlddrug_review" ? "WD" : scenario.rank');
    expect(source).toContain('medication.outputStatus === "requires_approved_protocol"');
    expect(source).toContain('"Protocol required"');
  });

  it("routes pregnancy through the clinical factor/context path rather than review-only domain intake", () => {
    expect(source).toContain('{ key: "pregnancy"');
    expect(source).toContain('pregnancy: factors.includes("pregnancy")');
    expect(source).not.toContain('{ key: "pregnancy", fa: "بارداری", en: "Pregnancy", hintFa: "فرآورده‌ها');
  });
});
