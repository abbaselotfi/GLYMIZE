import type { Type2MedicationConsideration } from "@glymize/contracts";
import {
  buildType2TreatmentScenarios as buildSafeScenarios,
  currentMedicationDailyUnits,
  estimateType2Medication30DayCost,
  type Type2CostingPlan,
  type Type2MonthlyCostEstimate,
  type Type2MonthlyCostStatus,
  type Type2ScenarioBuildInput,
  type Type2ScenarioKind as SafeScenarioKind,
  type Type2ScenarioSortMode,
  type Type2TreatmentScenario as SafeTreatmentScenario,
} from "./scenario-engine-safe.js";

export { currentMedicationDailyUnits, estimateType2Medication30DayCost };
export type {
  Type2CostingPlan,
  Type2MonthlyCostEstimate,
  Type2MonthlyCostStatus,
  Type2ScenarioBuildInput,
  Type2ScenarioSortMode,
};

export type Type2ScenarioKind = SafeScenarioKind | "worlddrug_review";
export type Type2TreatmentScenario = Omit<SafeTreatmentScenario, "kind"> & { kind: Type2ScenarioKind };

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function reviewCost(medication: Type2MedicationConsideration, input: Type2ScenarioBuildInput) {
  return estimateType2Medication30DayCost({
    price: medication.price,
    priceRange: medication.priceRange,
    coverages: medication.insuranceCoverages,
    insuranceProvider: input.insuranceProvider,
    plan: input.costingPlansByMedicationId?.[medication.genericMedicationId],
  });
}

function worldDrugReviewScenario(
  options: Type2MedicationConsideration[],
  input: Type2ScenarioBuildInput,
): Type2TreatmentScenario {
  return {
    id: "worlddrug-review-options",
    // `rank` is structurally required by the scenario contract. This card is
    // intentionally appended outside the Decision Graph top-3 loop and MUST NOT
    // be interpreted as clinical rank 3.
    rank: 3,
    kind: "worlddrug_review",
    titleFa: "گزینه‌های مرتبط WorldDrug — نیازمند پروتکل",
    titleEn: "WorldDrug review options — protocol required",
    summaryFa: "این داروها در WorldDrug تأیید شده‌اند، با وضعیت بالینی بیمار مرتبط‌اند و حضور فعلی آن‌ها در بازار ایران توسط داده‌های موجود تأیید شده است؛ اما تا زمانی که Rule/Protocol اختصاصی و approved نداشته باشند، پیشنهاد نسخه اجرایی محسوب نمی‌شوند.",
    summaryEn: "These approved WorldDrug entries match the patient's active clinical context and have current verified Iran-market presence, but they are not executable prescribing recommendations until an approved drug-specific rule/protocol exists.",
    medicationIds: options.map((item) => item.genericMedicationId),
    medications: options,
    rationaleFa: unique(options.flatMap((item) => item.considerations)),
    rationaleEn: [
      "WorldDrug review projection is separate from Decision Graph ranking; no review-only medicine receives a Decision Graph rank or additive clinical score.",
    ],
    tradeoffsFa: unique(options.flatMap((item) => item.cautions)),
    tradeoffsEn: [
      "Clinician review and an approved protocol are required before any review-only option can become an executable regimen.",
    ],
    parallelCareFa: [],
    parallelCareEn: [],
    cost30Days: options.map((item) => reviewCost(item, input)),
    urgentReview: input.assessment.recommendation.urgentReview,
  };
}

export function buildType2TreatmentScenarios(input: Type2ScenarioBuildInput): Type2TreatmentScenario[] {
  const reviewOptions = input.assessment.medications.filter(
    (medication) => medication.outputStatus === "requires_approved_protocol",
  );
  const executableMedications = input.assessment.medications.filter(
    (medication) => medication.outputStatus !== "requires_approved_protocol",
  );

  const base = buildSafeScenarios({
    ...input,
    assessment: {
      ...input.assessment,
      medications: executableMedications,
    },
  });

  if (!reviewOptions.length) return base;
  return [...base, worldDrugReviewScenario(reviewOptions, input)];
}
