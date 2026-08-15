import type {
  EngineInvestigationRecommendation,
} from "@glymize/contracts";
import type {
  ClinicalRulePack,
} from "./rule-pack.js";

export function buildInvestigationRecommendations(
  pack: ClinicalRulePack,
  availableDataKeys: Iterable<string>,
): EngineInvestigationRecommendation[] {
  if (pack.status !== "approved") return [];

  const available = new Set(availableDataKeys);
  const seen = new Set<string>();
  const output: EngineInvestigationRecommendation[] = [];

  for (const rule of pack.rules) {
    for (const action of rule.missingDataActions ?? []) {
      if (available.has(action.requiredDataKey)) continue;

      const key = [
        rule.id,
        action.requiredDataKey,
        action.investigationKey,
      ].join("|");

      if (seen.has(key)) continue;
      seen.add(key);

      output.push({
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

  return output;
}
