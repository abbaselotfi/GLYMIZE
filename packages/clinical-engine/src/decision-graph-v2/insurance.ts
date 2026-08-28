import type {
  ClinicianContextV2,
  InsuranceCostEstimateV2,
  InsurancePolicyRuleV2,
  IranMarketProductV2,
} from "./types.js";

function policyForProduct(
  product: IranMarketProductV2,
  provider: string,
  policies: readonly InsurancePolicyRuleV2[],
) {
  const exact = policies.find((policy) => policy.provider === provider && policy.productId === product.productId);
  if (exact) return exact;
  if (product.masterDrugId) {
    return policies.find((policy) => policy.provider === provider && policy.masterDrugId === product.masterDrugId);
  }
  return undefined;
}

export function estimateInsuranceCostV2(input: {
  product: IranMarketProductV2;
  purchaseUnitsNeeded30Days: number;
  providers: readonly string[];
  policies: readonly InsurancePolicyRuleV2[];
  clinician?: ClinicianContextV2;
}): InsuranceCostEstimateV2[] {
  const { product, purchaseUnitsNeeded30Days, providers, policies, clinician } = input;
  const priceToman = product.priceToman;
  if (priceToman === undefined) return [];

  return providers.map((provider) => {
    const policy = policyForProduct(product, provider, policies);
    if (!policy) {
      return {
        provider,
        eligibility: "unknown" as const,
        coveredPurchaseUnits: 0,
        uncoveredPurchaseUnits: purchaseUnitsNeeded30Days,
        patientCostIfEligibleToman: priceToman * purchaseUnitsNeeded30Days,
        insurerCostIfEligibleToman: 0,
        conditions: ["Rule بیمه‌ای ساختاریافته برای این محصول/ژنریک موجود نیست."],
        genericRegistryCode: product.genericRegistryCode,
        brandRegistryCode: product.brandRegistryCode,
      };
    }

    const conditions = [...(policy.conditions ?? [])];
    let eligibility: InsuranceCostEstimateV2["eligibility"] = "eligible";
    if (policy.approvedSpecialties?.length) {
      if (!clinician?.specialty) {
        eligibility = "conditional";
        conditions.push(`تخصص مجاز: ${policy.approvedSpecialties.join("، ")}`);
      } else if (!policy.approvedSpecialties.includes(clinician.specialty)) {
        eligibility = "ineligible";
        conditions.push(`تخصص ${clinician.specialty} در فهرست تخصص‌های مجاز این Rule نیست.`);
      }
    }
    if (policy.requiresPriorAuthorization) { eligibility = eligibility === "ineligible" ? eligibility : "conditional"; conditions.push("نیازمند تأیید قبلی بیمه"); }
    if (policy.requiresDossier) { eligibility = eligibility === "ineligible" ? eligibility : "conditional"; conditions.push("نیازمند تشکیل پرونده"); }
    if (policy.requiresOfficeVisit) { eligibility = eligibility === "ineligible" ? eligibility : "conditional"; conditions.push("نیازمند مراجعه/فرآیند حضوری بیمه"); }
    if (policy.requiredDocuments?.length) conditions.push(`مدارک: ${policy.requiredDocuments.join("، ")}`);

    const maxCovered = policy.maxCoveredPurchaseUnitsPer30Days ?? purchaseUnitsNeeded30Days;
    const covered = eligibility === "ineligible" ? 0 : Math.min(purchaseUnitsNeeded30Days, maxCovered);
    const uncovered = purchaseUnitsNeeded30Days - covered;

    let patientPerCovered = priceToman;
    let insurerPerCovered = 0;
    if (policy.patientShareTomanPerPurchaseUnit !== undefined) {
      patientPerCovered = policy.patientShareTomanPerPurchaseUnit;
      insurerPerCovered = policy.insurerShareTomanPerPurchaseUnit ?? Math.max(0, priceToman - patientPerCovered);
    } else if (policy.insurerShareTomanPerPurchaseUnit !== undefined) {
      insurerPerCovered = Math.min(priceToman, policy.insurerShareTomanPerPurchaseUnit);
      patientPerCovered = priceToman - insurerPerCovered;
    } else if (policy.coveragePercent !== undefined) {
      const reference = Math.min(priceToman, policy.referencePriceTomanPerPurchaseUnit ?? priceToman);
      insurerPerCovered = reference * Math.max(0, Math.min(100, policy.coveragePercent)) / 100;
      patientPerCovered = priceToman - insurerPerCovered;
    }

    return {
      provider,
      eligibility,
      rawCoveragePercent: policy.coveragePercent,
      displayCoveragePercent: policy.coveragePercent === undefined ? undefined : Math.round(policy.coveragePercent),
      coveredPurchaseUnits: covered,
      uncoveredPurchaseUnits: uncovered,
      patientCostIfEligibleToman: Math.round(covered * patientPerCovered + uncovered * priceToman),
      insurerCostIfEligibleToman: Math.round(covered * insurerPerCovered),
      conditions,
      genericRegistryCode: product.genericRegistryCode,
      brandRegistryCode: product.brandRegistryCode,
    };
  });
}
