import { describe, expect, it } from "vitest";
import { estimateScheduledInsuranceClaimsV2 } from "../src/decision-graph-v2/insurance-claims.js";
import {
  mergeInsuranceClaimTimingPoliciesV2,
  type InsuranceClaimTimingPolicyV2,
} from "../src/decision-graph-v2/insurance-claim-timing-policy.js";
import type {
  InsurancePolicyRuleV2,
  IranMarketProductV2,
} from "../src/decision-graph-v2/types.js";

const masterDrugId = "TEST-SEMAGLUTIDE-CLAIMS";

function product(id: string, strength: number): IranMarketProductV2 {
  return {
    productId: id,
    masterDrugId,
    nfiMatchState: "verified",
    genericName: "Semaglutide",
    brandName: "Wegovy",
    dosageFormGroup: "injection_pen",
    route: "subcutaneous",
    consumptionUnit: "pen",
    strengthComponents: [{ ingredientKey: masterDrugId, amount: strength, unit: "mg" }],
    consumptionUnitsPerPurchaseUnit: 4,
    purchaseUnitLabel: "box",
    priceToman: 4_000_000,
    license: { everValid: true, currentValid: true, revoked: false },
    marketPresence: "confirmed_active",
    observedAt: "2026-09-01T00:00:00.000Z",
  };
}

const p025 = product("WEGOVY-025", 0.25);
const p05 = product("WEGOVY-05", 0.5);

function financialPolicy(productId: string): InsurancePolicyRuleV2 {
  return {
    id: `financial:${productId}`,
    provider: "social_security",
    productId,
    masterDrugId,
    coveragePercent: 50,
  };
}

function timingPolicy(productId: string, minimumDaysBetweenClaims = 28): InsuranceClaimTimingPolicyV2 {
  return {
    id: `timing:${productId}`,
    provider: "social_security",
    productId,
    masterDrugId,
    reviewState: "approved",
    claimTiming: {
      groupKey: "wegovy-semglutide-strength-switch",
      windowDays: 30,
      maxClaimsPerWindow: 2,
      minimumDaysBetweenClaims,
      allowDistinctProductsWithinWindow: true,
    },
  };
}

const claims = [
  { productId: p025.productId, claimDay: 1, purchaseUnits: 1 },
  { productId: p05.productId, claimDay: 29, purchaseUnits: 1 },
] as const;

describe("scheduled insurance claims v2", () => {
  it("fails closed when ordinary coverage has no explicit multi-claim timing authority", () => {
    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims,
      products: [p025, p05],
      providers: ["social_security"],
      policies: [financialPolicy(p025.productId), financialPolicy(p05.productId)],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.eligibility).toBe("unknown");
    expect(result[0]?.patientCostIfEligibleToman).toBe(8_000_000);
    expect(result[0]?.insurerCostIfEligibleToman).toBe(0);
    expect(result[0]?.conditions.join(" ")).toContain("Claim timing");
  });

  it("merges reviewed timing onto existing financial policies before multi-claim coverage can be used", () => {
    const policies = mergeInsuranceClaimTimingPoliciesV2(
      [financialPolicy(p025.productId), financialPolicy(p05.productId)],
      [timingPolicy(p025.productId), timingPolicy(p05.productId)],
    );
    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims,
      products: [p025, p05],
      providers: ["social_security"],
      policies,
    });

    expect(result[0]?.eligibility).toBe("eligible");
    expect(result[0]?.patientCostIfEligibleToman).toBe(4_000_000);
    expect(result[0]?.insurerCostIfEligibleToman).toBe(4_000_000);
    expect(result[0]?.sourcePolicyIds).toEqual([
      "financial:WEGOVY-025",
      "timing:WEGOVY-025",
      "financial:WEGOVY-05",
      "timing:WEGOVY-05",
    ]);
  });

  it("marks a schedule ineligible when its reviewed minimum claim spacing is violated", () => {
    const policies = mergeInsuranceClaimTimingPoliciesV2(
      [financialPolicy(p025.productId), financialPolicy(p05.productId)],
      [timingPolicy(p025.productId, 30), timingPolicy(p05.productId, 30)],
    );
    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims,
      products: [p025, p05],
      providers: ["social_security"],
      policies,
    });

    expect(result[0]?.eligibility).toBe("ineligible");
    expect(result[0]?.patientCostIfEligibleToman).toBe(8_000_000);
    expect(result[0]?.insurerCostIfEligibleToman).toBe(0);
    expect(result[0]?.conditions.join(" ")).toContain("28");
  });

  it("reuses ordinary product insurance for a single claim without inventing timing requirements", () => {
    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims: [{ productId: p05.productId, claimDay: 4, purchaseUnits: 1 }],
      products: [p05],
      providers: ["social_security"],
      policies: [financialPolicy(p05.productId)],
    });

    expect(result[0]?.eligibility).toBe("eligible");
    expect(result[0]?.patientCostIfEligibleToman).toBe(2_000_000);
    expect(result[0]?.insurerCostIfEligibleToman).toBe(2_000_000);
  });

  it("never turns a timing-only supplement into financial coverage", () => {
    const policies = mergeInsuranceClaimTimingPoliciesV2(
      [],
      [timingPolicy(p025.productId), timingPolicy(p05.productId)],
    );
    expect(policies).toEqual([]);

    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims,
      products: [p025, p05],
      providers: ["social_security"],
      policies,
    });
    expect(result[0]?.eligibility).toBe("unknown");
    expect(result[0]?.insurerCostIfEligibleToman).toBe(0);
  });

  it("fails closed when more than one reviewed timing policy matches the same financial policy", () => {
    const duplicate = {
      ...timingPolicy(p025.productId),
      id: "timing:WEGOVY-025:duplicate",
    };
    const policies = mergeInsuranceClaimTimingPoliciesV2(
      [financialPolicy(p025.productId), financialPolicy(p05.productId)],
      [timingPolicy(p025.productId), duplicate, timingPolicy(p05.productId)],
    );
    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims,
      products: [p025, p05],
      providers: ["social_security"],
      policies,
    });
    expect(result[0]?.eligibility).toBe("unknown");
  });
});
