import type {
  DecisionGraphRequestV2,
  EvidenceReferenceV2,
  MissingDataRequirementV2,
} from "./types.js";

export type NutritionSupportIntentV2 =
  | "glycemic_benefit"
  | "documented_deficiency"
  | "malnutrition_support"
  | "special_population"
  | "unspecified";

export type NutritionSpecialPopulationV2 =
  | "pregnant"
  | "lactating"
  | "older_adult"
  | "vegetarian_or_vegan"
  | "very_low_calorie_or_low_carbohydrate_pattern";

export interface NutritionSupportContextV2 {
  intent?: NutritionSupportIntentV2;
  documentedMicronutrientDeficiency?: boolean;
  deficiencyName?: string;
  deficiencyLabValueKnown?: boolean;
  malnutritionRiskOrDiagnosis?: boolean;
  intentionalWeightLoss?: boolean;
  specialPopulation?: NutritionSpecialPopulationV2;
  metforminUse?: boolean;
  anemiaOrPeripheralNeuropathy?: boolean;
  betaCaroteneSupplementUseOrPlan?: boolean;
}

export type DecisionGraphRequestWithNutritionSupportV2 = Omit<DecisionGraphRequestV2, "patient"> & {
  patient: DecisionGraphRequestV2["patient"] & { nutritionSupport?: NutritionSupportContextV2 };
};

export type NutritionSupportPathwayStateV2 =
  | "not_requested"
  | "glycemic_supplement_not_recommended"
  | "deficiency_treatment_review"
  | "malnutrition_assessment"
  | "special_population_review"
  | "needs_indication";

export interface NutritionSupportPathwayResolutionV2 {
  state: NutritionSupportPathwayStateV2;
  supplementOrNutritionPrescriptionExecution: false;
  actions: string[];
  missingData: MissingDataRequirementV2[];
  evidence: EvidenceReferenceV2[];
}

export const ada2026NutritionSupplementEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA5-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 5: Facilitating Positive Health Behaviors and Well-being to Improve Health Outcomes",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S89/163932/5-Facilitating-Positive-Health-Behaviors-and-Well",
  locator: "Recommendation 5.16; Micronutrients and Other Supplements",
  strength: "guideline_grade_c",
};

export const ada2026NutritionAdequacyEvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA5-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 5: Facilitating Positive Health Behaviors and Well-being to Improve Health Outcomes",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S89/163932/5-Facilitating-Positive-Health-Behaviors-and-Well",
  locator: "Recommendation 5.23; Micronutrients and Other Supplements",
  strength: "expert_consensus",
};

export const ada2026MetforminB12EvidenceV2: EvidenceReferenceV2 = {
  sourceId: "ADA5-2026",
  title: "ADA Standards of Care in Diabetes—2026, Section 5: Facilitating Positive Health Behaviors and Well-being to Improve Health Outcomes",
  version: "2026",
  url: "https://diabetesjournals.org/care/article/49/Supplement_1/S89/163932/5-Facilitating-Positive-Health-Behaviors-and-Well",
  locator: "Micronutrients and Other Supplements: metformin-associated vitamin B12 deficiency",
  strength: "supportive",
};

function nutritionContext(request: DecisionGraphRequestV2): NutritionSupportContextV2 | undefined {
  return (request.patient as DecisionGraphRequestWithNutritionSupportV2["patient"]).nutritionSupport;
}

function addMissing(result: MissingDataRequirementV2[], item: MissingDataRequirementV2) {
  if (!result.some((existing) => existing.key === item.key)) result.push(item);
}

/**
 * Nutrition-support safety boundary for the general Type 2 workflow.
 *
 * Diabetes alone never creates a vitamin, mineral, herbal, enteral or parenteral
 * prescription. The module can reject glycemic-supplement intent, request a
 * deficiency-specific review, or surface nutrition assessment needs. Exact
 * replacement products/doses remain outside this generic lane until a named
 * deficiency protocol is separately reviewed.
 */
export function resolveNutritionSupportBoundaryV2(
  request: DecisionGraphRequestV2,
): NutritionSupportPathwayResolutionV2 {
  const context = nutritionContext(request);
  if (!context) {
    return {
      state: "not_requested",
      supplementOrNutritionPrescriptionExecution: false,
      actions: [],
      missingData: [],
      evidence: [ada2026NutritionSupplementEvidenceV2],
    };
  }

  const actions: string[] = [];
  const missingData: MissingDataRequirementV2[] = [];

  if (context.betaCaroteneSupplementUseOrPlan === true) {
    actions.push("مصرف/برنامه مکمل β-carotene باید بازبینی شود؛ ADA 2026 به دلیل شواهد زیان و نبود منفعت، علیه supplementation آن توصیه می‌کند.");
  }

  if (context.metforminUse === true && context.anemiaOrPeripheralNeuropathy === true) {
    actions.push("به دلیل مصرف metformin همراه anemia یا peripheral neuropathy، بررسی دوره‌ای vitamin B12 باید مدنظر قرار گیرد؛ کمبود B12 از روی علائم به‌تنهایی فرض نمی‌شود.");
  }

  if (context.intent === "glycemic_benefit") {
    actions.unshift(
      "مکمل micronutrient/herbal صرفاً برای بهبود glycemia توصیه نمی‌شود؛ diabetes به‌تنهایی indication برای vitamin/mineral/herbal prescription ایجاد نمی‌کند.",
    );
    return {
      state: "glycemic_supplement_not_recommended",
      supplementOrNutritionPrescriptionExecution: false,
      actions,
      missingData,
      evidence: [ada2026NutritionSupplementEvidenceV2, ada2026MetforminB12EvidenceV2],
    };
  }

  if (context.intent === "documented_deficiency" || context.documentedMicronutrientDeficiency === true) {
    if (!context.deficiencyName?.trim()) {
      addMissing(missingData, {
        key: "nutritionSupport.deficiencyName",
        priority: "required",
        blocksFinalDecision: false,
        reason: "برای ورود به مسیر درمان کمبود باید nutrient/deficiency مشخص باشد؛ عبارت کلی «کمبود ویتامین» برای انتخاب درمان کافی نیست.",
        evidence: [ada2026NutritionSupplementEvidenceV2],
      });
    }
    if (context.deficiencyLabValueKnown !== true) {
      addMissing(missingData, {
        key: "nutritionSupport.deficiencyLabValue",
        priority: "recommended",
        blocksFinalDecision: false,
        reason: "مقدار آزمایشگاهی/شواهد objective کمبود برای تعیین شدت و طراحی پروتکل جایگزینی لازم است؛ دوز از نام کمبود حدس زده نمی‌شود.",
        evidence: [ada2026NutritionSupplementEvidenceV2],
      });
    }
    actions.unshift(
      "کمبود مستند می‌تواند treatment review مستقل ایجاد کند، اما این lane عمومی محصول یا دوز جایگزینی را خودکار نمی‌سازد؛ پروتکل nutrient-specific و علت کمبود باید جداگانه بررسی شوند.",
    );
    return {
      state: "deficiency_treatment_review",
      supplementOrNutritionPrescriptionExecution: false,
      actions,
      missingData,
      evidence: [ada2026NutritionSupplementEvidenceV2, ada2026MetforminB12EvidenceV2],
    };
  }

  if (context.intent === "malnutrition_support" || context.malnutritionRiskOrDiagnosis === true) {
    actions.unshift(
      "malnutrition نیازمند ارزیابی تغذیه‌ای ساختاریافته و تعیین route/intake/etiology است؛ وجود diabetes به‌تنهایی مجوز enteral/parenteral nutrition یا supplement prescription نیست.",
    );
    if (context.intentionalWeightLoss === true) {
      actions.push("در intentional weight loss، کفایت پروتئین و micronutrients باید به‌طور منظم پایش شود.");
    }
    return {
      state: "malnutrition_assessment",
      supplementOrNutritionPrescriptionExecution: false,
      actions,
      missingData,
      evidence: [ada2026NutritionAdequacyEvidenceV2, ada2026NutritionSupplementEvidenceV2],
    };
  }

  if (context.intent === "special_population" || context.specialPopulation) {
    if (!context.specialPopulation) {
      addMissing(missingData, {
        key: "nutritionSupport.specialPopulation",
        priority: "required",
        blocksFinalDecision: false,
        reason: "برای special-population nutrition review باید جمعیت خاص مشخص شود؛ نیاز به multivitamin یا supplementation از diabetes به‌تنهایی استنباط نمی‌شود.",
        evidence: [ada2026NutritionSupplementEvidenceV2],
      });
    }
    actions.unshift(
      "در برخی special populations ممکن است multivitamin یا nutrition support لازم باشد، اما نیاز باید فردی و بر اساس intake/deficiency/مرحله زندگی ارزیابی شود.",
    );
    return {
      state: "special_population_review",
      supplementOrNutritionPrescriptionExecution: false,
      actions,
      missingData,
      evidence: [ada2026NutritionSupplementEvidenceV2, ada2026NutritionAdequacyEvidenceV2],
    };
  }

  addMissing(missingData, {
    key: "nutritionSupport.indication",
    priority: "required",
    blocksFinalDecision: false,
    reason: "nutrition-support intent مشخص نیست؛ قبل از هر توصیه باید معلوم شود هدف glycemic benefit، deficiency، malnutrition یا special-population support است.",
    evidence: [ada2026NutritionSupplementEvidenceV2],
  });
  actions.unshift("تا مشخص‌شدن indication، مکمل یا nutrition prescription خودکار ساخته نمی‌شود.");

  return {
    state: "needs_indication",
    supplementOrNutritionPrescriptionExecution: false,
    actions,
    missingData,
    evidence: [ada2026NutritionSupplementEvidenceV2],
  };
}
