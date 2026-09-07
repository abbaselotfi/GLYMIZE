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
 *
 * The imported policy identity and provenance are deliberately preserved.
 * Claim-timing provenance remains owned by the reviewed runtime registry rather
 * than being presented as the source of the financial coverage row.
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
      claimTiming: structuredClone(reviewed.claimTiming),
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
