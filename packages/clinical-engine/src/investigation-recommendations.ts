import type {
  EngineInvestigationRecommendation,
  Type2ConsiderationRequest,
  Type2DecisionFactor,
} from "@glymize/contracts";
import {
  getActiveClinicalRulePack,
  validateClinicalRulePack,
  type ClinicalInvestigationDataKey,
  type ClinicalRulePack,
} from "./rule-pack.js";

function hasDecisionFactor(request: Type2ConsiderationRequest, factor: Type2DecisionFactor) {
  if (request.factors.includes(factor)) return true;
  if (factor === "ascvd") return Boolean(request.clinicalContext?.cardiovascular?.ascvd);
  if (factor === "heart_failure") return Boolean(request.clinicalContext?.cardiovascular?.heartFailure);
  if (factor === "ckd") return Boolean(request.clinicalContext?.kidney?.ckd);
  if (factor === "masld_mash") return Boolean(request.clinicalContext?.liver?.masldMash);
  if (factor === "pregnancy") return Boolean(request.clinicalContext?.pregnancy);
  return false;
}

function valueForRequiredData(
  request: Type2ConsiderationRequest,
  key: ClinicalInvestigationDataKey,
): unknown {
  const context = request.clinicalContext;
  if (key === "kidney.eGfr") return context?.kidney?.eGfr ?? request.eGfr;
  if (key === "kidney.uacrMgG") return context?.kidney?.uacrMgG;
  if (key === "kidney.potassiumMmolL") return context?.kidney?.potassiumMmolL;
  if (key === "cardiovascular.lvefPercent") return context?.cardiovascular?.lvefPercent;
  if (key === "liver.fibrosisStage") return context?.liver?.fibrosisStage;
  if (key === "liver.liverStiffnessKpa") return context?.liver?.liverStiffnessKpa;
  if (key === "liver.astUeL") return context?.liver?.astUeL;
  if (key === "liver.altUeL") return context?.liver?.altUeL;
  if (key === "liver.plateletCount10e9L") return context?.liver?.plateletCount10e9L;
  if (key === "anthropometrics.weightKg") return context?.anthropometrics?.weightKg;
  return context?.anthropometrics?.heightCm;
}

function hasRequiredData(request: Type2ConsiderationRequest, key: ClinicalInvestigationDataKey) {
  const value = valueForRequiredData(request, key);
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/**
 * Projects approved missing-data rule actions into a non-order recommendation
 * channel. Missing data alone can never create an action: the rule pack must be
 * approved, valid, source-bound and explicitly name the Type 2 factor that makes
 * the datum relevant to the current decision.
 *
 * The returned objects are engine recommendations only. They carry no order id,
 * are not persisted as PhysicianInvestigationOrder, and cannot enter a signed
 * Final Plan without a separate physician accept/modify action.
 */
export function resolveEngineInvestigationRecommendations(
  request: Type2ConsiderationRequest,
  pack: ClinicalRulePack = getActiveClinicalRulePack(),
): EngineInvestigationRecommendation[] {
  if (pack.status !== "approved") return [];
  if (validateClinicalRulePack(pack).length > 0) return [];

  const recommendations: EngineInvestigationRecommendation[] = [];
  const emitted = new Set<string>();

  for (const rule of pack.rules) {
    for (const action of rule.missingDataActions ?? []) {
      if (!hasDecisionFactor(request, action.requiresFactor)) continue;
      if (hasRequiredData(request, action.requiredDataKey)) continue;

      const dedupeKey = [
        action.investigationKey,
        action.requiredDataKey,
        rule.id,
      ].join("|");
      if (emitted.has(dedupeKey)) continue;
      emitted.add(dedupeKey);

      recommendations.push({
        action: "REQUEST_INVESTIGATION",
        investigationKey: action.investigationKey,
        requiredDataKey: action.requiredDataKey,
        reasonCode: action.reasonCode,
        timing: action.timing,
        priority: action.priority,
        blocksDecision: action.blocksDecision,
        ruleId: rule.id,
        rulePackVersion: pack.version,
        sourceIds: [...rule.sourceIds],
      });
    }
  }

  return recommendations.sort((left, right) =>
    left.ruleId.localeCompare(right.ruleId) ||
    left.investigationKey.localeCompare(right.investigationKey) ||
    left.requiredDataKey.localeCompare(right.requiredDataKey),
  );
}
