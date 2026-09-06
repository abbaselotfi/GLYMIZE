import { estimateInsuranceCostV2 } from "./insurance.js";
import type {
  ClinicianContextV2,
  InsurancePolicyRuleV2,
  IranMarketProductV2,
  RegimenComponentV2,
} from "./types.js";

/**
 * Explicit insurer claim-timing authority for schedules that may require more
 * than one product claim inside the same treatment window.
 *
 * This is deliberately not inferred from ordinary NFI coverage rows. A caller
 * must supply a reviewed internal InsurancePolicyRuleV2 carrying this metadata
 * before a multi-claim schedule can become usable for `insured_only`.
 */
export interface InsuranceClaimTimingRuleV2 {
  groupKey: string;
  windowDays: number;
  maxClaimsPerWindow: number;
  minimumDaysBetweenClaims: number;
  allowDistinctProductsWithinWindow: boolean;
}

export type ClaimsAwareInsurancePolicyRuleV2 = InsurancePolicyRuleV2 & {
  claimTiming?: InsuranceClaimTimingRuleV2;
};

export interface ScheduledInsuranceClaimV2 {
  productId: string;
  claimDay: number;
  purchaseUnits: number;
}

export interface ScheduledInsuranceProjectionV2 {
  provider: string;
  eligibility: "eligible" | "conditional" | "ineligible" | "unknown";
  windowDays: number;
  claims: ScheduledInsuranceClaimV2[];
  patientCostIfEligibleToman: number;
  insurerCostIfEligibleToman: number;
  conditions: string[];
  sourcePolicyIds: string[];
}

export type ClaimsAwareRegimenComponentV2 = RegimenComponentV2 & {
  scheduledInsuranceProjections?: ScheduledInsuranceProjectionV2[];
};

function positiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function policyForProduct(
  product: IranMarketProductV2,
  provider: string,
  policies: readonly InsurancePolicyRuleV2[],
): InsurancePolicyRuleV2 | undefined {
  const exact = policies.find((policy) => policy.provider === provider && policy.productId === product.productId);
  if (exact) return exact;
  if (!product.masterDrugId) return undefined;
  return policies.find((policy) => policy.provider === provider && policy.masterDrugId === product.masterDrugId);
}

function timingRule(policy: InsurancePolicyRuleV2 | undefined) {
  return (policy as ClaimsAwareInsurancePolicyRuleV2 | undefined)?.claimTiming;
}

function sameTimingRule(left: InsuranceClaimTimingRuleV2, right: InsuranceClaimTimingRuleV2) {
  return left.groupKey === right.groupKey &&
    left.windowDays === right.windowDays &&
    left.maxClaimsPerWindow === right.maxClaimsPerWindow &&
    left.minimumDaysBetweenClaims === right.minimumDaysBetweenClaims &&
    left.allowDistinctProductsWithinWindow === right.allowDistinctProductsWithinWindow;
}

function timingRuleIsValid(rule: InsuranceClaimTimingRuleV2) {
  return Boolean(rule.groupKey.trim()) &&
    positiveInteger(rule.windowDays) &&
    positiveInteger(rule.maxClaimsPerWindow) &&
    Number.isInteger(rule.minimumDaysBetweenClaims) &&
    rule.minimumDaysBetweenClaims >= 0;
}

function aggregateEligibility(values: Array<ScheduledInsuranceProjectionV2["eligibility"]>) {
  if (values.includes("ineligible")) return "ineligible" as const;
  if (values.includes("unknown")) return "unknown" as const;
  if (values.includes("conditional")) return "conditional" as const;
  return "eligible" as const;
}

function unknownProjection(input: {
  provider: string;
  windowDays: number;
  claims: ScheduledInsuranceClaimV2[];
  cashCostToman: number;
  condition: string;
  sourcePolicyIds?: string[];
}): ScheduledInsuranceProjectionV2 {
  return {
    provider: input.provider,
    eligibility: "unknown",
    windowDays: input.windowDays,
    claims: input.claims,
    patientCostIfEligibleToman: input.cashCostToman,
    insurerCostIfEligibleToman: 0,
    conditions: [input.condition],
    sourcePolicyIds: input.sourcePolicyIds ?? [],
  };
}

/**
 * Evaluates insurance for an already-determined zero-inventory purchase
 * schedule. It never chooses dose, product, escalation, or claim date.
 *
 * Single-claim schedules reuse the ordinary product insurance authority and do
 * not require extra timing metadata. Multi-claim schedules fail closed unless
 * every selected product resolves to an explicit, consistent claim-timing rule.
 */
export function estimateScheduledInsuranceClaimsV2(input: {
  windowDays: number;
  claims: readonly ScheduledInsuranceClaimV2[];
  products: readonly IranMarketProductV2[];
  providers: readonly string[];
  policies: readonly InsurancePolicyRuleV2[];
  clinician?: ClinicianContextV2;
}): ScheduledInsuranceProjectionV2[] {
  const { windowDays, products, providers, policies, clinician } = input;
  if (!positiveInteger(windowDays)) return [];

  const claims = [...input.claims].sort((a, b) => a.claimDay - b.claimDay || a.productId.localeCompare(b.productId));
  if (!claims.length || claims.some((claim) =>
    !positiveInteger(claim.claimDay) ||
    claim.claimDay > windowDays ||
    !positiveInteger(claim.purchaseUnits)
  )) return [];

  const productById = new Map(products.map((product) => [product.productId, product]));
  if (claims.some((claim) => !productById.has(claim.productId))) return [];

  const cashCostToman = claims.reduce((sum, claim) => {
    const price = productById.get(claim.productId)?.priceToman;
    return sum + (typeof price === "number" && Number.isFinite(price) && price > 0 ? price * claim.purchaseUnits : 0);
  }, 0);

  return providers.map((provider): ScheduledInsuranceProjectionV2 => {
    const policiesForClaims = claims.map((claim) => policyForProduct(productById.get(claim.productId)!, provider, policies));
    const sourcePolicyIds = [...new Set(policiesForClaims.flatMap((policy) => policy ? [policy.id] : []))];

    if (policiesForClaims.some((policy) => !policy)) {
      return unknownProjection({
        provider,
        windowDays,
        claims,
        cashCostToman,
        condition: "Rule بیمه‌ای ساختاریافته برای تمام claimهای این برنامه درمانی موجود نیست.",
        sourcePolicyIds,
      });
    }

    if (claims.length > 1) {
      const timingRules = policiesForClaims.map((policy) => timingRule(policy));
      if (timingRules.some((rule) => !rule)) {
        return unknownProjection({
          provider,
          windowDays,
          claims,
          cashCostToman,
          condition: "Claim timing صریح برای برنامه چند-claim ثبت نشده است؛ پوشش insured-only قابل اثبات نیست.",
          sourcePolicyIds,
        });
      }
      const first = timingRules[0]!;
      if (!timingRuleIsValid(first) || timingRules.some((rule) => !rule || !timingRuleIsValid(rule) || !sameTimingRule(first, rule))) {
        return unknownProjection({
          provider,
          windowDays,
          claims,
          cashCostToman,
          condition: "Claim timing بیمه برای محصولات این برنامه ناقص یا ناسازگار است.",
          sourcePolicyIds,
        });
      }
      if (first.windowDays !== windowDays) {
        return unknownProjection({
          provider,
          windowDays,
          claims,
          cashCostToman,
          condition: `Claim timing فقط برای پنجره ${first.windowDays} روزه تأیید شده و به پنجره ${windowDays} روزه تعمیم داده نمی‌شود.`,
          sourcePolicyIds,
        });
      }
      if (claims.length > first.maxClaimsPerWindow) {
        return {
          provider,
          eligibility: "ineligible",
          windowDays,
          claims,
          patientCostIfEligibleToman: cashCostToman,
          insurerCostIfEligibleToman: 0,
          conditions: [`تعداد claimها (${claims.length}) از سقف تأییدشده ${first.maxClaimsPerWindow} در ${windowDays} روز بیشتر است.`],
          sourcePolicyIds,
        };
      }
      if (!first.allowDistinctProductsWithinWindow && new Set(claims.map((claim) => claim.productId)).size > 1) {
        return {
          provider,
          eligibility: "ineligible",
          windowDays,
          claims,
          patientCostIfEligibleToman: cashCostToman,
          insurerCostIfEligibleToman: 0,
          conditions: ["Rule claim بیمه تغییر محصول/strength را در این پنجره مجاز نمی‌داند."],
          sourcePolicyIds,
        };
      }
      for (let index = 1; index < claims.length; index += 1) {
        const gap = claims[index]!.claimDay - claims[index - 1]!.claimDay;
        if (gap < first.minimumDaysBetweenClaims) {
          return {
            provider,
            eligibility: "ineligible",
            windowDays,
            claims,
            patientCostIfEligibleToman: cashCostToman,
            insurerCostIfEligibleToman: 0,
            conditions: [`فاصله ${gap} روزه بین claimها از حداقل تأییدشده ${first.minimumDaysBetweenClaims} روز کمتر است.`],
            sourcePolicyIds,
          };
        }
      }
    }

    const totalsByProduct = new Map<string, number>();
    for (const claim of claims) {
      totalsByProduct.set(claim.productId, (totalsByProduct.get(claim.productId) ?? 0) + claim.purchaseUnits);
    }

    const estimates = [...totalsByProduct.entries()].flatMap(([productId, purchaseUnits]) => {
      const product = productById.get(productId)!;
      return estimateInsuranceCostV2({
        product,
        purchaseUnitsNeeded30Days: purchaseUnits,
        providers: [provider],
        policies,
        clinician,
      });
    });

    if (estimates.length !== totalsByProduct.size) {
      return unknownProjection({
        provider,
        windowDays,
        claims,
        cashCostToman,
        condition: "برآورد مالی بیمه برای تمام محصولات برنامه قابل محاسبه نیست.",
        sourcePolicyIds,
      });
    }

    return {
      provider,
      eligibility: aggregateEligibility(estimates.map((estimate) => estimate.eligibility)),
      windowDays,
      claims,
      patientCostIfEligibleToman: estimates.reduce((sum, estimate) => sum + estimate.patientCostIfEligibleToman, 0),
      insurerCostIfEligibleToman: estimates.reduce((sum, estimate) => sum + estimate.insurerCostIfEligibleToman, 0),
      conditions: [...new Set(estimates.flatMap((estimate) => estimate.conditions))],
      sourcePolicyIds,
    };
  });
}

export function attachScheduledInsuranceProjectionsV2(
  component: RegimenComponentV2,
  projections: ScheduledInsuranceProjectionV2[],
) {
  (component as ClaimsAwareRegimenComponentV2).scheduledInsuranceProjections = projections;
}

export function scheduledInsuranceProjectionsV2(component: RegimenComponentV2) {
  return (component as ClaimsAwareRegimenComponentV2).scheduledInsuranceProjections ?? [];
}

export function bestScheduledInsuranceFitV2(projections: readonly ScheduledInsuranceProjectionV2[]) {
  if (projections.some((item) => item.eligibility === "eligible")) return "eligible" as const;
  if (projections.some((item) => item.eligibility === "conditional")) return "conditional" as const;
  if (!projections.length || projections.some((item) => item.eligibility === "unknown")) return "unknown" as const;
  return "not_covered" as const;
}

export function lowestUsableScheduledPatientCostV2(projections: readonly ScheduledInsuranceProjectionV2[]) {
  const usable = projections.filter((item) => item.eligibility === "eligible" || item.eligibility === "conditional");
  return usable.length ? Math.min(...usable.map((item) => item.patientCostIfEligibleToman)) : undefined;
}
