import type {
  DecisionGraphInventoryV2,
  EvidenceReferenceV2,
  GlycemicEfficacyBandV2,
  HypoglycemiaRiskBandV2,
  KnowledgeMedicationV2,
  WeightDirectionV2,
} from "./types.js";

export interface ClinicalNormalizationChangeV2 {
  masterDrugId: string;
  genericName: string;
  fields: string[];
  promotedToApproved: boolean;
}

export interface ClinicalNormalizationReportV2 {
  normalized: number;
  promotedToApproved: number;
  leftForReview: number;
  changes: ClinicalNormalizationChangeV2[];
}

export interface Ada2026ClassProfileV2 {
  therapyGroup: string;
  efficacyBand: GlycemicEfficacyBandV2;
  hypoglycemiaRisk: HypoglycemiaRiskBandV2;
  weightDirection: WeightDirectionV2;
  note: string;
  evidence: EvidenceReferenceV2[];
}

export const ada2026PharmacologicEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA9-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 9: Pharmacologic Approaches to Glycemic Treatment",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment",
  locator: "Table 9.2 and Recommendations 9.16-9.22",
  strength: "guideline_grade_a",
};

/**
 * Conservative operational profiles from ADA 2026 Table 9.2.
 * For class ranges (e.g. SGLT2 intermediate-to-high; insulin high-to-very-high)
 * the lower bound is used for deterministic selection. Molecule-specific evidence
 * may raise the band elsewhere, but the normalizer never inflates a class beyond
 * what the source supports.
 */
export const ada2026ClassProfilesV2: readonly Ada2026ClassProfileV2[] = [
  {
    therapyGroup: "biguanide",
    efficacyBand: "high",
    hypoglycemiaRisk: "minimal",
    weightDirection: "neutral",
    note: "Metformin: high glucose-lowering efficacy, no intrinsic hypoglycemia, weight neutral with potential modest loss.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "sglt2_inhibitor",
    efficacyBand: "intermediate",
    hypoglycemiaRisk: "minimal",
    weightDirection: "loss",
    note: "SGLT2 inhibitors: ADA 2026 reports intermediate-to-high glycemic efficacy; Decision Graph uses the conservative lower bound.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "dpp4_inhibitor",
    efficacyBand: "intermediate",
    hypoglycemiaRisk: "minimal",
    weightDirection: "neutral",
    note: "DPP-4 inhibitors: intermediate efficacy, no intrinsic hypoglycemia, weight neutral.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "thiazolidinedione",
    efficacyBand: "high",
    hypoglycemiaRisk: "minimal",
    weightDirection: "gain",
    note: "Pioglitazone/TZD profile: high efficacy, no intrinsic hypoglycemia, weight gain; HF safety is handled as a hard gate.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "sulfonylurea",
    efficacyBand: "high",
    hypoglycemiaRisk: "high",
    weightDirection: "gain",
    note: "Second-generation sulfonylureas: high efficacy with hypoglycemia risk and weight gain.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "glp_1_receptor_agonist",
    efficacyBand: "high",
    hypoglycemiaRisk: "minimal",
    weightDirection: "loss",
    note: "GLP-1 receptor agonists are heterogeneous; high is the conservative class floor. Explicit molecule-specific WorldDrug evidence may retain very-high efficacy.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "dual_gip_glp_1_receptor_agonist",
    efficacyBand: "very_high",
    hypoglycemiaRisk: "minimal",
    weightDirection: "loss",
    note: "Dual GIP/GLP-1 therapy is in the highest glycemic and weight-efficacy tier in ADA 2026.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "basal_insulin_analog",
    efficacyBand: "high",
    hypoglycemiaRisk: "high",
    weightDirection: "gain",
    note: "Insulin is high-to-very-high efficacy; Decision Graph uses the conservative lower bound while insulin-necessity is represented by a mandatory objective, not a score.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "prandial_insulin_analog",
    efficacyBand: "high",
    hypoglycemiaRisk: "high",
    weightDirection: "gain",
    note: "Prandial insulin is high-to-very-high efficacy with hypoglycemia and weight-gain risk.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "human_insulin",
    efficacyBand: "high",
    hypoglycemiaRisk: "high",
    weightDirection: "gain",
    note: "Human insulin is high-to-very-high efficacy; product/regimen-specific hypoglycemia handling remains separate.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "premixed_insulin",
    efficacyBand: "high",
    hypoglycemiaRisk: "high",
    weightDirection: "gain",
    note: "Premixed/co-formulated insulin regimens provide high glycemic efficacy; regimen flexibility and hypoglycemia are handled separately.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
  {
    therapyGroup: "fixed_ratio_combination",
    efficacyBand: "high",
    hypoglycemiaRisk: "high",
    weightDirection: "neutral",
    note: "Basal insulin/GLP-1 fixed-ratio combinations are effective injectable intensification options; exact execution requires a bound product-specific label protocol.",
    evidence: [ada2026PharmacologicEvidenceV2],
  },
];

function uniqueEvidence(values: readonly EvidenceReferenceV2[]) {
  const byId = new Map<string, EvidenceReferenceV2>();
  for (const value of values) byId.set(value.sourceId, value);
  return [...byId.values()];
}

function profileFor(medication: KnowledgeMedicationV2) {
  return ada2026ClassProfilesV2.find((profile) => profile.therapyGroup === medication.therapyGroup);
}

function canSafelyPromote(medication: KnowledgeMedicationV2) {
  const resolvedComponentCount = medication.componentMasterDrugIds?.length ?? 0;
  const combinationResolved = !medication.combination ||
    (medication.therapyGroup === "premixed_insulin" ? resolvedComponentCount >= 1 : resolvedComponentCount >= 2);
  // Registered combinations can be promoted only when exact component identities are resolved.
  // Actual FRC/FDC dosing remains gated independently by reviewed dose/product rules.
  return combinationResolved && medication.primaryLanes.length > 0 && medication.evidence.length > 0 && medication.routeOptions.length > 0;
}

export function normalizeKnowledgeMedicationWithAda2026V2(medication: KnowledgeMedicationV2): {
  medication: KnowledgeMedicationV2;
  changedFields: string[];
  promoted: boolean;
} {
  const profile = profileFor(medication);
  if (!profile) return { medication: structuredClone(medication), changedFields: [], promoted: false };

  const next = structuredClone(medication);
  const fields: string[] = [];

  // Explicit molecule-level WorldDrug information wins. The class profile only
  // fills unknown/unstructured values or makes a conservative correction.
  if (next.efficacyBand === "none") {
    next.efficacyBand = profile.efficacyBand;
    fields.push("efficacyBand");
  }
  if (next.weightDirection === "unknown") {
    next.weightDirection = profile.weightDirection;
    fields.push("weightDirection");
  }
  if (next.hypoglycemiaRisk === "moderate") {
    next.hypoglycemiaRisk = profile.hypoglycemiaRisk;
    fields.push("hypoglycemiaRisk");
  }

  next.evidence = uniqueEvidence([...next.evidence, ...profile.evidence]);
  next.tags = [...new Set([...(next.tags ?? []), `ada2026-profile:${profile.therapyGroup}`])];

  let promoted = false;
  if (next.engineState === "review_required" && next.efficacyBand !== "none" && canSafelyPromote(next)) {
    next.engineState = "approved";
    promoted = true;
    fields.push("engineState");
  }

  return { medication: next, changedFields: fields, promoted };
}

export function normalizeDecisionGraphClinicalKnowledgeV2(inventory: DecisionGraphInventoryV2): {
  inventory: DecisionGraphInventoryV2;
  report: ClinicalNormalizationReportV2;
} {
  const changes: ClinicalNormalizationChangeV2[] = [];
  const knowledge = inventory.knowledge.map((medication) => {
    const normalized = normalizeKnowledgeMedicationWithAda2026V2(medication);
    if (normalized.changedFields.length) {
      changes.push({
        masterDrugId: medication.masterDrugId,
        genericName: medication.genericName,
        fields: normalized.changedFields,
        promotedToApproved: normalized.promoted,
      });
    }
    return normalized.medication;
  });

  return {
    inventory: { ...inventory, knowledge },
    report: {
      normalized: changes.length,
      promotedToApproved: changes.filter((item) => item.promotedToApproved).length,
      leftForReview: knowledge.filter((item) => item.engineState === "review_required").length,
      changes,
    },
  };
}
