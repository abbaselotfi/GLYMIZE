import { describe, expect, it } from "vitest";
import {
  estimateScheduledInsuranceClaimsV2,
  type ClaimsAwareInsurancePolicyRuleV2,
} from "../src/decision-graph-v2/insurance-claims.js";
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

function claimsPolicy(productId: string, minimumDaysBetweenClaims = 28): ClaimsAwareInsurancePolicyRuleV2 {
  return {
    ...financialPolicy(productId),
    id: `claims:${productId}`,
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

  it("aggregates exact per-product insurance only after an explicit compatible 28-day claim rule", () => {
    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims,
      products: [p025, p05],
      providers: ["social_security"],
      policies: [claimsPolicy(p025.productId), claimsPolicy(p05.productId)],
    });

    expect(result[0]?.eligibility).toBe("eligible");
    expect(result[0]?.patientCostIfEligibleToman).toBe(4_000_000);
    expect(result[0]?.insurerCostIfEligibleToman).toBe(4_000_000);
    expect(result[0]?.sourcePolicyIds).toEqual(["claims:WEGOVY-025", "claims:WEGOVY-05"]);
  });

  it("marks a schedule ineligible when its explicit minimum claim spacing is violated", () => {
    const result = estimateScheduledInsuranceClaimsV2({
      windowDays: 30,
      claims,
      products: [p025, p05],
      providers: ["social_security"],
      policies: [claimsPolicy(p025.productId, 30), claimsPolicy(p05.productId, 30)],
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
});
