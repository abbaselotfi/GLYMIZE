import type { Type2ParallelSafetyProjectionV2 } from "@glymize/clinical-engine/type2-intake-v2";

export type Type2ParallelSafetyLocale = "fa" | "en";
export type Type2ParallelSafetyTone = "info" | "review" | "prompt" | "urgent";

export type Type2ParallelSafetyCard = {
  id: string;
  title: string;
  subtitle: string;
  tone: Type2ParallelSafetyTone;
  badge: string;
  bullets: string[];
  missingKeys: string[];
  evidence: Array<{ sourceId: string; title: string; locator?: string; url?: string }>;
};

const footState: Record<string, { fa: string; en: string }> = {
  needs_infection_assessment: { fa: "ابتدا وجود عفونت مشخص شود", en: "Clinical infection assessment required" },
  uninfected_ulcer: { fa: "زخم بدون شواهد بالینی عفونت", en: "Clinically uninfected ulcer" },
  infected_mild: { fa: "عفونت خفیف پای دیابتی", en: "Mild diabetes-related foot infection" },
  infected_moderate: { fa: "عفونت متوسط پای دیابتی", en: "Moderate diabetes-related foot infection" },
  infected_severe: { fa: "عفونت شدید پای دیابتی", en: "Severe diabetes-related foot infection" },
  infected_needs_severity: { fa: "شدت عفونت باید تعیین شود", en: "Infection severity must be classified" },
};

const nutritionState: Record<string, { fa: string; en: string }> = {
  glycemic_supplement_not_recommended: { fa: "مکمل برای بهبود قند توصیه نمی‌شود", en: "Supplements are not recommended for glycemic benefit" },
  deficiency_treatment_review: { fa: "کمبود مستند نیازمند بازبینی اختصاصی است", en: "Documented deficiency needs nutrient-specific review" },
  malnutrition_assessment: { fa: "ارزیابی ساختاریافته سوءتغذیه لازم است", en: "Structured malnutrition assessment is required" },
  special_population_review: { fa: "نیاز تغذیه‌ای جمعیت ویژه باید فردی ارزیابی شود", en: "Special-population nutrition needs require individual review" },
  needs_indication: { fa: "اندیکاسیون حمایت تغذیه‌ای باید مشخص شود", en: "Nutrition-support indication must be specified" },
};

const pregnancyState: Record<string, { fa: string; en: string }> = {
  needs_diabetes_type: { fa: "نوع دیابت در بارداری باید مشخص شود", en: "Diabetes type in pregnancy must be specified" },
  type1_insulin_required: { fa: "در دیابت نوع ۱ بارداری انسولین الزامی است", en: "Insulin is required for type 1 diabetes in pregnancy" },
  type2_insulin_preferred: { fa: "در دیابت نوع ۲ بارداری انسولین درمان ترجیحی است", en: "Insulin is preferred for type 2 diabetes in pregnancy" },
  gdm_lifestyle_then_insulin_if_needed: { fa: "GDM: سبک زندگی و در صورت نیاز تشدید با انسولین", en: "GDM: lifestyle first, then insulin if targets are not met" },
};

export function parallelSafetyLabel(locale: Type2ParallelSafetyLocale, fa: string, en: string) {
  return locale === "fa" ? fa : en;
}

function uniqueEvidence(values: Type2ParallelSafetyCard["evidence"]) {
  const map = new Map<string, Type2ParallelSafetyCard["evidence"][number]>();
  for (const item of values) map.set(item.sourceId, item);
  return [...map.values()];
}

function missingKeys(values: Array<{ key: string }>) {
  return [...new Set(values.map((item) => item.key))];
}

function retinopathyCard(projection: Type2ParallelSafetyProjectionV2, locale: Type2ParallelSafetyLocale): Type2ParallelSafetyCard | null {
  const pathway = projection.retinopathy;
  if (!pathway.escalations.length && !pathway.missingData.length) return null;
  const hasEscalation = pathway.escalations.length > 0;
  const triggers = [...new Set(pathway.escalations.flatMap((item) => item.triggers))];
  const triggerLabels: Record<string, { fa: string; en: string }> = {
    diabetic_macular_edema: { fa: "ادم ماکولای دیابتی", en: "diabetic macular edema" },
    moderate_npdr: { fa: "NPDR متوسط", en: "moderate NPDR" },
    severe_npdr: { fa: "NPDR شدید", en: "severe NPDR" },
    pdr: { fa: "PDR", en: "PDR" },
  };
  return {
    id: "retinopathy",
    title: parallelSafetyLabel(locale, "رتینوپاتی / چشم", "Retinopathy / eye care"),
    subtitle: hasEscalation
      ? parallelSafetyLabel(locale, "ارجاع سریع به چشم‌پزشکی فعال شده است", "Prompt ophthalmology referral is indicated")
      : parallelSafetyLabel(locale, "برای تعیین مرز ارجاع، داده بیشتری لازم است", "More eye findings are needed to resolve the referral boundary"),
    tone: hasEscalation ? "prompt" : "review",
    badge: hasEscalation ? parallelSafetyLabel(locale, "ارجاع سریع", "Prompt referral") : parallelSafetyLabel(locale, "تکمیل داده", "Needs data"),
    bullets: triggers.map((trigger) => triggerLabels[trigger]?.[locale] ?? trigger),
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.escalations.flatMap((item) => item.evidence).concat(pathway.missingData.flatMap((item) => item.evidence))),
  };
}

function footCard(projection: Type2ParallelSafetyProjectionV2, locale: Type2ParallelSafetyLocale): Type2ParallelSafetyCard | null {
  const pathway = projection.diabeticFoot;
  if (pathway.state === "no_foot_ulcer_context") return null;
  const maxUrgency: Type2ParallelSafetyTone = pathway.escalations.some((item) => item.urgency === "urgent")
    ? "urgent"
    : pathway.escalations.some((item) => item.urgency === "prompt")
      ? "prompt"
      : pathway.missingData.length
        ? "review"
        : "info";
  const bullets: string[] = [];
  if (pathway.antibioticBoundary === "not_indicated_for_uninfected_ulcer") {
    bullets.push(parallelSafetyLabel(locale, "برای زخم از نظر بالینی غیرعفونی، آنتی‌بیوتیک برای پیشگیری یا ترمیم توصیه نمی‌شود.", "Do not use antibiotics solely to prevent infection or promote healing in a clinically uninfected ulcer."));
  }
  if (pathway.antibioticBoundary === "requires_severity_pathogen_patient_and_local_protocol_review") {
    bullets.push(parallelSafetyLabel(locale, "انتخاب آنتی‌میکروبیال خودکار نیست و به شدت، پاتوژن/حساسیت، وضعیت بیمار و پروتکل محلی وابسته است.", "Antimicrobial selection is not automatic; it requires severity, pathogen/susceptibility, patient factors, and local-protocol review."));
  }
  for (const escalation of pathway.escalations) {
    const destinations = escalation.destinations.join(" / ");
    bullets.push(parallelSafetyLabel(locale, `ارجاع ${escalation.urgency === "urgent" ? "فوری" : "سریع"}: ${destinations}`, `${escalation.urgency === "urgent" ? "Urgent" : "Prompt"} escalation: ${destinations}`));
  }
  return {
    id: "diabetic-foot",
    title: parallelSafetyLabel(locale, "پای دیابتی", "Diabetes-related foot"),
    subtitle: footState[pathway.state]?.[locale] ?? pathway.state,
    tone: maxUrgency,
    badge: maxUrgency === "urgent"
      ? parallelSafetyLabel(locale, "فوری", "Urgent")
      : maxUrgency === "prompt"
        ? parallelSafetyLabel(locale, "ارجاع سریع", "Prompt")
        : maxUrgency === "review"
          ? parallelSafetyLabel(locale, "تکمیل داده", "Needs data")
          : parallelSafetyLabel(locale, "مسیر ایمنی", "Safety path"),
    bullets,
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.evidence),
  };
}

function nutritionCard(projection: Type2ParallelSafetyProjectionV2, locale: Type2ParallelSafetyLocale): Type2ParallelSafetyCard | null {
  const pathway = projection.nutritionSupport;
  if (pathway.state === "not_requested") return null;
  const bullets = [parallelSafetyLabel(locale, "این مسیر هیچ مکمل، فرآورده تغذیه‌ای یا دوزی را خودکار تجویز نمی‌کند.", "This pathway does not automatically prescribe a supplement, nutrition product, or dose.")];
  if (pathway.state === "deficiency_treatment_review") {
    bullets.push(parallelSafetyLabel(locale, "نام کمبود و شواهد عینی آن باید برای پروتکل جایگزینی اختصاصی ثبت شود.", "The deficiency and objective evidence must be documented before a nutrient-specific replacement protocol is used."));
  }
  if (pathway.state === "glycemic_supplement_not_recommended") {
    bullets.push(parallelSafetyLabel(locale, "دیابت به‌تنهایی اندیکاسیون ویتامین، مینرال یا فرآورده گیاهی برای کاهش قند ایجاد نمی‌کند.", "Diabetes alone is not an indication for vitamin, mineral, or herbal supplementation to lower glucose."));
  }
  return {
    id: "nutrition-support",
    title: parallelSafetyLabel(locale, "حمایت تغذیه‌ای", "Nutrition support"),
    subtitle: nutritionState[pathway.state]?.[locale] ?? pathway.state,
    tone: pathway.missingData.length ? "review" : "info",
    badge: pathway.missingData.length ? parallelSafetyLabel(locale, "تکمیل داده", "Needs data") : parallelSafetyLabel(locale, "بازبینی", "Review"),
    bullets,
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.evidence),
  };
}

function pregnancyCard(projection: Type2ParallelSafetyProjectionV2, locale: Type2ParallelSafetyLocale): Type2ParallelSafetyCard | null {
  const pathway = projection.pregnancy;
  if (pathway.state === "not_pregnant") return null;
  const bullets: string[] = [];
  if (pathway.targets) {
    bullets.push(parallelSafetyLabel(locale, "اهداف بارداری: fasting <95، 1h <140 و 2h <120 mg/dL.", "Pregnancy glucose targets: fasting <95, 1-h <140, and 2-h <120 mg/dL."));
  }
  if (pathway.insulinPreferredOrRequired) {
    bullets.push(parallelSafetyLabel(locale, "انسولین در این مسیر لازم/ترجیحی است، اما انتخاب فرآورده و دوز کاملاً تحت کنترل پزشک/تیم بارداری می‌ماند.", "Insulin is required/preferred in this pathway, but product selection and dosing remain clinician/pregnancy-team controlled."));
  }
  if (pathway.medicationReviews.length) {
    bullets.push(parallelSafetyLabel(locale, `${pathway.medicationReviews.length} داروی فعال نیازمند medication reconciliation بارداری است؛ هیچ دستور قطع خودکاری ساخته نمی‌شود.`, `${pathway.medicationReviews.length} active medication(s) require pregnancy medication reconciliation; no automatic stop order is created.`));
  }
  return {
    id: "pregnancy",
    title: parallelSafetyLabel(locale, "دیابت در بارداری", "Diabetes in pregnancy"),
    subtitle: pregnancyState[pathway.state]?.[locale] ?? pathway.state,
    tone: pathway.missingData.length ? "review" : pathway.insulinPreferredOrRequired ? "prompt" : "info",
    badge: pathway.missingData.length ? parallelSafetyLabel(locale, "تکمیل داده", "Needs data") : parallelSafetyLabel(locale, "مسیر بارداری", "Pregnancy path"),
    bullets,
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.evidence),
  };
}

export function activeParallelSafetyCards(
  projection: Type2ParallelSafetyProjectionV2,
  locale: Type2ParallelSafetyLocale,
): Type2ParallelSafetyCard[] {
  return [
    retinopathyCard(projection, locale),
    footCard(projection, locale),
    nutritionCard(projection, locale),
    pregnancyCard(projection, locale),
  ].filter((item): item is Type2ParallelSafetyCard => Boolean(item));
}
