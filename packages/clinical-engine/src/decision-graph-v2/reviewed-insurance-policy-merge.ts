import type { ClaimsAwareInsurancePolicyRuleV2 } from "./insurance-claims.js";
import type { DecisionGraphInventoryV2, InsurancePolicyRuleV2 } from "./types.js";

function samePolicyTarget(
  reviewed: ClaimsAwareInsurancePolicyRuleV2,
  imported: InsurancePolicyRuleV2,
) {
  if (reviewed.provider !== imported.provider) return false;
  if (reviewed.productId) return reviewed.productId === imported.productId;
  return Boolean(
    reviewed.masterDrugId &&
    imported.masterDrugId &&
    reviewed.masterDrugId === imported.masterDrugId
  );
}

/**
 * Adds only reviewed claim-timing metadata to an existing imported financial
 * policy. Timing authority never invents financial coverage, so unmatched
 * reviewed rules are ignored and ordinary coverage remains mandatory.
 */
export function mergeReviewedInsurancePoliciesV2(
  importedPolicies: readonly InsurancePolicyRuleV2[],
  reviewedPolicies: readonly ClaimsAwareInsurancePolicyRuleV2[],
): ClaimsAwareInsurancePolicyRuleV2[] {
  return importedPolicies.map((imported) => {
    const reviewed = reviewedPolicies.find((candidate) =>
      samePolicyTarget(candidate, imported)
    );
    if (!reviewed?.claimTiming) return { ...imported };
    return {
      ...imported,
      id: reviewed.id,
      claimTiming: structuredClone(reviewed.claimTiming),
      ...(reviewed.effectiveAt ? { effectiveAt: reviewed.effectiveAt } : {}),
      ...(reviewed.sourceUrl ? { sourceUrl: reviewed.sourceUrl } : {}),
      ...(reviewed.sourceReference
        ? { sourceReference: reviewed.sourceReference }
        : {}),
    };
  });
}

export function withReviewedInsurancePoliciesV2(
  inventory: DecisionGraphInventoryV2,
  reviewedPolicies: readonly ClaimsAwareInsurancePolicyRuleV2[],
): DecisionGraphInventoryV2 {
  if (!reviewedPolicies.length) return inventory;
  return {
    ...inventory,
    insurancePolicies: mergeReviewedInsurancePoliciesV2(
      inventory.insurancePolicies,
      reviewedPolicies,
    ),
  };
}
