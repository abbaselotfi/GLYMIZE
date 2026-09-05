"use client";

import type { MedicationClinicalDomain, Type2DecisionFactor } from "@glymize/contracts";
import styles from "./type2-scenarios.module.css";
import type { TriState, Type2StructuredIntakeDraft } from "./type2-structured-intake-ui";

interface Props {
  draft: Type2StructuredIntakeDraft;
  factors: readonly Type2DecisionFactor[];
  worldDrugDomains: readonly MedicationClinicalDomain[];
  locale: "fa" | "en";
  onChange: (patch: Partial<Type2StructuredIntakeDraft>) => void;
}

function TriStateField({
  label,
  value,
  onChange,
  fa,
}: {
  label: string;
  value: TriState;
  onChange: (value: TriState) => void;
  fa: boolean;
}) {
  return (
    <label className={styles.selectField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as TriState)}>
        <option value="unknown">{fa ? "نامشخص" : "Unknown"}</option>
        <option value="yes">{fa ? "بله" : "Yes"}</option>
        <option value="no">{fa ? "خیر" : "No"}</option>
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  placeholder?: string;
}) {
  return (
    <label className={styles.selectField}>
      <span>{label}</span>
      <div>
        <input
          inputMode="decimal"
          min="0"
          placeholder={placeholder}
          step="0.1"
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit ? <small>{unit}</small> : null}
      </div>
    </label>
  );
}

function BooleanField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={styles.choice}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function Type2StructuredContextFields({
  draft,
  factors,
  worldDrugDomains,
  locale,
  onChange,
}: Props) {
  const fa = locale === "fa";
  const footActive = factors.includes("diabetic_foot");
  const pregnancyActive = factors.includes("pregnancy");
  const neuropathyActive = worldDrugDomains.includes("neuropathy");
  const retinopathyActive = worldDrugDomains.includes("retinopathy");
  const nutritionActive = worldDrugDomains.includes("nutrition_support");
  const anyStructuredDomain = footActive || pregnancyActive || neuropathyActive || retinopathyActive || nutritionActive;

  if (!anyStructuredDomain) return null;

  return (
    <div className={styles.contextBox} data-testid="type2-structured-clinical-context">
      <div className={styles.subhead}>
        <div>
          <b>{fa ? "جزئیات بالینی لازم برای مسیرهای تخصصی" : "Required specialist-pathway clinical details"}</b>
          <small>
            {fa
              ? "انتخاب یک حوزه به‌تنهایی تشخیص محسوب نمی‌شود. فقط داده‌ای را ثبت کنید که توسط پزشک/منبع بالینی تأیید شده است."
              : "Selecting a domain is not a diagnosis. Enter only clinician/source-confirmed clinical facts."}
          </small>
        </div>
      </div>

      {pregnancyActive ? (
        <div data-testid="pregnancy-structured-fields">
          <div className={styles.subhead}><div><b>{fa ? "دیابت در بارداری" : "Diabetes in pregnancy"}</b></div></div>
          <div className={styles.twoCols}>
            <label className={styles.selectField}>
              <span>{fa ? "نوع دیابت در بارداری" : "Pregnancy diabetes type"}</span>
              <select
                value={draft.pregnancyDiabetesType}
                onChange={(event) => onChange({ pregnancyDiabetesType: event.target.value as Type2StructuredIntakeDraft["pregnancyDiabetesType"] })}
              >
                <option value="">{fa ? "انتخاب نشده" : "Not selected"}</option>
                <option value="type1">T1D</option>
                <option value="type2">T2D</option>
                <option value="gdm">GDM</option>
                <option value="unknown">{fa ? "نامشخص" : "Unknown"}</option>
              </select>
            </label>
            <NumberField
              label={fa ? "سن بارداری" : "Gestational age"}
              unit={fa ? "هفته" : "weeks"}
              placeholder="28"
              value={draft.gestationalAgeWeeks}
              onChange={(value) => onChange({ gestationalAgeWeeks: value })}
            />
            <NumberField
              label={fa ? "قند ناشتا" : "Fasting glucose"}
              unit="mg/dL"
              placeholder="92"
              value={draft.fastingGlucose}
              onChange={(value) => onChange({ fastingGlucose: value })}
            />
            <NumberField
              label={fa ? "قند ۲ ساعت پس از غذا" : "2-hour postprandial glucose"}
              unit="mg/dL"
              placeholder="118"
              value={draft.twoHourPostprandialGlucose}
              onChange={(value) => onChange({ twoHourPostprandialGlucose: value })}
            />
          </div>
          <div className={styles.choiceGrid}>
            <BooleanField
              label={fa ? "هیپوگلیسمی قابل‌توجه مانع هدف سخت‌گیرانه است" : "Significant hypoglycemia prevents tighter target"}
              checked={draft.significantHypoglycemiaPreventingTightTarget}
              onChange={(value) => onChange({ significantHypoglycemiaPreventingTightTarget: value })}
            />
            <BooleanField
              label={fa ? "متفورمین برای PCOS/القای تخمک‌گذاری" : "Metformin used for PCOS/ovulation"}
              checked={draft.metforminForPcosOvulation}
              onChange={(value) => onChange({ metforminForPcosOvulation: value })}
            />
            <BooleanField
              label={fa ? "تیم تخصصی دیابت در بارداری برقرار است" : "Pregnancy-diabetes specialist team established"}
              checked={draft.pregnancySpecialistTeamEstablished}
              onChange={(value) => onChange({ pregnancySpecialistTeamEstablished: value })}
            />
          </div>
        </div>
      ) : null}

      {footActive ? (
        <div data-testid="diabetic-foot-structured-fields">
          <div className={styles.subhead}><div><b>{fa ? "پای دیابتی / عفونت" : "Diabetic foot / infection"}</b></div></div>
          <div className={styles.twoCols}>
            <TriStateField
              fa={fa}
              label={fa ? "زخم/اولسر پا وجود دارد؟" : "Foot ulcer present?"}
              value={draft.footUlcerPresent}
              onChange={(value) => onChange({ footUlcerPresent: value })}
            />
            <TriStateField
              fa={fa}
              label={fa ? "عفونت بالینی تأیید شده؟" : "Clinical infection confirmed?"}
              value={draft.footClinicalInfection}
              onChange={(value) => onChange({ footClinicalInfection: value })}
            />
            <label className={styles.selectField}>
              <span>{fa ? "شدت IWGDF/IDSA" : "IWGDF/IDSA severity"}</span>
              <select
                value={draft.footInfectionSeverity}
                onChange={(event) => onChange({ footInfectionSeverity: event.target.value as Type2StructuredIntakeDraft["footInfectionSeverity"] })}
              >
                <option value="">—</option>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <TriStateField
              fa={fa}
              label={fa ? "PAD/ایسکمی شریانی" : "PAD / arterial disease"}
              value={draft.footPad}
              onChange={(value) => onChange({ footPad: value })}
            />
          </div>
          <div className={styles.choiceGrid}>
            <BooleanField label={fa ? "گانگرن گسترده" : "Extensive gangrene"} checked={draft.extensiveGangrene} onChange={(value) => onChange({ extensiveGangrene: value })} />
            <BooleanField label={fa ? "عفونت نکروزان" : "Necrotising infection"} checked={draft.necrotisingInfection} onChange={(value) => onChange({ necrotisingInfection: value })} />
            <BooleanField label={fa ? "آبسه عمقی مشکوک" : "Deep abscess suspected"} checked={draft.deepAbscessSuspected} onChange={(value) => onChange({ deepAbscessSuspected: value })} />
            <BooleanField label={fa ? "سندروم کمپارتمان" : "Compartment syndrome"} checked={draft.compartmentSyndrome} onChange={(value) => onChange({ compartmentSyndrome: value })} />
            <BooleanField label={fa ? "ایسکمی شدید اندام" : "Severe limb ischaemia"} checked={draft.severeLowerLimbIschaemia} onChange={(value) => onChange({ severeLowerLimbIschaemia: value })} />
            <BooleanField label={fa ? "شک به استئومیلیت" : "Osteomyelitis suspected"} checked={draft.osteomyelitisSuspected} onChange={(value) => onChange({ osteomyelitisSuspected: value })} />
            <BooleanField label={fa ? "استخوان نمایان" : "Exposed bone"} checked={draft.exposedBone} onChange={(value) => onChange({ exposedBone: value })} />
          </div>
        </div>
      ) : null}

      {retinopathyActive ? (
        <div data-testid="retinopathy-structured-fields">
          <div className={styles.subhead}><div><b>{fa ? "رتینوپاتی دیابتی" : "Diabetic retinopathy"}</b></div></div>
          <div className={styles.twoCols}>
            <TriStateField fa={fa} label={fa ? "رتینوپاتی دیابتی وجود دارد؟" : "Diabetic retinopathy present?"} value={draft.retinopathyPresent} onChange={(value) => onChange({ retinopathyPresent: value })} />
            <label className={styles.selectField}>
              <span>{fa ? "شدت رتینوپاتی" : "Retinopathy severity"}</span>
              <select
                value={draft.retinopathySeverity}
                onChange={(event) => onChange({ retinopathySeverity: event.target.value as Type2StructuredIntakeDraft["retinopathySeverity"] })}
              >
                <option value="">—</option>
                <option value="none">None</option>
                <option value="mild_npdr">Mild NPDR</option>
                <option value="moderate_npdr">Moderate NPDR</option>
                <option value="severe_npdr">Severe NPDR</option>
                <option value="pdr">PDR</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <TriStateField fa={fa} label="DME" value={draft.diabeticMacularEdema} onChange={(value) => onChange({ diabeticMacularEdema: value })} />
            <BooleanField label={fa ? "مراقبت چشم‌پزشکی برقرار است" : "Ophthalmology care established"} checked={draft.ophthalmologyCareEstablished} onChange={(value) => onChange({ ophthalmologyCareEstablished: value })} />
          </div>
          {draft.diabeticMacularEdema === "yes" ? (
            <div className={styles.twoCols}>
              <TriStateField fa={fa} label={fa ? "DME مرکزگیر" : "Center-involving DME"} value={draft.centerInvolvingDme} onChange={(value) => onChange({ centerInvolvingDme: value })} />
              <TriStateField fa={fa} label={fa ? "افت حدت بینایی منتسب به DME" : "Visual acuity impairment attributed to DME"} value={draft.dmeVisualAcuityImpairment} onChange={(value) => onChange({ dmeVisualAcuityImpairment: value })} />
            </div>
          ) : null}
        </div>
      ) : null}

      {neuropathyActive ? (
        <div data-testid="neuropathy-structured-fields">
          <div className={styles.subhead}><div><b>{fa ? "نوروپاتی دردناک دیابتی" : "Painful diabetic neuropathy"}</b></div></div>
          <div className={styles.twoCols}>
            <TriStateField fa={fa} label={fa ? "DPN توسط پزشک تأیید شده؟" : "Clinician-confirmed DPN?"} value={draft.dpnConfirmed} onChange={(value) => onChange({ dpnConfirmed: value })} />
            <TriStateField fa={fa} label={fa ? "درد/سوزش منتسب به DPN؟" : "Painful symptoms attributable to DPN?"} value={draft.dpnPainfulSymptoms} onChange={(value) => onChange({ dpnPainfulSymptoms: value })} />
            <TriStateField fa={fa} label={fa ? "ویژگی آتیپیک وجود دارد؟" : "Atypical features present?"} value={draft.dpnAtypicalFeatures} onChange={(value) => onChange({ dpnAtypicalFeatures: value })} />
          </div>
        </div>
      ) : null}

      {nutritionActive ? (
        <div data-testid="nutrition-structured-fields">
          <div className={styles.subhead}><div><b>{fa ? "اندیکاسیون حمایت تغذیه‌ای" : "Nutrition-support indication"}</b></div></div>
          <div className={styles.twoCols}>
            <label className={styles.selectField}>
              <span>{fa ? "هدف/اندیکاسیون" : "Intent / indication"}</span>
              <select
                value={draft.nutritionIntent}
                onChange={(event) => onChange({ nutritionIntent: event.target.value as Type2StructuredIntakeDraft["nutritionIntent"] })}
              >
                <option value="">{fa ? "انتخاب نشده" : "Not selected"}</option>
                <option value="glycemic_benefit">{fa ? "صرفاً بهبود قند" : "Glycemic benefit only"}</option>
                <option value="documented_deficiency">{fa ? "کمبود مستند" : "Documented deficiency"}</option>
                <option value="malnutrition_support">{fa ? "سوءتغذیه/ریسک سوءتغذیه" : "Malnutrition support"}</option>
                <option value="special_population">{fa ? "جمعیت ویژه" : "Special population"}</option>
                <option value="unspecified">{fa ? "نامشخص" : "Unspecified"}</option>
              </select>
            </label>
            <TriStateField fa={fa} label={fa ? "کمبود میکرونوترینت مستند؟" : "Documented micronutrient deficiency?"} value={draft.documentedMicronutrientDeficiency} onChange={(value) => onChange({ documentedMicronutrientDeficiency: value })} />
            <label className={styles.selectField}>
              <span>{fa ? "نام کمبود" : "Deficiency name"}</span>
              <input value={draft.deficiencyName} onChange={(event) => onChange({ deficiencyName: event.target.value })} placeholder="Vitamin B12" />
            </label>
            <TriStateField fa={fa} label={fa ? "داده آزمایشگاهی کمبود موجود است؟" : "Objective deficiency lab available?"} value={draft.deficiencyLabValueKnown} onChange={(value) => onChange({ deficiencyLabValueKnown: value })} />
            <TriStateField fa={fa} label={fa ? "ریسک/تشخیص سوءتغذیه؟" : "Malnutrition risk/diagnosis?"} value={draft.malnutritionRiskOrDiagnosis} onChange={(value) => onChange({ malnutritionRiskOrDiagnosis: value })} />
            <label className={styles.selectField}>
              <span>{fa ? "جمعیت ویژه" : "Special population"}</span>
              <select
                value={draft.nutritionSpecialPopulation}
                onChange={(event) => onChange({ nutritionSpecialPopulation: event.target.value as Type2StructuredIntakeDraft["nutritionSpecialPopulation"] })}
              >
                <option value="">—</option>
                <option value="pregnant">Pregnant</option>
                <option value="lactating">Lactating</option>
                <option value="older_adult">Older adult</option>
                <option value="vegetarian_or_vegan">Vegetarian / vegan</option>
                <option value="very_low_calorie_or_low_carbohydrate_pattern">Very-low-calorie / low-carbohydrate pattern</option>
              </select>
            </label>
          </div>
          <div className={styles.choiceGrid}>
            <BooleanField label={fa ? "کاهش وزن عمدی" : "Intentional weight loss"} checked={draft.intentionalWeightLoss} onChange={(value) => onChange({ intentionalWeightLoss: value })} />
            <BooleanField label={fa ? "مصرف متفورمین" : "Metformin use"} checked={draft.metforminUse} onChange={(value) => onChange({ metforminUse: value })} />
            <BooleanField label={fa ? "آنمی یا نوروپاتی محیطی" : "Anemia or peripheral neuropathy"} checked={draft.anemiaOrPeripheralNeuropathy} onChange={(value) => onChange({ anemiaOrPeripheralNeuropathy: value })} />
            <BooleanField label={fa ? "مصرف/برنامه بتاکاروتن" : "Beta-carotene use/plan"} checked={draft.betaCaroteneSupplementUseOrPlan} onChange={(value) => onChange({ betaCaroteneSupplementUseOrPlan: value })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
