import { describe, expect, it } from "vitest";
import { type2ClaimPolicyRoute } from "../src/platform-type2-claim-policy";
import {
  activeReviewedType2ClaimPolicies,
  reviewedType2ClaimPolicies,
  validateReviewedType2ClaimPolicies,
} from "../src/type2-claim-policy-registry";

const reviewedPolicy = {
  id: "tamin:wegovy:2026-09",
  provider: "social_security",
  productId: "WEGOVY-025",
  effectiveAt: "2026-09-01T00:00:00.000Z",
  sourceReference: "reviewed-tamin-policy-2026-09",
  sourceUrl: "https://example.test/reviewed-policy",
  claimTiming: {
    groupKey: "wegovy-strength-switch",
    windowDays: 30,
    maxClaimsPerWindow: 2,
    minimumDaysBetweenClaims: 28,
    allowDistinctProductsWithinWindow: true,
  },
} as const;

describe("trusted Type-2 claim policy boundary", () => {
  it("keeps the production registry empty until reviewed authority exists", () => {
    expect(reviewedType2ClaimPolicies()).toEqual([]);
  });

  it("requires reviewed provenance and bounded timing metadata", () => {
    const policies = validateReviewedType2ClaimPolicies([reviewedPolicy]);
    expect(policies[0]?.claimTiming.minimumDaysBetweenClaims).toBe(28);
    expect(policies[0]?.sourceReference).toBe("reviewed-tamin-policy-2026-09");
  });

  it("does not activate a reviewed policy before its effectiveAt", () => {
    const beforeEffective = Date.parse("2026-08-31T23:59:59.999Z");
    const atEffective = Date.parse("2026-09-01T00:00:00.000Z");
    expect(activeReviewedType2ClaimPolicies([reviewedPolicy], beforeEffective)).toEqual([]);
    expect(activeReviewedType2ClaimPolicies([reviewedPolicy], atEffective)).toHaveLength(1);
  });

  it("rejects duplicate provider/target authority", () => {
    expect(() => validateReviewedType2ClaimPolicies([
      reviewedPolicy,
      { ...reviewedPolicy, id: "two" },
    ])).toThrow(/TYPE2_CLAIM_POLICY_DUPLICATE_TARGET/);
  });

  it("fails closed on malformed timing configuration", () => {
    expect(() => validateReviewedType2ClaimPolicies([{
      id: "bad",
      provider: "social_security",
      productId: "WEGOVY-025",
      effectiveAt: "2026-09-01T00:00:00.000Z",
      sourceReference: "reviewed-policy",
      claimTiming: {
        groupKey: "wegovy",
        windowDays: 30,
        maxClaimsPerWindow: 2,
        minimumDaysBetweenClaims: -1,
        allowDistinctProductsWithinWindow: true,
      },
    }])).toThrow(/TYPE2_CLAIM_POLICY_TIMING_INVALID/);
  });

  it("requires runtime authentication before exposing the registry", async () => {
    const response = await type2ClaimPolicyRoute(
      new Request("https://worker.example.test/v1/clinical/type2/insurance-claim-policies"),
      {
        ADMIN_ORIGIN: "https://rc.example.test",
        SESSION_SECRET: "test-session-secret",
      },
    );
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "auth_required" });
  });
});
