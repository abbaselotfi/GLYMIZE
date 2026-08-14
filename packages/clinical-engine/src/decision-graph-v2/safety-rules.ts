import type {
  EvidenceReferenceV2,
  KnowledgeMedicationV2,
  MedicationGateRuleV2,
  RegimenConflictRuleV2,
} from "./types.js";
import { ada2026PharmacologicEvidenceV2 } from "./clinical-normalization.js";

const kdigoDmCkd2022: EvidenceReferenceV2 = {
  sourceId: "KDIGO-DMCKD-2022",
  title: "KDIGO 2022 Clinical Practice Guideline for Diabetes Management in Chronic Kidney Disease",
  version: "2022",
  url: "https://kdigo.org/wp-content/uploads/2022/10/KDIGO-2022-Clinical-Practice-Guideline-for-Diabetes-Management-in-CKD.pdf",
  strength: "guideline_grade_a",
};

export interface CoreDecisionRulesV2 {
  medicationGateRules: MedicationGateRuleV2[];
  regimenConflictRules: RegimenConflictRuleV2[];
}

function metforminIds(knowledge: readonly KnowledgeMedicationV2[]) {
  return knowledge.filter((item) => item.therapyGroup === "biguanide" && /metformin/i.test(item.genericName)).map((item) => item.masterDrugId);
}

/**
 * Core hard rules from current structured guideline statements.
 * These are categorical constraints, never penalty points.
 */
export function buildCoreAda2026DecisionRulesV2(knowledge: readonly KnowledgeMedicationV2[]): CoreDecisionRulesV2 {
  const medicationGateRules: MedicationGateRuleV2[] = [];

  for (const masterDrugId of metforminIds(knowledge)) {
    medicationGateRules.push({
      id: `ADA2026-METFORMIN-EGFR30:${masterDrugId}`,
      masterDrugId,
      when: { fact: "kidney.eGfr", op: "lt", value: 30 },
      effect: "exclude",
      reason: "Metformin is contraindicated when eGFR is below 30 mL/min/1.73 m²; the candidate is removed by a hard safety gate.",
      evidence: [ada2026PharmacologicEvidenceV2, kdigoDmCkd2022],
    });
    medicationGateRules.push({
      id: `METFORMIN-EGFR30-44-REVIEW:${masterDrugId}`,
      masterDrugId,
      when: { all: [
        { fact: "kidney.eGfr", op: "gte", value: 30 },
        { fact: "kidney.eGfr", op: "lt", value: 45 },
      ] },
      effect: "conditional",
      reason: "Metformin initiation is not recommended at eGFR 30–44 mL/min/1.73 m²; continuation requires individualized benefit-risk review and dose reassessment.",
      evidence: [ada2026PharmacologicEvidenceV2, kdigoDmCkd2022],
    });
  }

  medicationGateRules.push({
    id: "ADA2026-TZD-HF",
    therapyGroup: "thiazolidinedione",
    when: { fact: "cardiovascular.heartFailure", op: "eq", value: true },
    effect: "exclude",
    reason: "Thiazolidinedione therapy is excluded in heart failure because of fluid-retention/HF risk.",
    evidence: [ada2026PharmacologicEvidenceV2],
  });

  const regimenConflictRules: RegimenConflictRuleV2[] = [
    {
      id: "ADA2026-DPP4-GLP1-CONCURRENT",
      tagA: "dpp4_inhibitor",
      tagB: "glp_1_receptor_agonist",
      reason: "Concurrent DPP-4 inhibitor and GLP-1 RA therapy is not recommended because it adds no meaningful glucose lowering beyond GLP-1-based therapy.",
      evidence: [ada2026PharmacologicEvidenceV2],
    },
    {
      id: "ADA2026-DPP4-DUALGIPGLP1-CONCURRENT",
      tagA: "dpp4_inhibitor",
      tagB: "dual_gip_glp_1_receptor_agonist",
      reason: "Concurrent DPP-4 inhibitor and dual GIP/GLP-1 therapy is not recommended.",
      evidence: [ada2026PharmacologicEvidenceV2],
    },
    {
      id: "ADA2026-FRC-GLP1-DUPLICATION",
      tagA: "fixed_ratio_combination",
      tagB: "glp_1_receptor_agonist",
      reason: "A basal-insulin/GLP-1 fixed-ratio combination must not be layered with another GLP-1 receptor agonist.",
      evidence: [ada2026PharmacologicEvidenceV2],
    },
    {
      id: "ADA2026-FRC-DUALGIPGLP1-DUPLICATION",
      tagA: "fixed_ratio_combination",
      tagB: "dual_gip_glp_1_receptor_agonist",
      reason: "A basal-insulin/GLP-1 fixed-ratio combination must not be combined with a dual GIP/GLP-1 agonist.",
      evidence: [ada2026PharmacologicEvidenceV2],
    },
  ];

  return { medicationGateRules, regimenConflictRules };
}
