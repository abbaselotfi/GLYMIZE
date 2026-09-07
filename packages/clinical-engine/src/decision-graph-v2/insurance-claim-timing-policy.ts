import type { InsurancePolicyRuleV2 } from "./types.js";
import type {
  ClaimsAwareInsurancePolicyRuleV2,
  InsuranceClaimTimingRuleV2,
} from "./insurance-claims.js";

/**
 * Canonical reviewed claim-timing supplement delivered by a trusted runtime
 * source. It is intentionally separate from financial coverage authority.
 */
export interface InsuranceClaimTimingPolicyV2 {
  id: string;
  provider: string;
  productId?: string;
  masterDrugId?: string;
  claimTiming: InsuranceClaimTimingRuleV2;
  reviewState: "approved";
  effectiveAt?: string;
  sourceReference?: string;
}

function timingPolicyForFinancialPolicy(
  financial: InsurancePolicyRuleV2,
  timingPolicies: readonly InsuranceClaimTimingPolicyV2[],
) {
  if (financial.productId) {
    const exact = timingPolicies.filter((policy) =>
      policy.reviewState === "approved" &&
      policy.provider === financial.provider &&
      policy.productId === financial.productId,
    );
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return undefined;
  }

  if (!financial.masterDrugId) return undefined;
  const master = timingPolicies.filter((policy) =>
    policy.reviewState === "approved" &&
    policy.provider === financial.provider &&
    !policy.productId &&
    policy.masterDrugId === financial.masterDrugId,
  );
  return master.length === 1 ? master[0] : undefined;
}

/**
 * Merge timing metadata only onto financial policies that already exist.
 *
 * A timing-only policy is never appended to the insurance policy inventory and
 * therefore cannot create coverage, eligibility, patient share, or insurer
 * share on its own. Ambiguous timing matches fail closed by attaching nothing.
 */
export function mergeInsuranceClaimTimingPoliciesV2(
  financialPolicies: readonly InsurancePolicyRuleV2[],
  timingPolicies: readonly InsuranceClaimTimingPolicyV2[],
): ClaimsAwareInsurancePolicyRuleV2[] {
  return financialPolicies.map((financial) => {
    const timing = timingPolicyForFinancialPolicy(financial, timingPolicies);
    if (!timing) return { ...financial };
    return {
      ...financial,
      claimTiming: structuredClone(timing.claimTiming),
      claimTimingPolicyId: timing.id,
    };
  });
}
