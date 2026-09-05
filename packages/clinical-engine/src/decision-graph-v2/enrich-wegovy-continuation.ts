import { enrichCandidateWithDoseMarketCostV2 as enrichBaseV2 } from "./enrich.js";
import { phaseAwareTitrationCostV2 } from "./wegovy-titration-cost.js";
import {
  attachWegovyMashContinuationCostV2,
  buildWegovyMashContinuationWindowCostV2,
  executableContinuationMonthlyCostV2,
  wegovyMashContinuationCostV2,
} from "./wegovy-continuation-cost.js";
import type { DecisionGraphRequestV2, RegimenCandidateV2, RegimenComponentV2 } from "./types.js";

const TASK4_BOUNDARY_CAUTION = "هزینه ۳۰روزه continuation WEGOVY تا محاسبه phase-aware بر اساس daysOnCurrentDose نمایش داده نمی‌شود؛ cost تک-strength جایگزین آن نشده است.";

function nonInsuredComponentCost(component: RegimenComponentV2) {
  const continuation = wegovyMashContinuationCostV2(component);
  if (continuation) {
    return continuation.costAuthority === "executable"
      ? continuation.normalizedTreatmentValueToman
      : undefined;
  }
  const initiation = phaseAwareTitrationCostV2(component);
  if (initiation) return initiation.normalizedTreatmentValueToman;
  if (component.selectedProductCost) return component.selectedProductCost.normalized30DayTreatmentCostToman;
  return component.genericCostBenchmark?.referenceNormalized30DayCostToman;
}

function recomputeNonInsuredMonthlyCost(request: DecisionGraphRequestV2, result: RegimenCandidateV2) {
  if (request.preferences.costPreference === "insured_only") return;
  const costs = result.components.map(nonInsuredComponentCost);
  result.monthlyPatientCostToman = costs.every((value) => value !== undefined)
    ? Math.round((costs as number[]).reduce((sum, value) => sum + value, 0))
    : undefined;

  const budget = request.preferences.monthlyMedicationBudgetToman;
  if (budget !== undefined && result.monthlyPatientCostToman !== undefined && result.monthlyPatientCostToman > budget) {
    const message = `هزینه ماهانه برآوردی (${result.monthlyPatientCostToman.toLocaleString("en-US")} تومان) از بودجه اعلام‌شده بیشتر است.`;
    if (!result.preferenceConflicts.includes(message)) result.preferenceConflicts.push(message);
  }
}

/**
 * Narrow post-enrichment layer for exact WEGOVY MASH continuation costing.
 * Generic product/dose/insurance enrichment stays authoritative for every other
 * medicine. Conditional future-escalation projections are attached for display
 * only and deliberately leave monthlyPatientCostToman undefined so the selector
 * cannot use an unobserved future tolerability assumption as a ranking input.
 */
export function enrichCandidateWithDoseMarketCostV2(
  request: DecisionGraphRequestV2,
  candidate: RegimenCandidateV2,
): RegimenCandidateV2 {
  const result = enrichBaseV2(request, candidate);

  for (const component of result.components) {
    if (!component.dosePlan?.ruleId.startsWith("LABEL-WEGOVY-MASH-")) continue;
    const plan = buildWegovyMashContinuationWindowCostV2({ request, component, windowDays: 30 });
    if (!plan) continue;

    attachWegovyMashContinuationCostV2(component, plan);
    result.cautions = result.cautions.filter((message) => message !== TASK4_BOUNDARY_CAUTION);

    if (plan.costAuthority === "executable") {
      const exactCost = executableContinuationMonthlyCostV2(component);
      if (exactCost) {
        component.selectedProductCost = exactCost;
        result.reasons.push(
          `هزینه continuation WEGOVY از برنامه دقیق ${plan.totalAdministrations} تزریق در ${plan.windowDays} روز محاسبه شد: ارزش مصرفی ${plan.normalizedTreatmentValueToman.toLocaleString("en-US")} تومان و خرید نقدی صفر-inventory ${plan.cashPurchaseCostToman.toLocaleString("en-US")} تومان.`,
        );
      }
    } else {
      component.selectedProductCost = undefined;
      component.genericCostBenchmark = undefined;
      result.reasons.push(
        `Projection مالی continuation WEGOVY: ${plan.totalAdministrations} تزریق در ${plan.windowDays} روز، ارزش مصرفی ${plan.normalizedTreatmentValueToman.toLocaleString("en-US")} تومان و خرید نقدی صفر-inventory ${plan.cashPurchaseCostToman.toLocaleString("en-US")} تومان.`,
      );
      result.cautions.push("این projection شامل escalation آینده با فرض ادامه تحمل درمان است؛ display-only است و وارد cost ranking یا بودجه قطعی نمی‌شود.");
    }
  }

  recomputeNonInsuredMonthlyCost(request, result);
  return result;
}
