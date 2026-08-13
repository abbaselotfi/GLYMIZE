import type { Type2ConsiderationRequest } from "@glymize/contracts";
import {
  buildType2TreatmentScenarios as buildBaseScenarios,
  currentMedicationDailyUnits,
  estimateType2Medication30DayCost,
  type Type2CostingPlan,
  type Type2MonthlyCostEstimate,
  type Type2MonthlyCostStatus,
  type Type2ScenarioBuildInput,
  type Type2ScenarioKind as BaseScenarioKind,
  type Type2ScenarioSortMode,
  type Type2TreatmentScenario as BaseTreatmentScenario,
} from "./scenario-engine.js";

export { currentMedicationDailyUnits, estimateType2Medication30DayCost };
export type {
  Type2CostingPlan,
  Type2MonthlyCostEstimate,
  Type2MonthlyCostStatus,
  Type2ScenarioBuildInput,
  Type2ScenarioSortMode,
};

export type Type2ScenarioKind = BaseScenarioKind | "access_constrained";
export type Type2TreatmentScenario = Omit<BaseTreatmentScenario, "kind"> & { kind: Type2ScenarioKind };

function hasIndependentOutcomeIndication(request: Type2ConsiderationRequest) {
  return request.factors.some((factor) => ["ascvd", "heart_failure", "ckd", "masld_mash"].includes(factor)) ||
    Boolean(request.clinicalContext?.cardiovascular?.ascvd) ||
    Boolean(request.clinicalContext?.cardiovascular?.heartFailure) ||
    Boolean(request.clinicalContext?.kidney?.ckd) ||
    Boolean(request.clinicalContext?.liver?.masldMash);
}

function stillNeedsClinicalAction(input: Type2ScenarioBuildInput) {
  return input.assessment.recommendation.hba1cGap > 0 ||
    input.assessment.recommendation.urgentReview ||
    hasIndependentOutcomeIndication(input.request);
}

function accessConstrainedScenario(input: Type2ScenarioBuildInput, base: BaseTreatmentScenario): Type2TreatmentScenario {
  const insuranceOnly = input.request.costPreference === "insured_only";
  const urgent = input.assessment.recommendation.urgentReview;
  return {
    ...base,
    id: "access-constrained",
    kind: "access_constrained",
    titleFa: "محدودیت دسترسی/پوشش",
    titleEn: "Access constraint",
    summaryFa: insuranceOnly
      ? "نیاز بالینی همچنان برقرار است، اما با فیلتر «فقط داروی تحت پوشش بیمه» هیچ گزینهٔ جدید واجد شرایط باقی نمانده است."
      : "نیاز بالینی همچنان برقرار است، اما با محدودیت‌های انتخاب‌شدهٔ مسیر درمان/ایمنی هیچ گزینهٔ جدید واجد شرایط باقی نمانده است.",
    summaryEn: insuranceOnly
      ? "Clinical need remains, but no new option satisfies the selected insured-only access constraint."
      : "Clinical need remains, but no new option satisfies the currently selected route/safety constraints.",
    medicationIds: [],
    medications: [],
    rationaleFa: insuranceOnly
      ? ["نبود پوشش بیمه به معنی نبود اندیکاسیون بالینی نیست؛ فیلتر دسترسی باید جدا از ضرورت درمان نمایش داده شود."]
      : ["نبود گزینهٔ واجد شرایط در محدودیت‌های فعلی به معنی نبود نیاز بالینی نیست؛ محدودیت‌ها و مسیر درمان باید بازبینی شوند."],
    rationaleEn: insuranceOnly
      ? ["Lack of insurance coverage does not remove clinical indication; access constraints must remain separate from treatment need."]
      : ["No eligible option under the current constraints does not remove clinical need; review the route/access constraints and care pathway."],
    tradeoffsFa: [
      insuranceOnly
        ? "پوشش بیمه/فرآورده، امکان مسیر جایگزین یا تغییر فیلتر هزینه باید توسط پزشک بازبینی شود؛ سیستم داروی بدون پوشش را به‌صورت خودکار جایگزین نمی‌کند."
        : "مسیر تجویز، منع مصرف‌ها و محدودیت‌های انتخاب‌شده باید توسط پزشک بازبینی شوند؛ سیستم محدودیت کاربر را خودکار دور نمی‌زند.",
    ],
    tradeoffsEn: [
      insuranceOnly
        ? "Review coverage, product availability, alternative access, or the cost filter; the system does not silently substitute an uninsured drug."
        : "Review route, contraindications, and selected constraints; the system does not silently bypass clinician/patient constraints.",
    ],
    cost30Days: [],
    urgentReview: urgent,
  };
}

export function buildType2TreatmentScenarios(input: Type2ScenarioBuildInput): Type2TreatmentScenario[] {
  const scenarios = buildBaseScenarios(input);
  if (
    scenarios.length === 1 &&
    scenarios[0]?.kind === "maintain_monitor" &&
    stillNeedsClinicalAction(input)
  ) {
    return [accessConstrainedScenario(input, scenarios[0])];
  }
  return scenarios;
}
