import { resolveCardiovascularRiskObjectivesV2 } from "./cardiovascular-objectives.js";
import type {
  ClinicalObjectiveV2,
  ClinicalStateV2,
  DecisionGraphPolicyV2,
  DecisionGraphRequestV2,
} from "./types.js";

export function resolveClinicalObjectivesV2(
  request: DecisionGraphRequestV2,
  state: ClinicalStateV2,
  policy: DecisionGraphPolicyV2,
): ClinicalObjectiveV2[] {
  const objectives: ClinicalObjectiveV2[] = [];
  const add = (objective: ClinicalObjectiveV2) => {
    const existing = objectives.find((item) => item.id === objective.id);
    if (!existing) objectives.push(objective);
    else if (existing.level !== "mandatory" && objective.level === "mandatory") Object.assign(existing, objective);
  };

  if (state.hba1cGap > 0) {
    add({
      id: "glycemic_control",
      lane: "glycemic",
      level: "mandatory",
      reason: "A1C بالاتر از هدف فردی است.",
      evidence: [policy.evidence.pharmacologic],
    });
  }

  if (state.pathway === "high_efficacy_combination") {
    add({
      id: "high_efficacy_glycemic_control",
      lane: "glycemic",
      level: "mandatory",
      reason: `فاصله A1C حداقل ${policy.combinationTherapyA1cGapAtOrAbove} واحد درصد است؛ رژیم باید اثربخشی کافی برای این فاصله داشته باشد.`,
      evidence: [policy.evidence.pharmacologic],
    });
  }

  if (state.pathway === "insulin_centered") {
    add({
      id: "insulin_replacement",
      lane: "glycemic",
      level: "mandatory",
      reason: "معیارهای هایپرگلیسمی شدید/کمبود نسبی انسولین مسیر بررسی انسولین را فعال کرده‌اند.",
      evidence: [policy.evidence.pharmacologic],
    });
  }

  if (request.patient.kidney?.ckd) {
    add({
      id: "kidney_protection",
      lane: "kidney",
      level: "mandatory",
      reason: "CKD فعال است؛ منفعت کلیوی باید مستقل از صرف کاهش A1C در تصمیم لحاظ شود.",
      evidence: [],
    });
  }

  if (request.patient.cardiovascular?.heartFailure) {
    add({
      id: "heart_failure_protection",
      lane: "heart_failure",
      level: "mandatory",
      reason: "نارسایی قلبی فعال است و outcome قلبی باید هدف مستقل درمان باشد.",
      evidence: [],
    });
  }

  if (request.patient.cardiovascular?.ascvd) {
    add({
      id: "ascvd_protection",
      lane: "ascvd",
      level: "mandatory",
      reason: "ASCVD فعال است؛ انتخاب باید شواهد outcome قلبی‌عروقی را پوشش دهد.",
      evidence: [],
    });
  }

  for (const objective of resolveCardiovascularRiskObjectivesV2(request)) {
    add(objective);
  }

  if ((request.patient.anthropometrics?.bmi ?? 0) >= 30) {
    add({
      id: "weight_benefit",
      lane: "glycemic",
      level: "strong_preference",
      reason: "BMI در محدوده چاقی است؛ در میان گزینه‌های بالینی مناسب، اثر مطلوب وزن ترجیح دارد.",
      evidence: [policy.evidence.pharmacologic],
    });
  }

  if (request.patient.hypoglycemiaRisk === "high") {
    add({
      id: "low_hypoglycemia_risk",
      lane: "glycemic",
      level: "strong_preference",
      reason: "ریسک هیپوگلیسمی بالا است؛ درمان‌های با ریسک ذاتی کمتر ترجیح دارند.",
      evidence: [policy.evidence.pharmacologic],
    });
  }

  if (request.patient.liver?.masldMash) {
    add({
      id: "liver_directed_therapy",
      lane: "liver",
      level: "strong_preference",
      reason: "MASLD/MASH فعال است؛ stage و شواهد کبدی باید در انتخاب لحاظ شوند.",
      evidence: [],
    });
  }

  return objectives;
}
