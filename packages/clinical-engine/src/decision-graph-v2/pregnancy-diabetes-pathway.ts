import type {
  CurrentMedicationV2,
  DecisionGraphRequestV2,
  EvidenceReferenceV2,
  MissingDataRequirementV2,
} from "./types.js";

export type PregnancyDiabetesTypeV2 = "type1" | "type2" | "gdm" | "unknown";

export interface PregnancyDiabetesContextV2 {
  diabetesType?: PregnancyDiabetesTypeV2;
  gestationalAgeWeeks?: number;
  preconceptionPlanning?: boolean;
  significantHypoglycemiaPreventingTightTarget?: boolean;
  metforminForPcosOvulation?: boolean;
  pregnancySpecialistTeamEstablished?: boolean;
}

export type DecisionGraphRequestWithPregnancyCareV2 = Omit<DecisionGraphRequestV2, "patient"> & {
  patient: DecisionGraphRequestV2["patient"] & { pregnancyCare?: PregnancyDiabetesContextV2 };
};

export type PregnancyDiabetesPathwayStateV2 =
  | "not_pregnant"
  | "needs_diabetes_type"
  | "type1_insulin_required"
  | "type2_insulin_preferred"
  | "gdm_lifestyle_then_insulin_if_needed";

export interface PregnancyGlycemicTargetsV2 {
  fastingMgDlUpperExclusive: 95;
  oneHourPostprandialMgDlUpperExclusive: 140;
  twoHourPostprandialMgDlUpperExclusive: 120;
  idealA1cPercentUpperExclusive: 6;
  relaxedA1cPercentUpperExclusiveWhenNeededToPreventSignificantHypoglycemia: 7;
}

export interface PregnancyMedicationReviewV2 {
  medication: string;
  category:
    | "metformin_or_glyburide_not_first_line"
    | "other_noninsulin_glucose_lowering_not_recommended"
    | "pcos_metformin_stop_by_end_first_trimester";
  action: string;
  automaticStopOrder: false;
}

export interface PregnancyDiabetesPathwayResolutionV2 {
  state: PregnancyDiabetesPathwayStateV2;
  insulinPreferredOrRequired: boolean;
  autonomousInsulinDoseExecution: false;
  targets: PregnancyGlycemicTargetsV2 | null;
  glucoseAbovePregnancyTarget: boolean | null;
  medicationReviews: PregnancyMedicationReviewV2[];
  actions: string[];
  missingData: MissingDataRequirementV2[];
  evidence: EvidenceReferenceV2[];
}

export const ada2026PregnancyGlycemicTargetsEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA15-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 15: Management of Diabetes in Pregnancy",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S321/163918/15-Management-of-Diabetes-in-Pregnancy-Standards",
  locator: "Recommendations 15.8-15.11; Table 15.2",
  strength: "guideline_grade_b",
};

export const ada2026PregnancyInsulinEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA15-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 15: Management of Diabetes in Pregnancy",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S321/163918/15-Management-of-Diabetes-in-Pregnancy-Standards",
  locator: "Recommendations 15.15, 15.17-15.22",
  strength: "guideline_grade_a",
};

const targets: PregnancyGlycemicTargetsV2 = {
  fastingMgDlUpperExclusive: 95,
  oneHourPostprandialMgDlUpperExclusive: 140,
  twoHourPostprandialMgDlUpperExclusive: 120,
  idealA1cPercentUpperExclusive: 6,
  relaxedA1cPercentUpperExclusiveWhenNeededToPreventSignificantHypoglycemia: 7,
};

function context(request: DecisionGraphRequestV2): PregnancyDiabetesContextV2 | undefined {
  return (request.patient as DecisionGraphRequestWithPregnancyCareV2["patient"]).pregnancyCare;
}

function addMissing(result: MissingDataRequirementV2[], item: MissingDataRequirementV2) {
  if (!result.some((existing) => existing.key === item.key)) result.push(item);
}

function active(medication: CurrentMedicationV2) {
  return medication.status === undefined || medication.status === "active";
}

function normalized(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function isInsulin(medication: CurrentMedicationV2) {
  const group = normalized(medication.therapyGroup);
  const name = normalized(medication.genericName);
  return group.includes("insulin") || /\binsulin\b/.test(name);
}

function isMetformin(medication: CurrentMedicationV2) {
  return /\bmetformin\b/i.test(medication.genericName) || normalized(medication.therapyGroup) === "biguanide";
}

function isGlyburide(medication: CurrentMedicationV2) {
  return /\b(glyburide|glibenclamide)\b/i.test(medication.genericName);
}

function appearsGlucoseLowering(medication: CurrentMedicationV2) {
  const group = normalized(medication.therapyGroup);
  const name = normalized(medication.genericName);
  if (isInsulin(medication) || isMetformin(medication) || isGlyburide(medication)) return true;
  return [
    "sulfonylurea",
    "dpp",
    "sglt",
    "glp",
    "gip",
    "thiazolidinedione",
    "meglitinide",
    "alpha-glucosidase",
  ].some((token) => group.includes(token) || name.includes(token));
}

function medicationReviews(
  request: DecisionGraphRequestV2,
  pregnancyContext: PregnancyDiabetesContextV2,
): PregnancyMedicationReviewV2[] {
  const reviews: PregnancyMedicationReviewV2[] = [];
  for (const medication of request.patient.currentMedications ?? []) {
    if (!active(medication) || isInsulin(medication) || !appearsGlucoseLowering(medication)) continue;
    if (isMetformin(medication) || isGlyburide(medication)) {
      reviews.push({
        medication: medication.genericName,
        category: "metformin_or_glyburide_not_first_line",
        action: "این دارو در بارداری first-line نیست؛ برنامه درمان باید با تیم بارداری/دیابت بازبینی شود و insulin بر اساس نوع دیابت و اهداف بارداری در اولویت قرار گیرد.",
        automaticStopOrder: false,
      });
      continue;
    }
    reviews.push({
      medication: medication.genericName,
      category: "other_noninsulin_glucose_lowering_not_recommended",
      action: "oral/noninsulin injectable glucose-lowering therapy در بارداری فاقد داده ایمنی طولانی‌مدت کافی است و توصیه نمی‌شود؛ نیاز به medication reconciliation فوری دارد.",
      automaticStopOrder: false,
    });
  }

  if (pregnancyContext.metforminForPcosOvulation === true) {
    reviews.push({
      medication: "metformin (PCOS/ovulation indication)",
      category: "pcos_metformin_stop_by_end_first_trimester",
      action: "اگر metformin برای PCOS و القای تخمک‌گذاری استفاده شده، ADA 2026 توصیه می‌کند تا پایان سه‌ماهه اول قطع شود؛ این خروجی order خودکار برای قطع ایجاد نمی‌کند.",
      automaticStopOrder: false,
    });
  }

  return reviews;
}

function abovePregnancyTarget(request: DecisionGraphRequestV2): boolean | null {
  const fasting = request.patient.glycemia.fastingPlasmaGlucoseMgDl;
  const twoHour = request.patient.glycemia.twoHourPostprandialGlucoseMgDl;
  if (fasting === undefined && twoHour === undefined) return null;
  return (fasting !== undefined && fasting >= targets.fastingMgDlUpperExclusive) ||
    (twoHour !== undefined && twoHour >= targets.twoHourPostprandialMgDlUpperExclusive);
}

/**
 * Dedicated pregnancy lane for diabetes therapy safety.
 *
 * This pathway intentionally does not reuse the ordinary Type 2 medication
 * ranking as pregnancy treatment authority. It establishes pregnancy-specific
 * targets, identifies when insulin is required/preferred, and flags active
 * noninsulin glucose-lowering therapy for pregnancy review. Exact insulin dose
 * initiation/titration remains clinician/team controlled because insulin needs
 * change rapidly across gestation and postpartum.
 */
export function resolvePregnancyDiabetesPathwayV2(
  request: DecisionGraphRequestV2,
): PregnancyDiabetesPathwayResolutionV2 {
  if (request.patient.pregnancy !== true) {
    return {
      state: "not_pregnant",
      insulinPreferredOrRequired: false,
      autonomousInsulinDoseExecution: false,
      targets: null,
      glucoseAbovePregnancyTarget: null,
      medicationReviews: [],
      actions: [],
      missingData: [],
      evidence: [ada2026PregnancyGlycemicTargetsEvidenceV2, ada2026PregnancyInsulinEvidenceV2],
    };
  }

  const pregnancyContext = context(request) ?? {};
  const missingData: MissingDataRequirementV2[] = [];
  const reviews = medicationReviews(request, pregnancyContext);
  const aboveTarget = abovePregnancyTarget(request);

  if (!pregnancyContext.diabetesType || pregnancyContext.diabetesType === "unknown") {
    addMissing(missingData, {
      key: "pregnancyCare.diabetesType",
      priority: "required",
      blocksFinalDecision: true,
      reason: "در بارداری باید نوع دیابت (T1D، T2D یا GDM) مشخص باشد؛ مسیر درمانی و الزام insulin بدون این داده نباید از موتور عمومی Type 2 استنباط شود.",
      evidence: [ada2026PregnancyInsulinEvidenceV2],
    });
    return {
      state: "needs_diabetes_type",
      insulinPreferredOrRequired: false,
      autonomousInsulinDoseExecution: false,
      targets,
      glucoseAbovePregnancyTarget: aboveTarget,
      medicationReviews: reviews,
      actions: [
        "pregnancy-specific glycemic targets را اعمال کنید و نوع دیابت را قبل از انتخاب therapy مشخص کنید.",
        "درمان بارداری باید توسط تیم دارای تجربه مرتبط review شود؛ ordinary Type 2 medication ranking نباید نقش pregnancy prescribing authority را بگیرد.",
      ],
      missingData,
      evidence: [ada2026PregnancyGlycemicTargetsEvidenceV2, ada2026PregnancyInsulinEvidenceV2],
    };
  }

  const actions: string[] = [
    "اهداف glucose بارداری را به‌جای targets عمومی Type 2 استفاده کنید: fasting <95 mg/dL و 1-h postprandial <140 یا 2-h postprandial <120 mg/dL.",
    pregnancyContext.significantHypoglycemiaPreventingTightTarget === true
      ? "A1C هدف می‌تواند برای پیشگیری از hypoglycemia قابل‌توجه تا <7% شل‌تر شود؛ هدف ایده‌آل <6% است اگر ایمن باشد."
      : "A1C ایده‌آل در بارداری <6% است اگر بدون hypoglycemia قابل‌توجه قابل دستیابی باشد.",
    "insulin initiation/titration باید با پایش مکرر glucose و clinician/team review انجام شود؛ این lane هیچ دوز خودکاری تولید نمی‌کند.",
  ];

  if (pregnancyContext.pregnancySpecialistTeamEstablished !== true) {
    actions.push("care با تیم interprofessional دارای تجربه diabetes-in-pregnancy برقرار/هماهنگ شود.");
  }

  if (pregnancyContext.diabetesType === "type1") {
    actions.unshift("در T1D بارداری insulin باید برای مدیریت دیابت استفاده شود.");
    return {
      state: "type1_insulin_required",
      insulinPreferredOrRequired: true,
      autonomousInsulinDoseExecution: false,
      targets,
      glucoseAbovePregnancyTarget: aboveTarget,
      medicationReviews: reviews,
      actions,
      missingData,
      evidence: [ada2026PregnancyGlycemicTargetsEvidenceV2, ada2026PregnancyInsulinEvidenceV2],
    };
  }

  if (pregnancyContext.diabetesType === "type2") {
    actions.unshift("در T2D بارداری insulin agent ترجیحی است؛ ordinary Type 2 noninsulin ranking نباید به‌عنوان درمان اصلی بارداری اجرا شود.");
    return {
      state: "type2_insulin_preferred",
      insulinPreferredOrRequired: true,
      autonomousInsulinDoseExecution: false,
      targets,
      glucoseAbovePregnancyTarget: aboveTarget,
      medicationReviews: reviews,
      actions,
      missingData,
      evidence: [ada2026PregnancyGlycemicTargetsEvidenceV2, ada2026PregnancyInsulinEvidenceV2],
    };
  }

  actions.unshift(
    aboveTarget === true
      ? "در GDM، lifestyle پایه درمان است و چون glucose ثبت‌شده بالاتر از target بارداری است، نیاز به insulin escalation باید توسط تیم درمان ارزیابی شود."
      : "در GDM، lifestyle جزء اساسی درمان است و ممکن است کافی باشد؛ اگر اهداف glucose حاصل نشوند insulin اضافه می‌شود.",
  );
  return {
    state: "gdm_lifestyle_then_insulin_if_needed",
    insulinPreferredOrRequired: aboveTarget === true,
    autonomousInsulinDoseExecution: false,
    targets,
    glucoseAbovePregnancyTarget: aboveTarget,
    medicationReviews: reviews,
    actions,
    missingData,
    evidence: [ada2026PregnancyGlycemicTargetsEvidenceV2, ada2026PregnancyInsulinEvidenceV2],
  };
}
