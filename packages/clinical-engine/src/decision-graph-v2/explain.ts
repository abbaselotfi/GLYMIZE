import type { ClinicalObjectiveV2, ClinicalStateV2, DecisionGraphRequestV2, RecommendationV2, RegimenCandidateV2 } from "./types.js";

function uniqueEvidence(candidate: RegimenCandidateV2) {
  const map = new Map(candidate.evidence.map((item) => [item.sourceId, item]));
  for (const component of candidate.components) {
    for (const evidence of component.dosePlan?.evidence ?? []) map.set(evidence.sourceId, evidence);
  }
  return [...map.values()];
}

export function toRecommendationV2(
  candidate: RegimenCandidateV2,
  objectives: readonly ClinicalObjectiveV2[],
  request: DecisionGraphRequestV2,
  clinicalState: ClinicalStateV2,
): RecommendationV2 {
  const whySelected: string[] = [];
  for (const objective of objectives) {
    if (candidate.objectiveCoverage.includes(objective.id)) whySelected.push(`پوشش ${objective.level}: ${objective.reason}`);
  }
  if (candidate.routeFit === "match") whySelected.push("با ترجیح مسیر مصرف پزشک/بیمار هم‌راستا است.");
  if (candidate.insuranceFit === "eligible") whySelected.push("حداقل یک مسیر بیمه‌ای انتخاب‌شده قابل استفاده است.");
  if (candidate.monthlyPatientCostToman !== undefined) whySelected.push(`هزینه برآوردی ۳۰ روزه: ${candidate.monthlyPatientCostToman.toLocaleString("en-US")} تومان.`);
  if (candidate.kind === "fixed_dose_combination") whySelected.push("فرآورده ترکیبی ثبت‌شده است و در صورت معادل بودن اجزا، pill burden را کاهش می‌دهد.");
  whySelected.push(...candidate.reasons);

  const hasInsulin = candidate.components.some((component) => /insulin|fixed_ratio_combination/.test(component.therapyGroup));
  return {
    ...candidate,
    whySelected,
    evidenceSummary: uniqueEvidence(candidate),
    insulinToolAction: hasInsulin
      ? {
          action: clinicalState.insulinAction,
          launchRecommended: true,
          reason: "این Recommendation شامل انسولین/FRC است؛ ابزار انسولین باید با Context همین encounter باز شود.",
        }
      : undefined,
  };
}
