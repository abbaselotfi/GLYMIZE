import type { DecisionGraphInventoryV2 } from "./types.js";
import { normalizeDecisionGraphClinicalKnowledgeV2 } from "./clinical-normalization.js";
import { buildReviewedProductDoseRulesV2, buildReviewedTitrationProtocolsV2 } from "./product-dose-rules.js";
import { buildAda2026InsulinDoseRulesV2 } from "./insulin-rules.js";
import { buildReviewedInsulinConversionRulesV2 } from "./insulin-execution.js";
import { buildAutoFrcProtocolBindingsV2, buildReviewedFrcDoseRulesV2 } from "./frc-protocols.js";
import { buildCoreAda2026DecisionRulesV2 } from "./safety-rules.js";
import {
  buildReviewedCardiometabolicDoseRulesV2,
  buildReviewedCardiometabolicGateRulesV2,
} from "./cardiometabolic-protocols.js";
import {
  applyReviewedMashKnowledgeV2,
  buildReviewedMashDoseRulesV2,
} from "./mash-protocols.js";
import {
  applyReviewedWegovyMashKnowledgeV2,
  buildReviewedWegovyMashDoseRulesV2,
  buildReviewedWegovyMashTitrationProtocolsV2,
} from "./wegovy-mash-protocol.js";

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
  const resmetiromKnowledge = applyReviewedMashKnowledgeV2(normalized.inventory);
  const mashKnowledge = applyReviewedWegovyMashKnowledgeV2(resmetiromKnowledge);
  const autoFrc = buildAutoFrcProtocolBindingsV2(mashKnowledge);
  const frcProtocolBindings = mergeById(mashKnowledge.frcProtocolBindings ?? [], autoFrc.bindings);
  const withBindings: DecisionGraphInventoryV2 = { ...mashKnowledge, frcProtocolBindings };

  const rules = buildCoreAda2026DecisionRulesV2(withBindings.knowledge);
  const insulinDoseRules = buildAda2026InsulinDoseRulesV2(withBindings.knowledge);
  const productDoseRules = buildReviewedProductDoseRulesV2(withBindings);
  const cardiometabolicDoseRules = buildReviewedCardiometabolicDoseRulesV2(withBindings);
  const cardiometabolicGateRules = buildReviewedCardiometabolicGateRulesV2(withBindings.knowledge);
  const mashDoseRules = buildReviewedMashDoseRulesV2(withBindings);
  const wegovyMashDoseRules = buildReviewedWegovyMashDoseRulesV2(withBindings);
  const titrationProtocols = mergeById(
    mergeById(withBindings.titrationProtocols ?? [], buildReviewedTitrationProtocolsV2(withBindings)),
    buildReviewedWegovyMashTitrationProtocolsV2(withBindings),
  );
  const frcDoseRules = buildReviewedFrcDoseRulesV2(withBindings);
  const insulinConversionRules = mergeById(withBindings.insulinConversionRules ?? [], buildReviewedInsulinConversionRulesV2(withBindings.knowledge));
  const doseRules = mergeById(
    mergeById(
      mergeById(
        mergeById(
          mergeById(
            mergeById(withBindings.doseRules, insulinDoseRules),
            productDoseRules,
          ),
          cardiometabolicDoseRules,
        ),
        mashDoseRules,
      ),
      wegovyMashDoseRules,
    ),
    frcDoseRules,
  );
  const medicationGateRules = mergeById(
    mergeById(withBindings.medicationGateRules ?? [], rules.medicationGateRules),
    cardiometabolicGateRules,
  );

  return {
    inventory: {
      ...withBindings,
      doseRules,
      medicationGateRules,
      regimenConflictRules: mergeById(withBindings.regimenConflictRules ?? [], rules.regimenConflictRules),
      insulinConversionRules,
      titrationProtocols,
    },
    report: {
      knowledgeNormalization: normalized.report,
      addedInsulinDoseRules: insulinDoseRules.length,
      addedProductDoseRules: productDoseRules.length,
      addedCardiometabolicDoseRules: cardiometabolicDoseRules.length,
      addedMashDoseRules: mashDoseRules.length,
      addedWegovyMashDoseRules: wegovyMashDoseRules.length,
      addedFrcDoseRules: frcDoseRules.length,
      autoFrcBindings: autoFrc.bindings.length,
      frcBindingIssues: autoFrc.issues,
      insulinConversionRules: insulinConversionRules.length,
      titrationProtocols: titrationProtocols.length,
      addedMedicationGateRules: rules.medicationGateRules.length + cardiometabolicGateRules.length,
      addedCardiometabolicGateRules: cardiometabolicGateRules.length,
      addedRegimenConflictRules: rules.regimenConflictRules.length,
    },
  };
}
