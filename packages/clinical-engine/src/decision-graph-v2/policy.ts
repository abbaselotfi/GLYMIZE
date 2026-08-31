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

/**
 * Policy contains thresholds and ordering knobs only — never medication scores.
 * Any change is versionable and regression-testable.
 */
export const defaultDecisionGraphPolicyV2: DecisionGraphPolicyV2 = {
  engineName: "GLYMIZE Decision Graph",
  engineVersion: "2.7.0-alpha.1",
  severeHyperglycemiaA1cExclusiveAbove: 10,
  severeHyperglycemiaGlucoseAtOrAboveMgDl: 300,
  combinationTherapyA1cGapAtOrAbove: 1.5,
  fastingTargetLowMgDl: 80,
  fastingTargetHighMgDl: 130,
  postprandialTargetUpperMgDl: 180,
  overbasalizationBedtimeMorningDeltaMgDl: 50,
  topAlternativeCount: 2,
  evidence: { pharmacologic, glycemicGoals, technology },
};
