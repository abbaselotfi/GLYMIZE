import { runDecisionGraphV2 } from "./engine.js";
import {
  resolveRetinopathySpecialistEscalationV2,
  type DecisionGraphRequestWithRetinopathyV2,
  type DecisionGraphResultWithSpecialistEscalationsV2,
} from "./retinopathy-escalation.js";
import type { DecisionGraphPolicyV2 } from "./types.js";

/**
 * Additive execution wrapper for specialist/escalation pathways that must never
 * become medication-ranking authority in the general Decision Graph.
 *
 * The core treatment result is preserved byte-for-byte in structure; specialist
 * escalations are appended as a separate channel. This keeps ophthalmology
 * referral semantics orthogonal to medication candidates and scoring/ranking.
 */
export function runDecisionGraphV2WithSpecialistEscalations(
  request: DecisionGraphRequestWithRetinopathyV2,
  policy?: DecisionGraphPolicyV2,
): DecisionGraphResultWithSpecialistEscalationsV2 {
  const core = policy ? runDecisionGraphV2(request, policy) : runDecisionGraphV2(request);
  const retinopathy = resolveRetinopathySpecialistEscalationV2(request);

  const missingData = [...core.missingData];
  for (const item of retinopathy.missingData) {
    if (!missingData.some((existing) => existing.key === item.key)) missingData.push(item);
  }

  return {
    ...core,
    missingData,
    specialistEscalations: retinopathy.escalations,
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
    ],
  };
}
