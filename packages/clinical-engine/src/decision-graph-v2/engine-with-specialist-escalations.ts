import { resolveDiabeticFootPathwayV2, type DiabeticFootContextV2 } from "./diabetic-foot-escalation.js";
import { runDecisionGraphV2 } from "./engine.js";
import {
  resolveNutritionSupportBoundaryV2,
  type NutritionSupportContextV2,
} from "./nutrition-support-boundary.js";
import {
  resolveRetinopathySpecialistEscalationV2,
  type RetinopathyContextV2,
  type SpecialistEscalationV2,
} from "./retinopathy-escalation.js";
import type { DecisionGraphPolicyV2, DecisionGraphRequestV2, DecisionGraphResultV2 } from "./types.js";

export type DecisionGraphRequestWithSpecialistContextsV2 = Omit<DecisionGraphRequestV2, "patient"> & {
  patient: DecisionGraphRequestV2["patient"] & {
    retinopathy?: RetinopathyContextV2;
    diabeticFoot?: DiabeticFootContextV2;
    nutritionSupport?: NutritionSupportContextV2;
  };
};

export type DecisionGraphResultWithSpecialistPathwaysV2 = DecisionGraphResultV2 & {
  specialistEscalations: SpecialistEscalationV2[];
  diabeticFootPathway: ReturnType<typeof resolveDiabeticFootPathwayV2>;
  nutritionSupportPathway: ReturnType<typeof resolveNutritionSupportBoundaryV2>;
};

/**
 * Additive execution wrapper for specialist/escalation/safety pathways that must
 * never become medication-ranking authority in the general Decision Graph.
 *
 * The core treatment result is preserved; parallel pathways are appended as
 * separate channels. Ophthalmology, diabetic-foot triage and generic nutrition
 * support therefore cannot manufacture medication candidates, doses, or a
 * second ranking authority.
 */
export function runDecisionGraphV2WithSpecialistEscalations(
  request: DecisionGraphRequestWithSpecialistContextsV2,
  policy?: DecisionGraphPolicyV2,
): DecisionGraphResultWithSpecialistPathwaysV2 {
  const core = policy ? runDecisionGraphV2(request, policy) : runDecisionGraphV2(request);
  const retinopathy = resolveRetinopathySpecialistEscalationV2(request);
  const diabeticFootPathway = resolveDiabeticFootPathwayV2(request);
  const nutritionSupportPathway = resolveNutritionSupportBoundaryV2(request);

  const missingData = [...core.missingData];
  for (const item of [
    ...retinopathy.missingData,
    ...diabeticFootPathway.missingData,
    ...nutritionSupportPathway.missingData,
  ]) {
    if (!missingData.some((existing) => existing.key === item.key)) missingData.push(item);
  }

  return {
    ...core,
    missingData,
    specialistEscalations: retinopathy.escalations,
    diabeticFootPathway,
    nutritionSupportPathway,
    trace: [
      ...core.trace,
      {
        nodeId: "retinopathy-specialist-escalation",
        status: retinopathy.escalations.length ? "branched" : "passed",
        summary: retinopathy.escalations.length
          ? `Resolved ${retinopathy.escalations.length} ophthalmology escalation(s) outside medication ranking.`
          : "No ADA 2026 prompt-retinopathy referral trigger was represented.",
        details: retinopathy.escalations.flatMap((item) => [item.reason, ...item.triggers]),
        evidence: retinopathy.escalations.flatMap((item) => item.evidence),
      },
      {
        nodeId: "diabetic-foot-safety-escalation",
        status: diabeticFootPathway.missingData.length
          ? "needs_data"
          : diabeticFootPathway.escalations.length
            ? "branched"
            : "passed",
        summary: `Diabetic-foot pathway=${diabeticFootPathway.state}; antibioticExecution=false; escalations=${diabeticFootPathway.escalations.length}.`,
        details: [
          `antibioticBoundary=${diabeticFootPathway.antibioticBoundary}`,
          ...diabeticFootPathway.actions,
          ...diabeticFootPathway.escalations.map((item) => item.reason),
        ],
        evidence: diabeticFootPathway.evidence,
      },
      {
        nodeId: "nutrition-support-safety-boundary",
        status: nutritionSupportPathway.missingData.length ? "needs_data" : "passed",
        summary: `Nutrition-support pathway=${nutritionSupportPathway.state}; prescriptionExecution=false.`,
        details: nutritionSupportPathway.actions,
        evidence: nutritionSupportPathway.evidence,
      },
    ],
  };
}
