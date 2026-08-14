import { calculateProductMonthlyCostV2, chooseGenericCostBenchmarkV2 } from "./cost.js";
import type {
  DecisionGraphRequestV2,
  GenericCostBenchmarkV2,
  IranMarketProductV2,
  ProductMonthlyCostV2,
  RegimenCandidateV2,
  ResolvedDosePlanV2,
} from "./types.js";

function currentProductsForComponent(request: DecisionGraphRequestV2, masterDrugId: string): IranMarketProductV2[] {
  return request.inventory.marketProducts.filter((product) =>
    product.masterDrugId === masterDrugId &&
    product.nfiMatchState === "verified" &&
    product.license.currentValid &&
    !product.license.revoked &&
    (product.marketPresence === "confirmed_active" || product.marketPresence === "recently_observed"),
  );
}

function bestInsuranceFit(costs: NonNullable<RegimenCandidateV2["components"][number]["selectedProductCost"]>["insurance"]) {
  if (costs.some((item) => item.eligibility === "eligible")) return "eligible" as const;
  if (costs.some((item) => item.eligibility === "conditional")) return "conditional" as const;
  if (costs.length === 0 || costs.some((item) => item.eligibility === "unknown")) return "unknown" as const;
  return "not_covered" as const;
}

interface DoseExecutionOptionV2 {
  plan: ResolvedDosePlanV2;
  products: IranMarketProductV2[];
  costs: ProductMonthlyCostV2[];
  benchmark?: GenericCostBenchmarkV2;
  selectedCost?: ProductMonthlyCostV2;
  selectedProduct?: IranMarketProductV2;
  adminPreferredFit: boolean;
  genericReferenceFit: boolean;
  currentFormFit: boolean;
}

function currentFormFor(request: DecisionGraphRequestV2, masterDrugId: string) {
  return (request.patient.currentMedications ?? []).find((item) =>
    (item.status ?? "active") === "active" && item.masterDrugId === masterDrugId,
  )?.dosageFormGroup;
}

function selectedCostForOption(
  request: DecisionGraphRequestV2,
  masterDrugId: string,
  costs: ProductMonthlyCostV2[],
  benchmark: GenericCostBenchmarkV2 | undefined,
) {
  const preferredId = request.preferences.adminPreferredProductByMasterDrugId?.[masterDrugId];
  if (preferredId) {
    const preferred = costs.find((item) => item.productId === preferredId);
    if (preferred) return preferred;
  }
  return costs.find((item) => item.productId === benchmark?.referenceProductId) ?? costs[0];
}

function doseSignature(plan: ResolvedDosePlanV2) {
  const components = [...(plan.perAdministrationComponents ?? plan.dailyComponents ?? [])]
    .sort((a, b) => a.ingredientKey.localeCompare(b.ingredientKey))
    .map((item) => `${item.ingredientKey}:${item.amount}:${item.unit}`)
    .join("|");
  return `${plan.dosageFormGroup ?? "*"}|${plan.administrationsPerDay}|${components}|${plan.presentationUnitsPerDay ?? ""}`;
}

function buildDoseExecutionOptions(
  request: DecisionGraphRequestV2,
  component: RegimenCandidateV2["components"][number],
): DoseExecutionOptionV2[] {
  const allProducts = currentProductsForComponent(request, component.masterDrugId);
  const plans = component.doseOptions?.length ? component.doseOptions : component.dosePlan ? [component.dosePlan] : [];
  const currentForm = currentFormFor(request, component.masterDrugId);
  const preferredId = request.preferences.adminPreferredProductByMasterDrugId?.[component.masterDrugId];

  const raw = plans.flatMap((plan): DoseExecutionOptionV2[] => {
    const planProducts = plan.productId ? allProducts.filter((product) => product.productId === plan.productId) : allProducts;
    const costs = planProducts
      .map((product) => calculateProductMonthlyCostV2({
        product,
        dose: plan,
        insurancePolicies: request.inventory.insurancePolicies,
        preferences: request.preferences,
        clinician: request.clinician,
      }))
      .filter((item): item is ProductMonthlyCostV2 => Boolean(item));
    if (!costs.length) return [];
    const productIds = new Set(costs.map((item) => item.productId));
    const products = planProducts.filter((item) => productIds.has(item.productId));
    const benchmark = chooseGenericCostBenchmarkV2({ masterDrugId: component.masterDrugId, productCosts: costs, products, preferences: request.preferences });
    const selectedCost = selectedCostForOption(request, component.masterDrugId, costs, benchmark);
    return [{
      plan,
      products,
      costs,
      benchmark,
      selectedCost,
      selectedProduct: selectedCost ? products.find((item) => item.productId === selectedCost.productId) : undefined,
      adminPreferredFit: Boolean(preferredId && costs.some((item) => item.productId === preferredId)),
      genericReferenceFit: Boolean(selectedCost && benchmark?.referenceProductId === selectedCost.productId),
      currentFormFit: Boolean(currentForm && plan.dosageFormGroup === currentForm),
    }];
  });

  // Product-bound regulatory protocols (notably FRCs) may produce one plan per
  // NFI brand. If the clinical dose signature is identical, benchmark them as
  // one generic market cluster so "no admin brand" uses the median policy rather
  // than silently choosing the cheapest brand.
  const grouped = new Map<string, DoseExecutionOptionV2[]>();
  for (const option of raw) {
    const key = doseSignature(option.plan);
    grouped.set(key, [...(grouped.get(key) ?? []), option]);
  }
  for (const group of grouped.values()) {
    if (group.length < 2 || !group.every((item) => Boolean(item.plan.productId))) continue;
    const costs = group.flatMap((item) => item.costs);
    const products = group.flatMap((item) => item.products);
    const benchmark = chooseGenericCostBenchmarkV2({ masterDrugId: component.masterDrugId, productCosts: costs, products, preferences: request.preferences });
    for (const option of group) {
      option.benchmark = benchmark;
      option.genericReferenceFit = Boolean(option.selectedCost && benchmark?.referenceProductId === option.selectedCost.productId);
    }
  }

  return raw;
}

function roleRank(plan: ResolvedDosePlanV2) {
  if (plan.selectionRole === "product_specific") return 0;
  if (plan.selectionRole === "default" || !plan.selectionRole) return 1;
  return 2;
}

function chooseDoseExecutionOption(
  request: DecisionGraphRequestV2,
  options: readonly DoseExecutionOptionV2[],
): DoseExecutionOptionV2 | undefined {
  const simplify = request.preferences.adherencePriority === "simplify_regimen";
  return [...options].sort((a, b) => {
    // Preserve an existing formulation when clinically valid, then respect an
    // explicit admin product. Only after those clinical/operational constraints
    // are satisfied do burden and cost act as tie-breakers.
    if (a.currentFormFit !== b.currentFormFit) return a.currentFormFit ? -1 : 1;
    if (a.adminPreferredFit !== b.adminPreferredFit) return a.adminPreferredFit ? -1 : 1;
    if (!a.adminPreferredFit && !b.adminPreferredFit && a.genericReferenceFit !== b.genericReferenceFit) return a.genericReferenceFit ? -1 : 1;
    if (simplify && a.plan.administrationsPerDay !== b.plan.administrationsPerDay) {
      return a.plan.administrationsPerDay - b.plan.administrationsPerDay;
    }
    const role = roleRank(a.plan) - roleRank(b.plan);
    if (role) return role;
    if (!simplify && a.plan.administrationsPerDay !== b.plan.administrationsPerDay) {
      return a.plan.administrationsPerDay - b.plan.administrationsPerDay;
    }
    const aCost = a.benchmark?.referenceNormalized30DayCostToman ?? a.benchmark?.referenceMonthlyCashCostToman ?? Number.POSITIVE_INFINITY;
    const bCost = b.benchmark?.referenceNormalized30DayCostToman ?? b.benchmark?.referenceMonthlyCashCostToman ?? Number.POSITIVE_INFINITY;
    if (aCost !== bCost) return aCost - bCost;
    return a.plan.ruleId.localeCompare(b.plan.ruleId);
  })[0];
}

export function enrichCandidateWithDoseMarketCostV2(
  request: DecisionGraphRequestV2,
  candidate: RegimenCandidateV2,
): RegimenCandidateV2 {
  const result = structuredClone(candidate);
  let totalPatientCost = 0;
  let hasKnownCost = true;
  const insuranceFits: RegimenCandidateV2["insuranceFit"][] = [];
  let dailyBurden = 0;

  for (const component of result.components) {
    const executionOptions = buildDoseExecutionOptions(request, component);
    const selected = chooseDoseExecutionOption(request, executionOptions);
    if (!selected) {
      hasKnownCost = false;
      if (component.doseOptions?.length || component.dosePlan) {
        if (result.gate.status === "pass") result.gate.status = "conditional";
        result.cautions.push("فرآورده current با فرم، strength و بسته‌بندی قابل محاسبه برای Dose Plan پیدا نشد؛ Top Recommendation تا تکمیل presentation mapping مجاز نیست.");
      }
      continue;
    }

    component.dosePlan = selected.plan;
    component.genericCostBenchmark = selected.benchmark;
    component.selectedProductCost = selected.selectedCost;
    component.selectedProduct = selected.selectedProduct;

    if (selected.selectedCost) {
      const providerCosts = selected.selectedCost.insurance.filter((item) => (request.preferences.insuranceProviders ?? []).includes(item.provider));
      insuranceFits.push(bestInsuranceFit(providerCosts));
      if (request.preferences.costPreference === "insured_only" && providerCosts.length) {
        const eligible = providerCosts.filter((item) => item.eligibility === "eligible" || item.eligibility === "conditional");
        if (eligible.length) totalPatientCost += Math.min(...eligible.map((item) => item.patientCostIfEligibleToman));
        else totalPatientCost += selected.selectedCost.cashPurchaseCostToman;
      } else {
        totalPatientCost += selected.selectedCost.normalized30DayTreatmentCostToman;
      }
    } else if (selected.benchmark) {
      totalPatientCost += selected.benchmark.referenceNormalized30DayCostToman;
      insuranceFits.push("unknown");
    } else {
      hasKnownCost = false;
      insuranceFits.push("unknown");
    }
    dailyBurden += selected.plan.administrationsPerDay;
  }

  result.monthlyPatientCostToman = hasKnownCost ? Math.round(totalPatientCost) : undefined;
  result.dailyAdministrationBurden = dailyBurden || undefined;
  if (insuranceFits.includes("eligible")) result.insuranceFit = "eligible";
  else if (insuranceFits.includes("conditional")) result.insuranceFit = "conditional";
  else if (insuranceFits.includes("not_covered") && !insuranceFits.includes("unknown")) result.insuranceFit = "not_covered";
  else result.insuranceFit = "unknown";

  // GLYMIZE_INSURED_ONLY_SAFETY_V2
  // insured_only requires positively verified usable coverage.
  // "unknown" is not equivalent to "insured".
  if (
    request.preferences.costPreference === "insured_only" &&
    result.gate.status !== "exclude" &&
    result.insuranceFit !== "eligible" &&
    result.insuranceFit !== "conditional"
  ) {
    const mandatoryInsulin =
      result.components.some((component) => /insulin/.test(component.therapyGroup)) &&
      result.preferenceConflicts.some((item) => item.includes("الزام بالینی"));

    if (mandatoryInsulin) {
      const message = result.insuranceFit === "unknown"
        ? "پوشش بیمه انتخاب‌شده برای این رژیم تأیید نشده است، اما الزام بالینی مانع پنهان‌کردن نیاز به انسولین شده است."
        : "بیمه انتخاب‌شده این رژیم را پوشش نمی‌دهد، اما الزام بالینی مانع حذف کورکورانه آن شده است.";
      if (!result.preferenceConflicts.includes(message)) result.preferenceConflicts.push(message);
    } else {
      result.gate.status = "exclude";
      result.gate.reasons.push(
        result.insuranceFit === "unknown"
          ? "insured-only فعال است اما پوشش قابل استفاده برای بیمه انتخاب‌شده تأیید نشده است."
          : "insured-only فعال است و پوشش قابل استفاده برای این رژیم یافت نشد.",
      );
    }
  }
  if (request.preferences.monthlyMedicationBudgetToman !== undefined && result.monthlyPatientCostToman !== undefined && result.monthlyPatientCostToman > request.preferences.monthlyMedicationBudgetToman) {
    result.preferenceConflicts.push(`هزینه ماهانه برآوردی (${result.monthlyPatientCostToman.toLocaleString("en-US")} تومان) از بودجه اعلام‌شده بیشتر است.`);
  }

  return result;
}
