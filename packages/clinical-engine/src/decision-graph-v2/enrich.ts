import { calculateProductMonthlyCostV2, chooseGenericCostBenchmarkV2 } from "./cost.js";
import {
  attachScheduledInsuranceProjectionsV2,
  bestScheduledInsuranceFitV2,
  estimateScheduledInsuranceClaimsV2,
  lowestUsableScheduledPatientCostV2,
} from "./insurance-claims.js";
import {
  attachWegovyMashContinuationCostV2,
  buildWegovyMashContinuationWindowCostV2,
  executableContinuationMonthlyCostV2,
} from "./wegovy-continuation-cost.js";
import {
  attachPhaseAwareTitrationCostV2,
  buildWegovyMashInitiationTitrationCostV2,
} from "./wegovy-titration-cost.js";
import { blockCandidateSelectionV2 } from "./selection-constraints.js";
import type {
  ClinicalObjectiveV2,
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

function hasActiveCurrentMedication(request: DecisionGraphRequestV2, masterDrugId: string) {
  return (request.patient.currentMedications ?? []).some((item) =>
    (item.status ?? "active") === "active" && item.masterDrugId === masterDrugId,
  );
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
  const componentProductIds = new Set(allProducts.map((product) => product.productId));
  // Keep every possible exact-product or master fallback match, in original
  // order. Avoid rescanning unrelated market policies for every dose/product.
  const insurancePolicies = request.inventory.insurancePolicies.filter((policy) =>
    policy.masterDrugId === component.masterDrugId ||
    (policy.productId !== undefined && componentProductIds.has(policy.productId)),
  );
  const plans = component.doseOptions?.length ? component.doseOptions : component.dosePlan ? [component.dosePlan] : [];
  const currentForm = currentFormFor(request, component.masterDrugId);
  const preferredId = request.preferences.adminPreferredProductByMasterDrugId?.[component.masterDrugId];

  const raw = plans.flatMap((plan): DoseExecutionOptionV2[] => {
    const planProducts = plan.productId ? allProducts.filter((product) => product.productId === plan.productId) : allProducts;
    const costs = planProducts
      .map((product) => calculateProductMonthlyCostV2({
        product,
        dose: plan,
        insurancePolicies,
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

function scheduledClaimsForPlan(
  phases: readonly { productId: string; claimDay: number }[],
  purchases: readonly { productId: string; purchaseUnitsRequired: number }[],
) {
  const firstClaimDay = new Map<string, number>();
  for (const phase of phases) {
    const existing = firstClaimDay.get(phase.productId);
    if (existing === undefined || phase.claimDay < existing) firstClaimDay.set(phase.productId, phase.claimDay);
  }
  return purchases.flatMap((purchase) => {
    const claimDay = firstClaimDay.get(purchase.productId);
    return claimDay === undefined ? [] : [{
      productId: purchase.productId,
      claimDay,
      purchaseUnits: purchase.purchaseUnitsRequired,
    }];
  });
}

export function enrichCandidateWithDoseMarketCostV2(
  request: DecisionGraphRequestV2,
  candidate: RegimenCandidateV2,
  objectives: readonly ClinicalObjectiveV2[] = [],
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

    const isWegovyMashRule = selected.plan.ruleId.startsWith("LABEL-WEGOVY-MASH-");
    if (isWegovyMashRule && hasActiveCurrentMedication(request, component.masterDrugId)) {
      // Current WEGOVY may sit part-way through a 28-day stage. Build the exact
      // discrete continuation window here so insured-only safety is resolved in
      // the same base enrichment pass rather than being undone by a later wrapper.
      component.selectedProductCost = undefined;
      component.genericCostBenchmark = undefined;
      const continuationPlan = buildWegovyMashContinuationWindowCostV2({ request, component, windowDays: 30 });
      if (!continuationPlan) {
        insuranceFits.push("unknown");
        hasKnownCost = false;
        dailyBurden += selected.plan.administrationsPerDay;
        result.cautions.push("هزینه ۳۰روزه continuation WEGOVY از وضعیت فعلی قابل حل نیست؛ cost تک-strength جایگزین آن نشده است.");
        continue;
      }

      attachWegovyMashContinuationCostV2(component, continuationPlan);
      const scheduledClaims = scheduledClaimsForPlan(
        continuationPlan.phases.map((phase) => ({ productId: phase.productId, claimDay: phase.firstAdministrationDay })),
        continuationPlan.productPurchases,
      );
      const insuranceProjections = scheduledClaims.length === continuationPlan.productPurchases.length
        ? estimateScheduledInsuranceClaimsV2({
            windowDays: continuationPlan.windowDays,
            claims: scheduledClaims,
            products: request.inventory.marketProducts,
            providers: request.preferences.insuranceProviders ?? [],
            policies: request.inventory.insurancePolicies,
            clinician: request.clinician,
          })
        : [];
      attachScheduledInsuranceProjectionsV2(component, insuranceProjections);

      if (continuationPlan.costAuthority === "executable") {
        const exactCost = executableContinuationMonthlyCostV2(component);
        if (exactCost) component.selectedProductCost = exactCost;
        dailyBurden += continuationPlan.totalAdministrations / continuationPlan.windowDays;
        const continuationInsuranceFit = bestScheduledInsuranceFitV2(insuranceProjections);
        insuranceFits.push(continuationInsuranceFit);

        if (request.preferences.costPreference === "insured_only") {
          const insuredPatientCost = lowestUsableScheduledPatientCostV2(insuranceProjections);
          if (insuredPatientCost === undefined) {
            hasKnownCost = false;
            result.cautions.push(
              continuationInsuranceFit === "not_covered"
                ? "برنامه continuation WEGOVY با Rule بیمه انتخاب‌شده سازگار نیست؛ هزینه insured-only نمایش داده نمی‌شود."
                : "پوشش بیمه انتخاب‌شده برای continuation WEGOVY به‌طور صریح قابل اثبات نیست؛ هزینه insured-only نمایش داده نمی‌شود.",
            );
          } else {
            totalPatientCost += insuredPatientCost;
            result.reasons.push(
              `هزینه insured-only continuation WEGOVY از claim schedule موجود محاسبه شد: سهم بیمار ${insuredPatientCost.toLocaleString("en-US")} تومان در ${continuationPlan.windowDays} روز.`,
            );
          }
        } else {
          totalPatientCost += continuationPlan.normalizedTreatmentValueToman;
        }
        result.reasons.push(
          `هزینه continuation WEGOVY از برنامه دقیق ${continuationPlan.totalAdministrations} تزریق در ${continuationPlan.windowDays} روز محاسبه شد: ارزش مصرفی ${continuationPlan.normalizedTreatmentValueToman.toLocaleString("en-US")} تومان و خرید نقدی صفر-inventory ${continuationPlan.cashPurchaseCostToman.toLocaleString("en-US")} تومان.`,
        );
      } else {
        // Future escalation remains a display-only projection even if insurer
        // timing rules exist. Insurance can never promote unobserved tolerability
        // into executable cost/ranking authority.
        insuranceFits.push("unknown");
        hasKnownCost = false;
        component.selectedProductCost = undefined;
        component.genericCostBenchmark = undefined;
        dailyBurden += continuationPlan.totalAdministrations / continuationPlan.windowDays;
        result.reasons.push(
          `Projection مالی continuation WEGOVY: ${continuationPlan.totalAdministrations} تزریق در ${continuationPlan.windowDays} روز، ارزش مصرفی ${continuationPlan.normalizedTreatmentValueToman.toLocaleString("en-US")} تومان و خرید نقدی صفر-inventory ${continuationPlan.cashPurchaseCostToman.toLocaleString("en-US")} تومان.`,
        );
        result.cautions.push("این projection شامل escalation آینده با فرض ادامه تحمل درمان است؛ display-only است و وارد cost ranking یا بودجه قطعی نمی‌شود.");
      }
      continue;
    }

    const needsWegovyPhaseCost = selected.plan.ruleId.startsWith("LABEL-WEGOVY-MASH-INIT-0_25:");
    if (needsWegovyPhaseCost) {
      const phasePlan = buildWegovyMashInitiationTitrationCostV2({ request, component, windowDays: 30 });
      // A single-strength 30-day cost is not a valid substitute when escalation
      // crosses into 0.5 mg on day 29. Remove it even if the composite plan fails.
      component.selectedProductCost = undefined;
      component.genericCostBenchmark = undefined;
      if (!phasePlan) {
        insuranceFits.push("unknown");
        hasKnownCost = false;
        result.cautions.push("هزینه شروع WEGOVY چندمرحله‌ای قابل حل نیست؛ موتور از نمایش هزینه ۳۰روزه تک-strength خودداری کرد.");
        dailyBurden += selected.plan.administrationsPerDay;
        continue;
      }
      attachPhaseAwareTitrationCostV2(component, phasePlan);
      dailyBurden += phasePlan.totalAdministrations / phasePlan.windowDays;

      const scheduledClaims = scheduledClaimsForPlan(
        phasePlan.phases.map((phase) => ({ productId: phase.productId, claimDay: phase.startDay })),
        phasePlan.productPurchases,
      );
      const insuranceProjections = scheduledClaims.length === phasePlan.productPurchases.length
        ? estimateScheduledInsuranceClaimsV2({
            windowDays: phasePlan.windowDays,
            claims: scheduledClaims,
            products: request.inventory.marketProducts,
            providers: request.preferences.insuranceProviders ?? [],
            policies: request.inventory.insurancePolicies,
            clinician: request.clinician,
          })
        : [];
      attachScheduledInsuranceProjectionsV2(component, insuranceProjections);
      const phaseInsuranceFit = bestScheduledInsuranceFitV2(insuranceProjections);
      insuranceFits.push(phaseInsuranceFit);

      if (request.preferences.costPreference === "insured_only") {
        const insuredPatientCost = lowestUsableScheduledPatientCostV2(insuranceProjections);
        if (insuredPatientCost === undefined) {
          hasKnownCost = false;
          result.cautions.push(
            phaseInsuranceFit === "not_covered"
              ? "برنامه چند-strength WEGOVY با Rule claim صریح بیمه انتخاب‌شده سازگار نیست؛ هزینه insured-only نمایش داده نمی‌شود."
              : "claim timing صریح و قابل استفاده برای تمام فازهای WEGOVY تأیید نشده است؛ هزینه insured-only نمایش داده نمی‌شود.",
          );
        } else {
          totalPatientCost += insuredPatientCost;
          result.reasons.push(
            `هزینه insured-only شروع WEGOVY فقط از claim schedule صریح بیمه محاسبه شد: سهم بیمار ${insuredPatientCost.toLocaleString("en-US")} تومان در ${phasePlan.windowDays} روز.`,
          );
        }
      } else {
        totalPatientCost += phasePlan.normalizedTreatmentValueToman;
      }
      result.reasons.push(
        `هزینه شروع WEGOVY به‌صورت phase-aware محاسبه شد: ${phasePlan.totalAdministrations} تزریق در ${phasePlan.windowDays} روز، ارزش مصرفی ${phasePlan.normalizedTreatmentValueToman.toLocaleString("en-US")} تومان و خرید نقدی صفر-inventory ${phasePlan.cashPurchaseCostToman.toLocaleString("en-US")} تومان.`,
      );
      continue;
    }

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
      result.components.some((component) => /insulin|fixed_ratio_combination/.test(component.therapyGroup)) &&
      objectives.some((objective) => objective.level === "mandatory" && objective.id === "insulin_replacement");

    if (mandatoryInsulin) {
      const message = result.insuranceFit === "unknown"
        ? "پوشش بیمه انتخاب‌شده برای این رژیم تأیید نشده است، اما الزام بالینی مانع پنهان‌کردن نیاز به انسولین شده است."
        : "بیمه انتخاب‌شده این رژیم را پوشش نمی‌دهد، اما الزام بالینی مانع حذف کورکورانه آن شده است.";
      if (!result.preferenceConflicts.includes(message)) result.preferenceConflicts.push(message);
    } else {
      const accessConstraintReason = result.insuranceFit === "unknown"
        ? "insured-only فعال است اما پوشش قابل استفاده برای بیمه انتخاب‌شده تأیید نشده است."
        : "insured-only فعال است و پوشش قابل استفاده برای این رژیم یافت نشد.";
      blockCandidateSelectionV2(result, "access", accessConstraintReason);
      if (!result.preferenceConflicts.includes(accessConstraintReason)) result.preferenceConflicts.push(accessConstraintReason);
    }
  }
  if (request.preferences.monthlyMedicationBudgetToman !== undefined && result.monthlyPatientCostToman !== undefined && result.monthlyPatientCostToman > request.preferences.monthlyMedicationBudgetToman) {
    result.preferenceConflicts.push(`هزینه ماهانه برآوردی (${result.monthlyPatientCostToman.toLocaleString("en-US")} تومان) از بودجه اعلام‌شده بیشتر است.`);
  }

  return result;
}
