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

    // GLYMIZE_FINANCIAL_SAFETY_V2
    // Insurance feeds are external data. Never allow malformed financial values
    // to produce negative costs or insurer+patient shares above retail.
    const clampMoney = (value: number, max: number) =>
      Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));

    const maxCoveredRaw = policy.maxCoveredPurchaseUnitsPer30Days ?? purchaseUnitsNeeded30Days;
    const maxCovered = Math.max(0, Number.isFinite(maxCoveredRaw) ? maxCoveredRaw : 0);
    const covered = eligibility === "ineligible"
      ? 0
      : Math.min(purchaseUnitsNeeded30Days, maxCovered);
    const uncovered = Math.max(0, purchaseUnitsNeeded30Days - covered);

    let patientPerCovered = priceToman;
    let insurerPerCovered = 0;

    if (policy.patientShareTomanPerPurchaseUnit !== undefined) {
      patientPerCovered = clampMoney(policy.patientShareTomanPerPurchaseUnit, priceToman);
      const remainingRetail = Math.max(0, priceToman - patientPerCovered);
      insurerPerCovered = policy.insurerShareTomanPerPurchaseUnit !== undefined
        ? clampMoney(policy.insurerShareTomanPerPurchaseUnit, remainingRetail)
        : remainingRetail;
    } else if (policy.insurerShareTomanPerPurchaseUnit !== undefined) {
      insurerPerCovered = clampMoney(policy.insurerShareTomanPerPurchaseUnit, priceToman);
      patientPerCovered = Math.max(0, priceToman - insurerPerCovered);
    } else if (policy.coveragePercent !== undefined) {
      const referenceRaw = policy.referencePriceTomanPerPurchaseUnit ?? priceToman;
      const reference = clampMoney(referenceRaw, priceToman);
      const coveragePercent = Math.max(
        0,
        Math.min(100, Number.isFinite(policy.coveragePercent) ? policy.coveragePercent : 0),
      );
      insurerPerCovered = clampMoney(reference * coveragePercent / 100, priceToman);
      patientPerCovered = Math.max(0, priceToman - insurerPerCovered);
    }

    // GLYMIZE_INTEGER_TOMAN_CONSERVATION_V2
    // Patient and insurer totals are integer Toman values. Round once per party,
    // then cap insurer payment by the remaining retail amount so independent
    // rounding can never create money.
    const retailTotalToman = Math.max(0, Math.round(purchaseUnitsNeeded30Days * priceToman));
    const patientCostRawToman = covered * patientPerCovered + uncovered * priceToman;
    const insurerCostRawToman = covered * insurerPerCovered;
    const patientCostToman = Math.min(
      retailTotalToman,
      Math.max(0, Math.round(patientCostRawToman)),
    );
    const insurerCostToman = Math.min(
      Math.max(0, retailTotalToman - patientCostToman),
      Math.max(0, Math.round(insurerCostRawToman)),
    );

    return {
      provider,
      eligibility,
      rawCoveragePercent: policy.coveragePercent,
      displayCoveragePercent: policy.coveragePercent === undefined ? undefined : Math.round(Math.max(0, Math.min(100, Number.isFinite(policy.coveragePercent) ? policy.coveragePercent : 0))),
      coveredPurchaseUnits: covered,
      uncoveredPurchaseUnits: uncovered,
      patientCostIfEligibleToman: patientCostToman,
      insurerCostIfEligibleToman: insurerCostToman,
      conditions,
      genericRegistryCode: product.genericRegistryCode,
      brandRegistryCode: product.brandRegistryCode,
    };
  });
}
