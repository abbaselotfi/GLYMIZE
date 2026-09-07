import { describe, expect, it } from "vitest";
import { mergeReviewedInsurancePoliciesV2 } from "../src/decision-graph-v2/reviewed-insurance-policy-merge.js";
import type { ClaimsAwareInsurancePolicyRuleV2 } from "../src/decision-graph-v2/insurance-claims.js";
import type { InsurancePolicyRuleV2 } from "../src/decision-graph-v2/types.js";

describe("reviewed insurance claim timing merge v2", () => {
  it("adds reviewed timing without replacing imported financial authority or provenance", () => {
    const imported: InsurancePolicyRuleV2[] = [{
      id: "imported:wegovy:social_security",
      provider: "social_security",
      productId: "WEGOVY-025",
      coveragePercent: 50,
      referencePriceTomanPerPurchaseUnit: 4_000_000,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      sourceReference: "financial-coverage-source",
      sourceUrl: "https://example.test/financial-coverage",
    }];
    const reviewed: ClaimsAwareInsurancePolicyRuleV2[] = [{
      id: "reviewed:tamin:wegovy:2026-09",
      provider: "social_security",
      productId: "WEGOVY-025",
      effectiveAt: "2026-09-01T00:00:00.000Z",
      sourceReference: "reviewed-claim-timing-source",
      sourceUrl: "https://example.test/claim-timing",
      claimTiming: {
        groupKey: "wegovy-strength-switch",
        windowDays: 30,
        maxClaimsPerWindow: 2,
        minimumDaysBetweenClaims: 28,
        allowDistinctProductsWithinWindow: true,
      },
    }];

    const merged = mergeReviewedInsurancePoliciesV2(imported, reviewed);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("imported:wegovy:social_security");
    expect(merged[0]?.coveragePercent).toBe(50);
    expect(merged[0]?.referencePriceTomanPerPurchaseUnit).toBe(4_000_000);
    expect(merged[0]?.effectiveAt).toBe("2026-08-01T00:00:00.000Z");
    expect(merged[0]?.sourceReference).toBe("financial-coverage-source");
    expect(merged[0]?.sourceUrl).toBe("https://example.test/financial-coverage");
    expect(merged[0]?.claimTiming?.minimumDaysBetweenClaims).toBe(28);
  });

  it("ignores unmatched timing metadata because timing does not prove coverage", () => {
    const reviewed: ClaimsAwareInsurancePolicyRuleV2[] = [{
      id: "reviewed:unknown-product",
      provider: "social_security",
      productId: "OTHER",
      effectiveAt: "2026-09-01T00:00:00.000Z",
      sourceReference: "reviewed-policy",
      claimTiming: {
        groupKey: "other",
        windowDays: 30,
        maxClaimsPerWindow: 2,
        minimumDaysBetweenClaims: 28,
        allowDistinctProductsWithinWindow: true,
      },
    }];
    expect(mergeReviewedInsurancePoliciesV2([], reviewed)).toEqual([]);
  });
});
