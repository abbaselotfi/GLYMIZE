import type { Type2ParallelSafetyProjectionV2 } from "@glymize/clinical-engine/type2-intake-v2";
import styles from "./type2-parallel-safety-panel.module.css";

type Locale = "fa" | "en";
type Tone = "info" | "review" | "prompt" | "urgent";

type Card = {
  id: string;
  title: string;
  subtitle: string;
  tone: Tone;
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

function label(locale: Locale, fa: string, en: string) {
  return locale === "fa" ? fa : en;
}

function uniqueEvidence(values: Card["evidence"]) {
  const map = new Map<string, Card["evidence"][number]>();
  for (const item of values) map.set(item.sourceId, item);
  return [...map.values()];
}

function missingKeys(values: Array<{ key: string }>) {
  return [...new Set(values.map((item) => item.key))];
}

function retinopathyCard(projection: Type2ParallelSafetyProjectionV2, locale: Locale): Card | null {
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
    title: label(locale, "رتینوپاتی / چشم", "Retinopathy / eye care"),
    subtitle: hasEscalation
      ? label(locale, "ارجاع سریع به چشم‌پزشکی فعال شده است", "Prompt ophthalmology referral is indicated")
      : label(locale, "برای تعیین مرز ارجاع، داده بیشتری لازم است", "More eye findings are needed to resolve the referral boundary"),
    tone: hasEscalation ? "prompt" : "review",
    badge: hasEscalation ? label(locale, "ارجاع سریع", "Prompt referral") : label(locale, "تکمیل داده", "Needs data"),
    bullets: triggers.map((trigger) => triggerLabels[trigger]?.[locale] ?? trigger),
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.escalations.flatMap((item) => item.evidence).concat(pathway.missingData.flatMap((item) => item.evidence))),
  };
}

function footCard(projection: Type2ParallelSafetyProjectionV2, locale: Locale): Card | null {
  const pathway = projection.diabeticFoot;
  if (pathway.state === "no_foot_ulcer_context") return null;
  const maxUrgency: Tone = pathway.escalations.some((item) => item.urgency === "urgent")
    ? "urgent"
    : pathway.escalations.some((item) => item.urgency === "prompt")
      ? "prompt"
      : pathway.missingData.length
        ? "review"
        : "info";
  const bullets: string[] = [];
  if (pathway.antibioticBoundary === "not_indicated_for_uninfected_ulcer") {
    bullets.push(label(locale, "برای زخم از نظر بالینی غیرعفونی، آنتی‌بیوتیک برای پیشگیری یا ترمیم توصیه نمی‌شود.", "Do not use antibiotics solely to prevent infection or promote healing in a clinically uninfected ulcer."));
  }
  if (pathway.antibioticBoundary === "requires_severity_pathogen_patient_and_local_protocol_review") {
    bullets.push(label(locale, "انتخاب آنتی‌میکروبیال خودکار نیست و به شدت، پاتوژن/حساسیت، وضعیت بیمار و پروتکل محلی وابسته است.", "Antimicrobial selection is not automatic; it requires severity, pathogen/susceptibility, patient factors, and local-protocol review."));
  }
  for (const escalation of pathway.escalations) {
    const destinations = escalation.destinations.join(" / ");
    bullets.push(label(locale, `ارجاع ${escalation.urgency === "urgent" ? "فوری" : "سریع"}: ${destinations}`, `${escalation.urgency === "urgent" ? "Urgent" : "Prompt"} escalation: ${destinations}`));
  }
  return {
    id: "diabetic-foot",
    title: label(locale, "پای دیابتی", "Diabetes-related foot"),
    subtitle: footState[pathway.state]?.[locale] ?? pathway.state,
    tone: maxUrgency,
    badge: maxUrgency === "urgent" ? label(locale, "فوری", "Urgent") : maxUrgency === "prompt" ? label(locale, "ارجاع سریع", "Prompt") : maxUrgency === "review" ? label(locale, "تکمیل داده", "Needs data") : label(locale, "مسیر ایمنی", "Safety path"),
    bullets,
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.evidence),
  };
}

function nutritionCard(projection: Type2ParallelSafetyProjectionV2, locale: Locale): Card | null {
  const pathway = projection.nutritionSupport;
  if (pathway.state === "not_requested") return null;
  const bullets = [label(locale, "این مسیر هیچ مکمل، فرآورده تغذیه‌ای یا دوزی را خودکار تجویز نمی‌کند.", "This pathway does not automatically prescribe a supplement, nutrition product, or dose.")];
  if (pathway.state === "deficiency_treatment_review") {
    bullets.push(label(locale, "نام کمبود و شواهد عینی آن باید برای پروتکل جایگزینی اختصاصی ثبت شود.", "The deficiency and objective evidence must be documented before a nutrient-specific replacement protocol is used."));
  }
  if (pathway.state === "glycemic_supplement_not_recommended") {
    bullets.push(label(locale, "دیابت به‌تنهایی اندیکاسیون ویتامین، مینرال یا فرآورده گیاهی برای کاهش قند ایجاد نمی‌کند.", "Diabetes alone is not an indication for vitamin, mineral, or herbal supplementation to lower glucose."));
  }
  return {
    id: "nutrition-support",
    title: label(locale, "حمایت تغذیه‌ای", "Nutrition support"),
    subtitle: nutritionState[pathway.state]?.[locale] ?? pathway.state,
    tone: pathway.missingData.length ? "review" : "info",
    badge: pathway.missingData.length ? label(locale, "تکمیل داده", "Needs data") : label(locale, "بازبینی", "Review"),
    bullets,
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.evidence),
  };
}

function pregnancyCard(projection: Type2ParallelSafetyProjectionV2, locale: Locale): Card | null {
  const pathway = projection.pregnancy;
  if (pathway.state === "not_pregnant") return null;
  const bullets: string[] = [];
  if (pathway.targets) {
    bullets.push(label(locale, "اهداف بارداری: fasting <95، 1h <140 و 2h <120 mg/dL.", "Pregnancy glucose targets: fasting <95, 1-h <140, and 2-h <120 mg/dL."));
  }
  if (pathway.insulinPreferredOrRequired) {
    bullets.push(label(locale, "انسولین در این مسیر لازم/ترجیحی است، اما انتخاب فرآورده و دوز کاملاً تحت کنترل پزشک/تیم بارداری می‌ماند.", "Insulin is required/preferred in this pathway, but product selection and dosing remain clinician/pregnancy-team controlled."));
  }
  if (pathway.medicationReviews.length) {
    bullets.push(label(locale, `${pathway.medicationReviews.length} داروی فعال نیازمند medication reconciliation بارداری است؛ هیچ دستور قطع خودکاری ساخته نمی‌شود.`, `${pathway.medicationReviews.length} active medication(s) require pregnancy medication reconciliation; no automatic stop order is created.`));
  }
  return {
    id: "pregnancy",
    title: label(locale, "دیابت در بارداری", "Diabetes in pregnancy"),
    subtitle: pregnancyState[pathway.state]?.[locale] ?? pathway.state,
    tone: pathway.missingData.length ? "review" : pathway.insulinPreferredOrRequired ? "prompt" : "info",
    badge: pathway.missingData.length ? label(locale, "تکمیل داده", "Needs data") : label(locale, "مسیر بارداری", "Pregnancy path"),
    bullets,
    missingKeys: missingKeys(pathway.missingData),
    evidence: uniqueEvidence(pathway.evidence),
  };
}

export function activeParallelSafetyCards(projection: Type2ParallelSafetyProjectionV2, locale: Locale): Card[] {
  return [retinopathyCard(projection, locale), footCard(projection, locale), nutritionCard(projection, locale), pregnancyCard(projection, locale)].filter((item): item is Card => Boolean(item));
}

export default function Type2ParallelSafetyPanel({ projection, locale }: { projection?: Type2ParallelSafetyProjectionV2; locale: Locale }) {
  if (!projection) return null;
  const cards = activeParallelSafetyCards(projection, locale);
  if (!cards.length) return null;

  return (
    <section className={styles.panel} data-parallel-safety="true" aria-label={label(locale, "مسیرهای ایمنی و ارجاع موازی", "Parallel safety and referral pathways")}>
      <header className={styles.header}>
        <div>
          <span>{label(locale, "خارج از رتبه‌بندی دارویی", "OUTSIDE MEDICATION RANKING")}</span>
          <h2>{label(locale, "مسیرهای ایمنی و ارجاع موازی", "Parallel safety and referral pathways")}</h2>
          <p>{label(locale, "این کارت‌ها مسیر درمان دارویی را رتبه‌بندی نمی‌کنند؛ آن‌ها referral، safety boundary و داده‌های لازم را مستقل نگه می‌دارند.", "These cards do not rank drug therapy. They keep referral, safety boundaries, and missing-data requirements separate from treatment scenarios.")}</p>
        </div>
      </header>

      <div className={styles.grid}>
        {cards.map((card) => (
          <article className={`${styles.card} ${styles[card.tone]}`} data-safety-lane={card.id} key={card.id}>
            <div className={styles.cardHead}>
              <div><h3>{card.title}</h3><p>{card.subtitle}</p></div>
              <span>{card.badge}</span>
            </div>
            {card.bullets.length > 0 && <ul>{card.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
            {card.missingKeys.length > 0 && (
              <div className={styles.missing}>
                <b>{label(locale, "داده موردنیاز", "Required data")}</b>
                <div>{card.missingKeys.map((key) => <code key={key}>{key}</code>)}</div>
              </div>
            )}
            {card.evidence.length > 0 && (
              <details className={styles.evidence}>
                <summary>{label(locale, "منابع و مرز شواهد", "Evidence and boundary sources")}</summary>
                <ul>
                  {card.evidence.map((item) => (
                    <li key={item.sourceId}>
                      {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : <span>{item.title}</span>}
                      {item.locator && <small>{item.locator}</small>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
