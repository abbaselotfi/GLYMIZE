import type {
  ClinicalStateV2,
  DecisionGraphPolicyV2,
  DecisionGraphRequestV2,
  MissingDataRequirementV2,
} from "./types.js";

function hasPatternData(request: DecisionGraphRequestV2) {
  const glycemia = request.patient.glycemia;
  if (glycemia.twoHourPostprandialGlucoseMgDl !== undefined) return true;
  if ((glycemia.smbg?.twoHourPostmealMgDl?.length ?? 0) > 0) return true;
  if (glycemia.cgm?.timeAbove180Percent !== undefined || glycemia.cgm?.timeInRange70To180Percent !== undefined) return true;
  return false;
}

export function resolveAdaptiveDataRequirementsV2(
  request: DecisionGraphRequestV2,
  state: ClinicalStateV2,
  policy: DecisionGraphPolicyV2,
): MissingDataRequirementV2[] {
  const result: MissingDataRequirementV2[] = [];
  const add = (item: MissingDataRequirementV2) => {
    if (!result.some((existing) => existing.key === item.key)) result.push(item);
  };
  // GLYMIZE_CORE_GLYCEMIA_MISSING_DATA_V7
  const currentHba1c = request.patient.glycemia.currentHba1c;
  if (typeof currentHba1c !== "number" || !Number.isFinite(currentHba1c)) {
    add({
      key: "glycemia.currentHba1c",
      priority: "required",
      blocksFinalDecision: true,
      reason: "A1C فعلی در دسترس نیست؛ مقدار تخمینی ساخته نمی‌شود و تصمیم روتین گلیسمی تا تکمیل داده مسدود می‌ماند.",
      evidence: [policy.evidence.glycemicGoals],
    });
  }

  const targetHba1c = request.patient.glycemia.targetHba1c;
  if (typeof targetHba1c !== "number" || !Number.isFinite(targetHba1c)) {
    add({
      key: "glycemia.targetHba1c",
      priority: "required",
      blocksFinalDecision: true,
      reason: "هدف فردی A1C مشخص نیست؛ بدون هدف مستند، موتور رسیدن به هدف یا نیاز به تشدید را قطعی اعلام نمی‌کند.",
      evidence: [policy.evidence.glycemicGoals],
    });
  }

  if ((state.insulinAction === "evaluate_start_basal" || state.insulinAction === "titrate_basal") && request.patient.anthropometrics?.weightKg === undefined) {
    add({
      key: "anthropometrics.weightKg",
      priority: "required",
      blocksFinalDecision: state.insulinAction === "evaluate_start_basal",
      reason: "برای پیشنهاد دوز شروع انسولین پایه به وزن نیاز است.",
      evidence: [policy.evidence.pharmacologic],
    });
  }

  if (state.pathway === "insulin_centered" && request.patient.glycemia.fastingPlasmaGlucoseMgDl === undefined) {
    add({
      key: "glycemia.fastingPlasmaGlucoseMgDl",
      priority: "recommended",
      blocksFinalDecision: false,
      reason: "FPG برای تعیین سهم basal و تیتراسیون بعدی انسولین بسیار مهم است.",
      evidence: [policy.evidence.pharmacologic, policy.evidence.glycemicGoals],
    });
  }

  if ((state.insulinAction === "request_postprandial_pattern" || (state.fastingAtTarget === true && state.hba1cGap > 0)) && !hasPatternData(request)) {
    add({
      key: "glycemia.postprandialPattern",
      priority: "required",
      blocksFinalDecision: state.insulinAction === "request_postprandial_pattern",
      reason: "وقتی FPG به هدف رسیده ولی A1C بالا مانده است، 2hPPG یا الگوی SMBG/CGM برای تصمیم درباره درمان پس از غذا لازم است.",
      evidence: [policy.evidence.glycemicGoals, policy.evidence.technology],
    });
  }

  if (request.patient.kidney?.ckd) {
    if (request.patient.kidney.eGfr === undefined) {
      add({
        key: "kidney.eGfr",
        priority: "required",
        blocksFinalDecision: true,
        reason: "eGFR برای eligibility و ایمنی بسیاری از درمان‌های دیابت/کلیه لازم است.",
        evidence: [],
      });
    }
    if (request.patient.kidney.uacrMgG === undefined) {
      add({
        key: "kidney.uacrMgG",
        priority: "recommended",
        blocksFinalDecision: false,
        reason: "UACR شدت فنوتیپ کلیوی و نیاز به درمان محافظتی را دقیق‌تر می‌کند.",
        evidence: [],
      });
    }
  }

  if (request.patient.cardiovascular?.heartFailure && request.patient.cardiovascular.lvefPercent === undefined) {
    add({
      key: "cardiovascular.lvefPercent",
      priority: "recommended",
      blocksFinalDecision: false,
      reason: "LVEF برای phenotype نارسایی قلبی و انتخاب درمان‌های اختصاصی مفید است.",
      evidence: [],
    });
  }

  if (request.preferences.costPreference === "insured_only" && !(request.preferences.insuranceProviders?.length)) {
    add({
      key: "preferences.insuranceProviders",
      priority: "required",
      blocksFinalDecision: true,
      reason: "برای اعمال شرط insured-only باید بیمه/بیمه‌های بیمار مشخص باشد.",
      evidence: [],
    });
  }

  return result;
}
