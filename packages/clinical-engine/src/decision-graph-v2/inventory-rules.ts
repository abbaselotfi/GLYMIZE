import type { DecisionGraphInventoryV2 } from "./types.js";
import { normalizeDecisionGraphClinicalKnowledgeV2 } from "./clinical-normalization.js";
import { buildReviewedProductDoseRulesV2, buildReviewedTitrationProtocolsV2 } from "./product-dose-rules.js";
import { buildAda2026InsulinDoseRulesV2 } from "./insulin-rules.js";
import { buildReviewedInsulinConversionRulesV2 } from "./insulin-execution.js";
import { buildAutoFrcProtocolBindingsV2, buildReviewedFrcDoseRulesV2 } from "./frc-protocols.js";
import { buildCoreAda2026DecisionRulesV2 } from "./safety-rules.js";

function mergeById<T extends { id: string }>(base: readonly T[], incoming: readonly T[]) {
  const map = new Map<string, T>();
  for (const item of base) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

/**
 * Applies reviewed executable knowledge to the contract-derived inventory.
 * No UI state and no medication score is introduced here.
 */
export function applyCoreClinicalRulesToInventoryV2(inventory: DecisionGraphInventoryV2) {
  const normalized = normalizeDecisionGraphClinicalKnowledgeV2(inventory);
  const autoFrc = buildAutoFrcProtocolBindingsV2(normalized.inventory);
  const frcProtocolBindings = mergeById(normalized.inventory.frcProtocolBindings ?? [], autoFrc.bindings);
  const withBindings: DecisionGraphInventoryV2 = { ...normalized.inventory, frcProtocolBindings };

  const rules = buildCoreAda2026DecisionRulesV2(withBindings.knowledge);
  const insulinDoseRules = buildAda2026InsulinDoseRulesV2(withBindings.knowledge);
  const productDoseRules = buildReviewedProductDoseRulesV2(withBindings);
  const titrationProtocols = mergeById(withBindings.titrationProtocols ?? [], buildReviewedTitrationProtocolsV2(withBindings));
  const frcDoseRules = buildReviewedFrcDoseRulesV2(withBindings);
  const insulinConversionRules = mergeById(withBindings.insulinConversionRules ?? [], buildReviewedInsulinConversionRulesV2(withBindings.knowledge));
  const doseRules = mergeById(
    mergeById(
      mergeById(withBindings.doseRules, insulinDoseRules),
      productDoseRules,
    ),
    frcDoseRules,
  );

  return {
    inventory: {
      ...withBindings,
      doseRules,
      medicationGateRules: mergeById(withBindings.medicationGateRules ?? [], rules.medicationGateRules),
      regimenConflictRules: mergeById(withBindings.regimenConflictRules ?? [], rules.regimenConflictRules),
      insulinConversionRules,
      titrationProtocols,
    },
    report: {
      knowledgeNormalization: normalized.report,
      addedInsulinDoseRules: insulinDoseRules.length,
      addedProductDoseRules: productDoseRules.length,
      addedFrcDoseRules: frcDoseRules.length,
      autoFrcBindings: autoFrc.bindings.length,
      frcBindingIssues: autoFrc.issues,
      insulinConversionRules: insulinConversionRules.length,
      titrationProtocols: titrationProtocols.length,
      addedMedicationGateRules: rules.medicationGateRules.length,
      addedRegimenConflictRules: rules.regimenConflictRules.length,
    },
  };
}
