import type { Type2ConsiderationRequest, Type2MedicationConsideration } from "@glymize/contracts";
import { TYPE2_DECISION_GRAPH_V2_AUTHORITY } from "./type2-decision-graph-compat.js";
import {
  buildType2TreatmentScenarios as buildBaseScenarios,
  currentMedicationDailyUnits,
  estimateType2Medication30DayCost as estimateBase30DayCost,
  type Type2CostingPlan,
  type Type2MonthlyCostEstimate,
  type Type2MonthlyCostStatus,
  type Type2ScenarioBuildInput,
  type Type2ScenarioKind as BaseScenarioKind,
  type Type2ScenarioSortMode,
  type Type2TreatmentScenario as BaseTreatmentScenario,
} from "./scenario-engine.js";

export { currentMedicationDailyUnits };
export type {
  Type2CostingPlan,
  Type2MonthlyCostEstimate,
  Type2MonthlyCostStatus,
  Type2ScenarioBuildInput,
  Type2ScenarioSortMode,
};

export type Type2ScenarioKind = BaseScenarioKind | "access_constrained";
export type Type2TreatmentScenario = Omit<BaseTreatmentScenario, "kind"> & { kind: Type2ScenarioKind };
type Type2CostingInput = Parameters<typeof estimateBase30DayCost>[0];
type DecisionGraphMedication = Type2MedicationConsideration & {
  decisionGraphAuthority?: true;
  decisionGraphRank?: number;
  decisionGraphComponentOrder?: number;
  decisionGraphRegimenId?: string;
};

function boundedCost(estimate: Type2MonthlyCostEstimate): Type2MonthlyCostEstimate {
  const retail = estimate.retailPerPackageToman;
  if (retail === undefined) return estimate;
  const patient = estimate.patientPerPackageToman === undefined
    ? undefined
    : Math.min(retail, Math.max(0, estimate.patientPerPackageToman));
  const insurer = estimate.insurerPerPackageToman === undefined
    ? undefined
    : Math.min(Math.max(0, retail - (patient ?? 0)), Math.max(0, estimate.insurerPerPackageToman));
  const packages = estimate.packagesFor30Days;
  return {
    ...estimate,
    patientPerPackageToman: patient,
    insurerPerPackageToman: insurer,
    patient30DaysToman: packages !== undefined && patient !== undefined ? packages * patient : estimate.patient30DaysToman,
    insurer30DaysToman: packages !== undefined && insurer !== undefined ? packages * insurer : estimate.insurer30DaysToman,
  };
}

export function estimateType2Medication30DayCost(input: Type2CostingInput): Type2MonthlyCostEstimate {
  return boundedCost(estimateBase30DayCost(input));
}

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

function accessConstrainedScenario(
  input: Type2ScenarioBuildInput,
  base: BaseTreatmentScenario | Type2TreatmentScenario,
): Type2TreatmentScenario {
  const insuranceOnly = input.request.costPreference === "insured_only";
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
    tradeoffsFa: [insuranceOnly
      ? "پوشش بیمه/فرآورده یا تغییر فیلتر هزینه باید توسط پزشک بازبینی شود؛ سیستم داروی بدون پوشش را خودکار جایگزین نمی‌کند."
      : "مسیر تجویز، منع مصرف‌ها و محدودیت‌های انتخاب‌شده باید توسط پزشک بازبینی شوند؛ سیستم محدودیت کاربر را خودکار دور نمی‌زند."],
    tradeoffsEn: [insuranceOnly
      ? "Review coverage, product availability, alternative access, or the cost filter; the system does not silently substitute an uninsured drug."
      : "Review route, contraindications, and selected constraints; the system does not silently bypass clinician/patient constraints."],
    cost30Days: [],
    urgentReview: input.assessment.recommendation.urgentReview,
  };
}

function boundScenarioCosts(scenario: BaseTreatmentScenario | Type2TreatmentScenario): Type2TreatmentScenario {
  return { ...scenario, cost30Days: scenario.cost30Days.map(boundedCost) };
}

function isDecisionGraphAssessment(input: Type2ScenarioBuildInput) {
  return input.assessment.recommendation.sourceReference.includes(TYPE2_DECISION_GRAPH_V2_AUTHORITY) ||
    input.assessment.medications.some((medication) =>
      (medication as DecisionGraphMedication).decisionGraphAuthority === true ||
      medication.sourceReference.includes(TYPE2_DECISION_GRAPH_V2_AUTHORITY),
    );
}

function graphMedicationCost(medication: Type2MedicationConsideration, input: Type2ScenarioBuildInput) {
  return estimateType2Medication30DayCost({
    price: medication.price,
    priceRange: medication.priceRange,
    coverages: medication.insuranceCoverages,
    insuranceProvider: input.insuranceProvider,
    plan: input.costingPlansByMedicationId?.[medication.genericMedicationId],
  });
}

function graphScenario(
  rank: 1 | 2 | 3,
  medications: Type2MedicationConsideration[],
  input: Type2ScenarioBuildInput,
): Type2TreatmentScenario {
  const first = medications[0] as DecisionGraphMedication | undefined;
  const rationale = [...new Set(medications.flatMap((medication) => medication.rankingReasons))];
  const cautions = [...new Set(medications.flatMap((medication) => medication.risks))];
  return {
    id: first?.decisionGraphRegimenId ?? `decision-graph-rank-${rank}`,
    rank,
    kind: rank === 1 ? "clinical_best" : "alternative",
    titleFa: rank === 1 ? "پیشنهاد اصلی" : rank === 2 ? "گزینه جایگزین ۱" : "گزینه جایگزین ۲",
    titleEn: rank === 1 ? "Primary recommendation" : rank === 2 ? "Alternative 1" : "Alternative 2",
    summaryFa: input.assessment.recommendation.title,
    summaryEn: rank === 1 ? "Decision Graph v2 primary regimen." : "Decision Graph v2 alternative regimen.",
    medicationIds: medications.map((medication) => medication.genericMedicationId),
    medications,
    rationaleFa: rationale,
    rationaleEn: [`${TYPE2_DECISION_GRAPH_V2_AUTHORITY}: rank ${rank}; no scenario-layer clinical rescoring.`],
    tradeoffsFa: cautions,
    tradeoffsEn: cautions,
    parallelCareFa: [],
    parallelCareEn: [],
    cost30Days: medications.map((medication) => graphMedicationCost(medication, input)),
    urgentReview: input.assessment.recommendation.urgentReview,
  };
}

function buildDecisionGraphScenarios(input: Type2ScenarioBuildInput): Type2TreatmentScenario[] {
  const grouped = new Map<number, DecisionGraphMedication[]>();
  for (const medication of input.assessment.medications as DecisionGraphMedication[]) {
    const rank = medication.decisionGraphRank;
    if (rank !== 1 && rank !== 2 && rank !== 3) continue;
    grouped.set(rank, [...(grouped.get(rank) ?? []), medication]);
  }

  const scenarios = ([1, 2, 3] as const)
    .flatMap((rank) => {
      const medications = (grouped.get(rank) ?? [])
        .sort((left, right) => (left.decisionGraphComponentOrder ?? 0) - (right.decisionGraphComponentOrder ?? 0));
      return medications.length ? [graphScenario(rank, medications, input)] : [];
    })
    .slice(0, input.maxScenarios ?? 3);
  if (scenarios.length) return scenarios;

  const maintain: Type2TreatmentScenario = {
    id: "decision-graph-maintain-monitor",
    rank: 1,
    kind: "maintain_monitor",
    titleFa: input.assessment.recommendation.title,
    titleEn: "Decision Graph clinical review",
    summaryFa: input.assessment.recommendation.rationale.join(" "),
    summaryEn: `${TYPE2_DECISION_GRAPH_V2_AUTHORITY}: no eligible new regimen was emitted.`,
    medicationIds: [],
    medications: [],
    rationaleFa: input.assessment.recommendation.rationale,
    rationaleEn: [`${TYPE2_DECISION_GRAPH_V2_AUTHORITY}: no scenario-layer clinical scoring was executed.`],
    tradeoffsFa: [],
    tradeoffsEn: [],
    parallelCareFa: [],
    parallelCareEn: [],
    cost30Days: [],
    urgentReview: input.assessment.recommendation.urgentReview,
  };
  return stillNeedsClinicalAction(input) ? [accessConstrainedScenario(input, maintain)] : [maintain];
}

export function buildType2TreatmentScenarios(input: Type2ScenarioBuildInput): Type2TreatmentScenario[] {
  if (isDecisionGraphAssessment(input)) return buildDecisionGraphScenarios(input).map(boundScenarioCosts);

  const scenarios = buildBaseScenarios(input);
  if (scenarios.length === 1 && scenarios[0]?.kind === "maintain_monitor" && stillNeedsClinicalAction(input)) {
    return [boundScenarioCosts(accessConstrainedScenario(input, scenarios[0]))];
  }
  return scenarios.map(boundScenarioCosts);
}
