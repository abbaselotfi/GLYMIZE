import {
  bundledClinicalRulePack,
  getActiveClinicalRulePack,
  type Type2RuleParameters,
} from "../rule-pack.js";
import type { DecisionGraphPolicyV2, EvidenceReferenceV2 } from "./types.js";

const pharmacologic: EvidenceReferenceV2 = {
  sourceId: "ada-2026-pharmacologic",
  title: "ADA Standards of Care in Diabetes—2026, Section 9: Pharmacologic Approaches to Glycemic Treatment",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment",
  strength: "guideline_grade_a",
};

const glycemicGoals: EvidenceReferenceV2 = {
  sourceId: "ada-2026-glycemic-goals",
  title: "ADA Standards of Care in Diabetes—2026, Section 6: Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S132/163927/6-Glycemic-Goals-Hypoglycemia-and-Hyperglycemic",
  strength: "guideline_grade_a",
};

const technology: EvidenceReferenceV2 = {
  sourceId: "ada-2026-technology",
  title: "ADA Standards of Care in Diabetes—2026, Section 7: Diabetes Technology",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S150/163922/7-Diabetes-Technology-Standards-of-Care-in",
  strength: "guideline_grade_a",
};

const evidence = { pharmacologic, glycemicGoals, technology } as const;

/**
 * Builds Decision Graph policy from the reviewed Type 2 rule-pack parameters.
 * Shared pathway thresholds are therefore not independently authored here.
 */
export function buildDecisionGraphPolicyV2FromRuleParameters(
  type2: Type2RuleParameters,
): DecisionGraphPolicyV2 {
  return {
    engineName: "GLYMIZE Decision Graph",
    engineVersion: "2.7.0-alpha.1",
    severeHyperglycemiaA1cExclusiveAbove: type2.severeHyperglycemiaA1cThreshold,
    severeHyperglycemiaGlucoseAtOrAboveMgDl: 300,
    combinationTherapyA1cGapAtOrAbove: type2.combinationTherapyGap,
    fastingTargetLowMgDl: 80,
    fastingTargetHighMgDl: 130,
    postprandialTargetUpperMgDl: 180,
    overbasalizationBedtimeMorningDeltaMgDl: 50,
    topAlternativeCount: 2,
    evidence,
  };
}

/**
 * Runtime policy resolves shared Type 2 thresholds from the currently active,
 * approved rule pack on every graph invocation.
 */
export function buildDecisionGraphPolicyV2FromActiveRulePack(): DecisionGraphPolicyV2 {
  return buildDecisionGraphPolicyV2FromRuleParameters(getActiveClinicalRulePack().type2);
}

/**
 * Stable bundled-policy snapshot for tests, documentation, and callers that
 * intentionally need the shipped approved defaults rather than active runtime
 * configuration.
 */
export const defaultDecisionGraphPolicyV2: DecisionGraphPolicyV2 =
  buildDecisionGraphPolicyV2FromRuleParameters(bundledClinicalRulePack.type2);
