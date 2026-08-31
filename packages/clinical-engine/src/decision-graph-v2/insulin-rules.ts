import type {
  DoseRuleV2,
  EvidenceReferenceV2,
  KnowledgeMedicationV2,
} from "./types.js";
import { ada2026PharmacologicEvidenceV2 } from "./clinical-normalization.js";

export const ada2026InsulinEvidenceV2: EvidenceReferenceV2 = {
  ...ada2026PharmacologicEvidenceV2,
  locator: "Recommendations 9.20-9.26; Basal Insulin; Combination Injectable Therapy and Prandial Insulin",
};

function isBasalCandidate(medication: KnowledgeMedicationV2) {
  if (medication.therapyGroup === "basal_insulin_analog") return true;
  return medication.therapyGroup === "human_insulin" && /\bnph\b/i.test(medication.genericName);
}

function isPrandialCandidate(medication: KnowledgeMedicationV2) {
  if (medication.therapyGroup === "prandial_insulin_analog") return true;
  return medication.therapyGroup === "human_insulin" && /regular/i.test(medication.genericName);
}

export function buildAda2026InsulinDoseRulesV2(knowledge: readonly KnowledgeMedicationV2[]): DoseRuleV2[] {
  const rules: DoseRuleV2[] = [];

  for (const medication of knowledge.filter((item) => item.engineState === "approved")) {
    if (isBasalCandidate(medication)) {
      rules.push({
        id: `ADA2026-BASAL-START:${medication.masterDrugId}`,
        masterDrugId: medication.masterDrugId,
        indication: "Type 2 diabetes - initial basal insulin",
        formula: {
          kind: "weight_based_daily",
          ingredientKey: medication.masterDrugId,
          unit: "U",
          minPerKg: 0.1,
          maxPerKg: 0.2,
          administrationsPerDay: 1,
          selection: "by_glycemic_severity",
          roundTo: 1,
        },
        titration: {
          stepText: "Individualize basal titration from serial fasting glucose/SMBG or CGM while actively checking for hypoglycemia and overbasalization",
          targetMetric: "individualized fasting glucose target; for many nonpregnant adults 80-130 mg/dL",
        },
        monitoring: [
          "fasting glucose pattern",
          "hypoglycemia",
          "bedtime-to-morning glucose differential",
          "postprandial-to-preprandial differential",
          "CGM variability when available",
        ],
        evidence: [ada2026InsulinEvidenceV2],
        reviewState: "approved",
      });
    }

    if (isPrandialCandidate(medication)) {
      rules.push({
        id: `ADA2026-PRANDIAL-START:${medication.masterDrugId}`,
        masterDrugId: medication.masterDrugId,
        indication: "Type 2 diabetes - first prandial insulin dose after basal optimization/appropriate injectable review",
        formula: {
          kind: "prandial_initial",
          ingredientKey: medication.masterDrugId,
          fixedUnits: 4,
          fractionOfBasal: 0.1,
          meal: "largest_meal",
        },
        titration: {
          stepText: "Individualize prandial titration using SMBG or CGM pattern management",
          targetMetric: "postprandial/premeal pattern and individualized glycemic goals",
        },
        monitoring: [
          "SMBG or CGM",
          "postprandial excursions",
          "hypoglycemia",
          "need to reassess basal insulin when prandial dose rises substantially",
        ],
        evidence: [ada2026InsulinEvidenceV2],
        reviewState: "approved",
      });
    }
  }

  return rules;
}
