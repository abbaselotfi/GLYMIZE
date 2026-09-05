"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CurrentMedicationInput,
  GenericMedication,
  InsuranceProvider,
  MedicationClinicalDomain,
  PatientClinicalContext,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2CostPreference,
  Type2DecisionFactor,
  Type2RoutePreference,
} from "@glymize/contracts";
import type { PatientHandoffRecord } from "@glymize/contracts";
import {
  buildType2TreatmentScenarios,
  type Type2CostingPlan,
  type Type2ScenarioSortMode,
} from "@glymize/clinical-engine/scenario-engine";
import { apiFetch } from "../../lib/api-client";
import { formatCoveragePercent } from "../../lib/medication-market";
import {
  clinicianCostingProfileForMedication,
  type ClinicianMedicationCostingProfile,
} from "../../lib/clinician-market-v2";
import MedicationMarketDetails from "../components/medication-market-details";
import PatientHandoffLookup from "../components/patient-handoff-lookup";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import base from "./type2-v2.module.css";
import styles from "./type2-scenarios.module.css";

type MedicationRow = {
  id: string;
  genericMedicationId?: string;
  genericName: string;
  doseAmount: string;
  doseUnit: string;
  frequencyPerDay: string;
  status: "active" | "held" | "stopped";
};

type ContextDraft = {
  eGfr: string;
  creatinineClearanceMlMin: string;
  uacr: string;
  potassiumMmolL: string;
  dialysis: boolean;
  recentAki: boolean;
  lvef: string;
  weight: string;
  height: string;
  fibrosisStage: "" | "F0" | "F1" | "F2" | "F3" | "F4" | "unknown";
  cirrhosis: boolean;
  decompensatedCirrhosis: boolean;
};

const FACTORS: Array<{ key: Type2DecisionFactor; fa: string; en: string; hintFa: string; hintEn: string }> = [
  { key: "ascvd", fa: "ASCVD", en: "ASCVD", hintFa: "MI، سکته، PAD یا revascularization", hintEn: "MI, stroke, PAD, or revascularization" },
  { key: "heart_failure", fa: "نارسایی قلبی", en: "Heart failure", hintFa: "HFpEF یا HFrEF", hintEn: "HFpEF or HFrEF" },
  { key: "ckd", fa: "بیماری مزمن کلیه", en: "Chronic kidney disease", hintFa: "eGFR / CrCl / UACR / پتاسیم / دیالیز", hintEn: "eGFR / CrCl / UACR / potassium / dialysis" },
  { key: "weight_priority", fa: "کاهش وزن مهم است", en: "Weight reduction priority", hintFa: "اثر وزن وارد رتبه‌بندی شود", hintEn: "Include weight effect in ranking" },
  { key: "hypoglycemia_risk", fa: "ریسک هیپوگلیسمی", en: "Hypoglycemia risk", hintFa: "داروهای هیپوگلیسمی‌زا پایین‌تر می‌روند", hintEn: "Down-rank hypoglycemia-prone therapies" },
  { key: "masld_mash", fa: "MASLD / MASH", en: "MASLD / MASH", hintFa: "مرحله فیبروز و سیروز لحاظ شود", hintEn: "Include fibrosis and cirrhosis" },
  { key: "diabetic_foot", fa: "زخم پای دیابتی", en: "Diabetes-related foot ulcer", hintFa: "مسیر IWGDF هم‌زمان فعال شود", hintEn: "Run IWGDF pathway in parallel" },
  { key: "pregnancy", fa: "بارداری", en: "Pregnancy", hintFa: "مسیرهای ایمنی بارداری در Decision Graph فعال شوند", hintEn: "Activate pregnancy safety handling in Decision Graph" },
  { key: "insulin_pathway", fa: "مسیر انسولین / FRC", en: "Insulin / FRC pathway", hintFa: "در صورت نیاز مسیر تزریقی بررسی شود", hintEn: "Consider injectable pathway when needed" },
];

const WORLD_DRUG_DOMAINS: Array<{ key: MedicationClinicalDomain; fa: string; en: string; hintFa: string; hintEn: string }> = [
  { key: "cardiovascular", fa: "سایر بیماری‌های قلبی‌عروقی", en: "Other cardiovascular disease", hintFa: "برای مرور داروهای قلبی WorldDrug خارج از ASCVD/HF", hintEn: "Review WorldDrug cardiovascular medicines beyond ASCVD/HF" },
  { key: "hypertension", fa: "فشارخون", en: "Hypertension", hintFa: "داروهای مرتبط با فشارخون برای مرور بالینی نمایش داده شوند", hintEn: "Surface hypertension medicines for clinical review" },
  { key: "lipids", fa: "اختلال چربی خون", en: "Lipid disorder", hintFa: "استاتین و سایر داروهای چربی مرتبط با بیمار مرور شوند", hintEn: "Review relevant statin and lipid-lowering medicines" },
  { key: "neuropathy", fa: "نوروپاتی", en: "Neuropathy", hintFa: "داروهای مرتبط با نوروپاتی دیابتی/محیطی نمایش داده شوند", hintEn: "Surface medicines relevant to diabetic/peripheral neuropathy" },
  { key: "retinopathy", fa: "رتینوپاتی", en: "Retinopathy", hintFa: "درمان‌های مرتبط با رتینوپاتی/ادم ماکولا برای مرور نمایش داده شوند", hintEn: "Surface retinopathy/macular edema therapies for review" },
  { key: "nutrition_support", fa: "حمایت تغذیه‌ای", en: "Nutrition support", hintFa: "فرآورده‌ها و درمان‌های WorldDrug مرتبط با حمایت تغذیه‌ای", hintEn: "Review WorldDrug entries related to nutrition support" },
];

const INSURERS: Array<{ value: InsuranceProvider; fa: string; en: string }> = [
  { value: "social_security", fa: "تأمین اجتماعی", en: "Social Security" },
  { value: "health_insurance", fa: "بیمه سلامت", en: "Health Insurance" },
  { value: "armed_forces", fa: "نیروهای مسلح", en: "Armed Forces" },
  { value: "other_organizations", fa: "سایر ارگان‌ها", en: "Other organizations" },
  { value: "supplementary", fa: "تکمیلی", en: "Supplementary" },
];

const COSTS: Array<{ value: Type2CostPreference; fa: string; en: string }> = [
  { value: "no_constraint", fa: "بدون محدودیت هزینه", en: "No cost constraint" },
  { value: "moderate", fa: "تعادل علم و هزینه", en: "Balance clinical fit and cost" },
  { value: "low_cost_only", fa: "اولویت هزینه پایین", en: "Lower-cost priority" },
  { value: "insured_only", fa: "فقط دارای پوشش بیمه", en: "Covered medicines only" },
];

const SCENARIO_SORTS: Array<{ value: Type2ScenarioSortMode; fa: string; en: string }> = [
  { value: "balanced", fa: "متعادل — پیشنهاد پیش‌فرض GLYMIZE", en: "Balanced — GLYMIZE default" },
  { value: "clinical", fa: "بیشترین تناسب علمی", en: "Highest clinical fit" },
  { value: "patient_cost", fa: "کمترین هزینه برای بیمار", en: "Lowest patient cost" },
  { value: "insurance_access", fa: "بهترین پوشش بیمه و دسترسی", en: "Best insurance and access" },
];

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function newMedication(): MedicationRow {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    genericName: "",
    doseAmount: "",
    doseUnit: "mg",
    frequencyPerDay: "",
    status: "active",
  };
}

function toman(value?: number, locale: "fa" | "en" = "fa") {
  if (value === undefined) return "—";
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 0 }).format(value);
}

function tomanRange(min?: number, max?: number, locale: "fa" | "en" = "fa") {
  if (min === undefined || max === undefined) return "—";
  if (min === max) return toman(min, locale);
  return `${toman(min, locale)} – ${toman(max, locale)}`;
}

function costingUnitLabels(profile: ClinicianMedicationCostingProfile | undefined, fa: boolean) {
  const basis = profile?.basis ?? "unknown";
  const labels: Record<string, { fa: string; en: string }> = {
    insulin_unit: { fa: "واحد انسولین", en: "insulin unit" },
    tablet: { fa: "قرص", en: "tablet" },
    capsule: { fa: "کپسول", en: "capsule" },
    mL: { fa: "mL", en: "mL" },
    actuation: { fa: "پاف", en: "actuation" },
    vial: { fa: "ویال", en: "vial" },
    ampoule: { fa: "آمپول", en: "ampoule" },
    pen: { fa: "قلم", en: "pen" },
    unknown: { fa: "واحد", en: "unit" },
  };
  const current = labels[basis] ?? labels.unknown!;
  const unitLabel = fa ? current.fa : current.en;
  return {
    unitLabel,
    dailyLabel: fa ? `${unitLabel}/روز` : `${unitLabel}/day`,
    packageLabel: fa ? `${unitLabel}/بسته` : `${unitLabel}/package`,
  };
}

function normalizedCostUnit(value?: string) {
  const normalized = (value ?? "").trim().toLocaleLowerCase();
  if (normalized === "insulin_unit" || normalized === "unit" || normalized === "u") return "unit";
  if (normalized === "ml") return "ml";
  return normalized;
}

function currentDailyQuantityForProfile(
  profile: ClinicianMedicationCostingProfile | undefined,
  medicationId: string,
  genericName: string,
  request: Type2ConsiderationRequest,
) {
  if (!profile) return undefined;
  const current = (request.currentMedications ?? []).find((item) =>
    item.genericMedicationId === medicationId ||
    item.genericName.trim().toLocaleLowerCase() === genericName.trim().toLocaleLowerCase()
  );
  if (!current || typeof current.totalDailyDose !== "number" || current.totalDailyDose <= 0) return undefined;
  const expected = normalizedCostUnit(profile.dailyInputUnit);
  const actual = normalizedCostUnit(current.totalDailyDoseUnit ?? current.doseUnit);
  return expected === actual ? current.totalDailyDose : undefined;
}

function costingProfileHint(
  profile: ClinicianMedicationCostingProfile | undefined,
  fa: boolean,
) {
  if (!profile) return fa
    ? "Package profile معتبر برای این دارو ثبت نشده است؛ مقدار بسته را پزشک وارد می‌کند."
    : "No validated package profile is available; enter the package measure manually.";

  const labels = costingUnitLabels(profile, fa);
  if (
    profile.autoFillEligible &&
    profile.packageMeasureQuantity !== undefined &&
    profile.displayContainerCount !== undefined &&
    profile.displayQuantityPerContainer !== undefined
  ) {
    return fa
      ? `بسته NFI: ${profile.displayContainerCount} ${profile.displayContainerUnit ?? "ظرف"} × ${profile.displayQuantityPerContainer} ${labels.unitLabel} = ${profile.packageMeasureQuantity} ${labels.unitLabel}`
      : `NFI package: ${profile.displayContainerCount} ${profile.displayContainerUnit ?? "container"} × ${profile.displayQuantityPerContainer} ${labels.unitLabel} = ${profile.packageMeasureQuantity} ${labels.unitLabel}`;
  }
  if (profile.autoFillEligible && profile.packageMeasureQuantity !== undefined) {
    return fa
      ? `اندازه بسته از Market v2.3: ${profile.packageMeasureQuantity} ${labels.unitLabel}`
      : `Market v2.3 package measure: ${profile.packageMeasureQuantity} ${labels.unitLabel}`;
  }
  return fa
    ? `واحد محاسبه: ${labels.unitLabel}. اندازه بسته بین فرآورده‌ها متفاوت/مبهم است و Auto-fill عمداً غیرفعال است.`
    : `Costing unit: ${labels.unitLabel}. Package size varies or is ambiguous, so auto-fill is intentionally disabled.`;
}

// GLYMIZE_MARKET_V23_INTEGRATION
export default function Type2ScenariosClient() {
  const { locale, isRtl } = useGlymizeLocale();
  const fa = locale === "fa";
  const [catalog, setCatalog] = useState<GenericMedication[]>([]);
  const [currentHba1c, setCurrentHba1c] = useState("");
  const [targetHba1c, setTargetHba1c] = useState("7");
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [factors, setFactors] = useState<Type2DecisionFactor[]>([]);
  const [worldDrugDomains, setWorldDrugDomains] = useState<MedicationClinicalDomain[]>([]);
  const [context, setContext] = useState<ContextDraft>({
    eGfr: "", creatinineClearanceMlMin: "", uacr: "", potassiumMmolL: "", dialysis: false, recentAki: false, lvef: "", weight: "", height: "",
    fibrosisStage: "", cirrhosis: false, decompensatedCirrhosis: false,
  });
  const [costPreference, setCostPreference] = useState<Type2CostPreference>("moderate");
  const [routePreference, setRoutePreference] = useState<Type2RoutePreference>("oral_and_injectable");
  const [insuranceProvider, setInsuranceProvider] = useState<InsuranceProvider>("social_security");
  const [scenarioSortMode, setScenarioSortMode] = useState<Type2ScenarioSortMode>("balanced");
  const [hyperglycemiaSymptoms, setHyperglycemiaSymptoms] = useState(false);
  const [catabolicFeatures, setCatabolicFeatures] = useState(false);
  const [assessment, setAssessment] = useState<Type2AssessmentResult | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<Type2ConsiderationRequest | null>(null);
  const [costPlans, setCostPlans] = useState<Record<string, Type2CostingPlan>>({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    void apiFetch("/v1/catalog/generics")
      .then((response) => response.ok ? response.json() as Promise<GenericMedication[]> : [])
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  const bmi = useMemo(() => {
    const weight = numberOrUndefined(context.weight);
    const height = numberOrUndefined(context.height);
    if (!weight || !height) return undefined;
    return Math.round((weight / ((height / 100) ** 2)) * 10) / 10;
  }, [context.height, context.weight]);

  const defaultCostPlans = useMemo<Record<string, Type2CostingPlan>>(() => {
    if (!assessment || !submittedRequest) return {};
    const next: Record<string, Type2CostingPlan> = {};
    for (const medication of assessment.medications) {
      const profile = clinicianCostingProfileForMedication(
        medication.genericName,
        medication.brandRegistryCode,
      );
      if (!profile) continue;
      const labels = costingUnitLabels(profile, fa);
      next[medication.genericMedicationId] = {
        dailyUnits: currentDailyQuantityForProfile(
          profile,
          medication.genericMedicationId,
          medication.genericName,
          submittedRequest,
        ),
        unitsPerPackage: profile.autoFillEligible
          ? profile.packageMeasureQuantity
          : undefined,
        unitLabel: labels.unitLabel,
        marketPackageVerified: profile.autoFillEligible,
      };
    }
    return next;
  }, [assessment, submittedRequest, fa]);

  const effectiveCostPlans = useMemo<Record<string, Type2CostingPlan>>(() => {
    const keys = new Set([...Object.keys(defaultCostPlans), ...Object.keys(costPlans)]);
    return Object.fromEntries(
      [...keys].map((key) => [
        key,
        { ...(defaultCostPlans[key] ?? {}), ...(costPlans[key] ?? {}) },
      ]),
    );
  }, [defaultCostPlans, costPlans]);

  const scenarioList = useMemo(() => {
    if (!assessment || !submittedRequest) return [];
    return buildType2TreatmentScenarios({
      assessment,
      request: submittedRequest,
      insuranceProvider,
      costingPlansByMedicationId: effectiveCostPlans,
      sortMode: scenarioSortMode,
      maxScenarios: 3,
    });
  }, [assessment, submittedRequest, insuranceProvider, effectiveCostPlans, scenarioSortMode]);
  const clinicalScenarioCount = scenarioList.filter((scenario) => scenario.kind !== "worlddrug_review").length;
  const hasWorldDrugReview = scenarioList.some((scenario) => scenario.kind === "worlddrug_review");

  function setFactor(key: Type2DecisionFactor) {
    setFactors((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setAssessment(null);
  }

  function setWorldDrugDomain(key: MedicationClinicalDomain) {
    setWorldDrugDomains((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setAssessment(null);
  }

  function updateMedication(id: string, patch: Partial<MedicationRow>) {
    setMedications((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setAssessment(null);
  }

  function updateMedicationName(id: string, value: string) {
    const normalized = value.trim().toLocaleLowerCase();
    const match = catalog.find((item) => item.canonicalName.toLocaleLowerCase() === normalized || item.persianName.toLocaleLowerCase() === normalized);
    updateMedication(id, { genericName: value, genericMedicationId: match?.id });
  }

  function currentMedicationPayload(): CurrentMedicationInput[] {
    return medications.filter((item) => item.genericName.trim()).map((item) => {
      const doseAmount = numberOrUndefined(item.doseAmount);
      const frequencyPerDay = numberOrUndefined(item.frequencyPerDay);
      return {
        genericMedicationId: item.genericMedicationId,
        genericName: item.genericName.trim(),
        doseAmount,
        doseUnit: doseAmount !== undefined ? item.doseUnit : undefined,
        frequencyPerDay,
        totalDailyDose: doseAmount !== undefined && frequencyPerDay !== undefined ? doseAmount * frequencyPerDay : undefined,
        totalDailyDoseUnit: doseAmount !== undefined && frequencyPerDay !== undefined ? item.doseUnit : undefined,
        status: item.status,
        adherence: "unknown",
        tolerance: "unknown",
      };
    });
  }

  function clinicalContextPayload(): PatientClinicalContext {
    return {
      pregnancy: factors.includes("pregnancy"),
      cardiovascular: {
        ascvd: factors.includes("ascvd"),
        heartFailure: factors.includes("heart_failure"),
        lvefPercent: numberOrUndefined(context.lvef),
      },
      kidney: {
        ckd: factors.includes("ckd"),
        eGfr: numberOrUndefined(context.eGfr),
        creatinineClearanceMlMin: numberOrUndefined(context.creatinineClearanceMlMin),
        uacrMgG: numberOrUndefined(context.uacr),
        potassiumMmolL: numberOrUndefined(context.potassiumMmolL),
        dialysis: context.dialysis,
        recentAki: context.recentAki,
      },
      liver: {
        masldMash: factors.includes("masld_mash"),
        fibrosisStage: context.fibrosisStage || undefined,
        cirrhosis: context.cirrhosis,
        decompensatedCirrhosis: context.decompensatedCirrhosis,
      },
      anthropometrics: {
        weightKg: numberOrUndefined(context.weight),
        heightCm: numberOrUndefined(context.height),
        bmi,
      },
    };
  }

  function applyPatientHandoff(record: PatientHandoffRecord) {
    const confirmedLabs = record.labs.filter((item) => item.verification === "confirmed");
    const labValue = (key: string) => confirmedLabs.find((item) => item.canonicalKey === key)?.value;
    const hba1c = labValue("hba1c");
    const eGfr = labValue("egfr");
    const crCl = labValue("creatinine_clearance") ?? labValue("crcl");
    const uacr = labValue("uacr");
    const potassium = labValue("potassium");

    if (hba1c !== undefined) setCurrentHba1c(String(hba1c));
    setContext((current) => ({
      ...current,
      eGfr: eGfr !== undefined ? String(eGfr) : current.eGfr,
      creatinineClearanceMlMin: crCl !== undefined ? String(crCl) : current.creatinineClearanceMlMin,
      uacr: uacr !== undefined ? String(uacr) : current.uacr,
      potassiumMmolL: potassium !== undefined ? String(potassium) : current.potassiumMmolL,
      dialysis: record.clinicalFlags.dialysis ?? current.dialysis,
      weight: record.vitals.weightKg !== undefined ? String(record.vitals.weightKg) : current.weight,
      height: record.vitals.heightCm !== undefined ? String(record.vitals.heightCm) : current.height,
    }));

    const incomingFactors: Type2DecisionFactor[] = [];
    if (record.clinicalFlags.ascvd) incomingFactors.push("ascvd");
    if (record.clinicalFlags.heartFailure) incomingFactors.push("heart_failure");
    if (record.clinicalFlags.ckd || record.clinicalFlags.dialysis) incomingFactors.push("ckd");
    if (record.clinicalFlags.diabeticFoot) incomingFactors.push("diabetic_foot");
    if (record.clinicalFlags.masldMash) incomingFactors.push("masld_mash");
    if (record.clinicalFlags.hypoglycemiaRisk) incomingFactors.push("hypoglycemia_risk");
    setFactors((current) => [...new Set([...current, ...incomingFactors])]);

    const confirmedMedications = record.medications.filter((item) => item.verification === "confirmed");
    if (confirmedMedications.length) {
      setMedications(confirmedMedications.map((item) => ({
        id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        genericMedicationId: item.genericMedicationId,
        genericName: item.genericName,
        doseAmount: item.doseAmount !== undefined ? String(item.doseAmount) : "",
        doseUnit: item.doseUnit ?? "mg",
        frequencyPerDay: item.frequencyPerDay !== undefined ? String(item.frequencyPerDay) : "",
        status: item.status ?? "active",
      })));
    }

    setAssessment(null);
    setSubmittedRequest(null);
    setCostPlans({});
    setStatus(fa
      ? "داده‌های تأییدشده handoff روی فرم اعمال شد. قبل از ساخت سناریوها، مقادیر را مرور کنید."
      : "Confirmed handoff data was applied. Review the fields before generating scenarios.");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = Number(currentHba1c);
    const target = Number(targetHba1c);
    if (!Number.isFinite(current) || !Number.isFinite(target) || current < 3 || current > 20 || target < 4 || target > 12) {
      setStatus(fa ? "HbA1c فعلی و هدف را با عدد معتبر وارد کنید." : "Enter valid current and target A1C values.");
      setAssessment(null);
      return;
    }
    const request: Type2ConsiderationRequest & { activeClinicalDomains?: MedicationClinicalDomain[] } = {
      currentHba1c: current,
      targetHba1c: target,
      currentMedications: currentMedicationPayload(),
      clinicalContext: clinicalContextPayload(),
      costPreference,
      routePreference,
      hyperglycemiaSymptoms,
      catabolicFeatures,
      factors,
      activeClinicalDomains: worldDrugDomains,
    };
    setStatus(fa ? "در حال ساخت سناریوهای درمانی…" : "Building treatment scenarios…");
    setCostPlans({});
    try {
      const response = await apiFetch("/v1/catalog/type-2/considerations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error("assessment_failed");
      setAssessment(await response.json() as Type2AssessmentResult);
      setSubmittedRequest(request);
      setStatus(fa ? "سناریوها بر اساس وضعیت بیمار، گایدلاین و داده‌های فعلی بازار ساخته شدند." : "Scenarios were generated from patient context, guidelines, and current market data.");
    } catch {
      setAssessment(null);
      setSubmittedRequest(null);
      setStatus(fa ? "محاسبه انجام نشد؛ ورودی‌ها و اتصال داده را بررسی کنید." : "Assessment failed. Check inputs and data connection.");
    }
  }

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <div className={styles.topbar}>
        <Link className={styles.back} href="/dashboard">{isRtl ? "→" : "←"} {fa ? "داشبورد" : "Dashboard"}</Link>
        <span className={styles.version}>Scenario Engine · ADA 2026</span>
      </div>

      <header className={styles.hero}>
        <div>
          <span>{fa ? "GLYMIZE · پشتیبانی تصمیم دیابت نوع ۲" : "GLYMIZE · TYPE 2 DECISION SUPPORT"}</span>
          <h1>{fa ? "از فهرست دارو به سناریوی درمانی" : "From medicine list to treatment scenarios"}</h1>
          <p>{fa ? "۲ تا ۳ مسیر قابل دفاع برای پزشک؛ با دلیل بالینی، محدودیت‌ها، داده بازار و برآورد شفاف هزینه." : "Two to three defensible clinician-facing paths with clinical rationale, trade-offs, market data, and transparent cost estimation."}</p>
        </div>
        <div className={styles.heroMetric}><b>1,000</b><span>{fa ? "کیس اعتبارسنجی بالینی تصادفی" : "Randomized Clinical Validation Cases"}</span></div>
      </header>

      <PatientHandoffLookup onApply={applyPatientHandoff} />

      <div className={styles.workspace}>
        <form className={styles.form} onSubmit={submit}>
          <section className={styles.section}>
            <SectionTitle n="1" title={fa ? "کنترل قند و درمان فعلی" : "Glycemia and current regimen"} hint={fa ? "موتور شروع درمان را از تشدید درمان جدا می‌کند." : "The engine distinguishes initiation from intensification."} />
            <div className={styles.twoCols}>
              <Field label={fa ? "HbA1c فعلی" : "Current A1C"} value={currentHba1c} onChange={(value) => { setCurrentHba1c(value); setAssessment(null); }} unit="%" placeholder="8.7" />
              <Field label={fa ? "HbA1c هدف" : "Target A1C"} value={targetHba1c} onChange={(value) => { setTargetHba1c(value); setAssessment(null); }} unit="%" placeholder="7.0" />
            </div>

            <div className={styles.subhead}>
              <div><b>{fa ? "درمان فعال بیمار" : "Active regimen"}</b><small>{fa ? "دوز فعلی فقط برای شناخت regimen و محاسبات معتبر استفاده می‌شود." : "Current dose is used for regimen context and valid calculations only."}</small></div>
              <button type="button" onClick={() => setMedications((current) => [...current, newMedication()])}>＋ {fa ? "افزودن" : "Add"}</button>
            </div>
            {medications.length === 0 && <div className={styles.emptyLine}>{fa ? "داروی فعالی ثبت نشده؛ نشست به‌عنوان شروع درمان پردازش می‌شود." : "No active medicine entered; this is treated as therapy initiation."}</div>}
            <div className={styles.currentMeds}>
              {medications.map((item, index) => <div className={styles.currentMed} key={item.id}>
                <div className={styles.medIndex}>{index + 1}</div>
                <label><span>{fa ? "دارو" : "Medicine"}</span><input list="type2-drugs" value={item.genericName} onChange={(event) => updateMedicationName(item.id, event.target.value)} placeholder="Metformin" /></label>
                <label><span>{fa ? "دوز هر نوبت" : "Dose"}</span><input type="number" min="0" step="0.1" value={item.doseAmount} onChange={(event) => updateMedication(item.id, { doseAmount: event.target.value })} /></label>
                <label><span>{fa ? "واحد" : "Unit"}</span><select value={item.doseUnit} onChange={(event) => updateMedication(item.id, { doseUnit: event.target.value })}><option>mg</option><option>g</option><option>mcg</option><option>unit</option><option>mL</option><option>tablet</option><option>capsule</option><option>actuation</option><option>vial</option><option>ampoule</option><option>pen</option></select></label>
                <label><span>{fa ? "دفعات/روز" : "Times/day"}</span><input type="number" min="0" max="12" step="0.5" value={item.frequencyPerDay} onChange={(event) => updateMedication(item.id, { frequencyPerDay: event.target.value })} /></label>
                <button className={styles.remove} type="button" aria-label={fa ? "حذف دارو" : "Remove medicine"} onClick={() => setMedications((current) => current.filter((row) => row.id !== item.id))}>×</button>
              </div>)}
            </div>
            <datalist id="type2-drugs">{catalog.map((item) => <option key={item.id} value={item.canonicalName}>{item.persianName}</option>)}</datalist>
          </section>

          <section className={styles.section}>
            <SectionTitle n="2" title={fa ? "فنوتیپ و عوامل تصمیم" : "Phenotype and decision factors"} hint={fa ? "فقط عواملی را انتخاب کنید که واقعاً در بیمار وجود دارند." : "Select only factors actually present in this patient."} />
            <div className={styles.factorGrid}>{FACTORS.map((factor) => {
              const selected = factors.includes(factor.key);
              return <button type="button" className={`${styles.factor} ${selected ? styles.factorSelected : ""}`} key={factor.key} onClick={() => setFactor(factor.key)}>
                <i>{selected ? "✓" : ""}</i><span><b>{fa ? factor.fa : factor.en}</b><small>{fa ? factor.hintFa : factor.hintEn}</small></span>
              </button>;
            })}</div>

            <div className={styles.subhead}>
              <div><b>{fa ? "سایر حوزه‌های بالینی برای مرور WorldDrug" : "Additional clinical domains for WorldDrug review"}</b><small>{fa ? "انتخاب این موارد فقط داروهای مرتبط و موجود در بازار را برای مرور نمایش می‌دهد؛ به‌تنهایی توصیه اجرایی یا رتبه بالینی ایجاد نمی‌کند." : "These selections only surface relevant current-market medicines for review; they do not create an executable recommendation or clinical rank by themselves."}</small></div>
            </div>
            <div className={styles.factorGrid}>{WORLD_DRUG_DOMAINS.map((domain) => {
              const selected = worldDrugDomains.includes(domain.key);
              return <button type="button" className={`${styles.factor} ${selected ? styles.factorSelected : ""}`} key={domain.key} onClick={() => setWorldDrugDomain(domain.key)}>
                <i>{selected ? "✓" : ""}</i><span><b>{fa ? domain.fa : domain.en}</b><small>{fa ? domain.hintFa : domain.hintEn}</small></span>
              </button>;
            })}</div>

            {(factors.includes("ckd") || factors.includes("heart_failure") || factors.includes("weight_priority") || factors.includes("masld_mash")) && <div className={styles.contextBox}>
              {factors.includes("ckd") && <div className={styles.twoCols}>
                <Field label="eGFR" value={context.eGfr} onChange={(value) => setContext((c) => ({ ...c, eGfr: value }))} unit="mL/min/1.73m²" placeholder="45" />
                <Field label="CrCl" value={context.creatinineClearanceMlMin} onChange={(value) => setContext((c) => ({ ...c, creatinineClearanceMlMin: value }))} unit="mL/min" placeholder="40" />
                <Field label="UACR" value={context.uacr} onChange={(value) => setContext((c) => ({ ...c, uacr: value }))} unit="mg/g" placeholder="300" />
                <Field label={fa ? "پتاسیم" : "Potassium"} value={context.potassiumMmolL} onChange={(value) => setContext((c) => ({ ...c, potassiumMmolL: value }))} unit="mmol/L" placeholder="4.5" />
                <Check label={fa ? "دیالیز" : "Dialysis"} checked={context.dialysis} onChange={(value) => setContext((c) => ({ ...c, dialysis: value }))} />
                <Check label={fa ? "AKI اخیر" : "Recent AKI"} checked={context.recentAki} onChange={(value) => setContext((c) => ({ ...c, recentAki: value }))} />
              </div>}
              {factors.includes("heart_failure") && <Field label="LVEF" value={context.lvef} onChange={(value) => setContext((c) => ({ ...c, lvef: value }))} unit="%" placeholder="35" />}
              {factors.includes("weight_priority") && <div className={styles.twoCols}>
                <Field label={fa ? "وزن" : "Weight"} value={context.weight} onChange={(value) => setContext((c) => ({ ...c, weight: value }))} unit="kg" placeholder="92" />
                <Field label={fa ? "قد" : "Height"} value={context.height} onChange={(value) => setContext((c) => ({ ...c, height: value }))} unit="cm" placeholder="172" />
                {bmi !== undefined && <div className={styles.bmi}>BMI <b>{bmi.toFixed(1)}</b></div>}
              </div>}
              {factors.includes("masld_mash") && <div className={styles.contextInline}>
                <label><span>{fa ? "مرحله فیبروز" : "Fibrosis stage"}</span><select value={context.fibrosisStage} onChange={(event) => setContext((c) => ({ ...c, fibrosisStage: event.target.value as ContextDraft["fibrosisStage"] }))}><option value="">—</option><option>F0</option><option>F1</option><option>F2</option><option>F3</option><option>F4</option><option value="unknown">Unknown</option></select></label>
                <Check label={fa ? "سیروز" : "Cirrhosis"} checked={context.cirrhosis} onChange={(value) => setContext((c) => ({ ...c, cirrhosis: value }))} />
                <Check label={fa ? "سیروز دکامپنسیه" : "Decompensated cirrhosis"} checked={context.decompensatedCirrhosis} onChange={(value) => setContext((c) => ({ ...c, decompensatedCirrhosis: value }))} />
              </div>}
            </div>}
          </section>

          <section className={styles.section}>
            <SectionTitle n="3" title={fa ? "بازار، بیمه و ترجیح بیمار" : "Market, insurance, and patient preference"} hint={fa ? "هزینه بعد از ایمنی و تناسب بالینی وارد تصمیم می‌شود." : "Cost is applied after safety and clinical fit."} />
            <div className={styles.choiceGrid}>{COSTS.map((item) => <label className={costPreference === item.value ? styles.choiceActive : styles.choice} key={item.value}><input type="radio" name="cost" checked={costPreference === item.value} onChange={() => { setCostPreference(item.value); setAssessment(null); }} /><span>{fa ? item.fa : item.en}</span></label>)}</div>
            <div className={styles.subhead}><div><b>{fa ? "اولویت مرتب‌سازی سناریوها" : "Scenario ordering priority"}</b><small>{fa ? "ایمنی و اندیکاسیون همیشه Hard Gate باقی می‌مانند؛ این انتخاب فقط ترتیب گزینه‌های بالینی قابل قبول را تغییر می‌دهد." : "Safety and indication remain hard gates; this only reorders clinically acceptable scenarios."}</small></div></div>
            <div className={styles.choiceGrid}>{SCENARIO_SORTS.map((item) => <label className={scenarioSortMode === item.value ? styles.choiceActive : styles.choice} key={item.value}><input type="radio" name="scenario-sort" checked={scenarioSortMode === item.value} onChange={() => setScenarioSortMode(item.value)} /><span>{fa ? item.fa : item.en}</span></label>)}</div>
            <div className={styles.twoCols}>
              <label className={styles.selectField}><span>{fa ? "بیمه بیمار برای محاسبه هزینه" : "Patient insurer for cost estimate"}</span><select value={insuranceProvider} onChange={(event) => setInsuranceProvider(event.target.value as InsuranceProvider)}>{INSURERS.map((item) => <option value={item.value} key={item.value}>{fa ? item.fa : item.en}</option>)}</select></label>
              <label className={styles.selectField}><span>{fa ? "مسیر مصرف" : "Route preference"}</span><select value={routePreference} onChange={(event) => { setRoutePreference(event.target.value as Type2RoutePreference); setAssessment(null); }}><option value="oral_and_injectable">{fa ? "خوراکی و تزریقی" : "Oral and injectable"}</option><option value="oral_only">{fa ? "فقط خوراکی" : "Oral only"}</option></select></label>
            </div>
            <div className={styles.alertChecks}>
              <Check label={fa ? "علائم واضح هایپرگلیسمی" : "Clear hyperglycemia symptoms"} checked={hyperglycemiaSymptoms} onChange={setHyperglycemiaSymptoms} />
              <Check label={fa ? "کاهش وزن ناخواسته / کاتابولیسم" : "Unintentional weight loss / catabolism"} checked={catabolicFeatures} onChange={setCatabolicFeatures} />
            </div>
          </section>

          <div className={styles.submitBar}>
            <p role="status">{status}</p>
            <button type="submit">{fa ? "ساخت سناریوهای درمانی" : "Build treatment scenarios"}</button>
          </div>
        </form>

        <aside className={styles.summaryRail}>
          <span>{fa ? "منطق خروجی" : "OUTPUT LOGIC"}</span>
          <h2>{fa ? "کمتر، دقیق‌تر، قابل دفاع‌تر" : "Fewer, sharper, defensible"}</h2>
          <ol>
            <li><b>{fa ? "ایمنی و اندیکاسیون" : "Safety and indication"}</b><small>{fa ? "اولویت مطلق نسبت به هزینه" : "Always ahead of cost"}</small></li>
            <li><b>{fa ? "فنوتیپ بیمار" : "Patient phenotype"}</b><small>ASCVD · HF · CKD · Weight · MASH · WorldDrug domains</small></li>
            <li><b>{fa ? "بازار و بیمه ایران" : "Iran market and insurance"}</b><small>{fa ? "بعد از عبور از فیلتر بالینی" : "After clinical gating"}</small></li>
          </ol>
          <div className={styles.guardrail}>{fa ? "GLYMIZE دوز تجویزی جدید را از خودش نمی‌سازد. گزینه‌های WorldDrug بدون پروتکل approved فقط برای مرور نمایش داده می‌شوند و وارد رتبه بالینی نمی‌شوند." : "GLYMIZE never invents a new prescription dose. WorldDrug options without an approved protocol are review-only and never enter clinical ranking."}</div>
        </aside>
      </div>

      {assessment && <section className={styles.results}>
        <div className={styles.resultHeader}>
          <div><span>{fa ? "خروجی تصمیم" : "DECISION OUTPUT"}</span><h2>{fa ? `${clinicalScenarioCount} سناریوی درمانی${hasWorldDrugReview ? " + مرور WorldDrug" : ""}` : `${clinicalScenarioCount} treatment scenarios${hasWorldDrugReview ? " + WorldDrug review" : ""}`}</h2><p>{fa ? "ترتیب سناریوهای درمانی با تغییر اطلاعات بیمار، موجودی، قیمت و بیمه قابل تغییر است؛ کارت WorldDrug خارج از رتبه‌بندی درمانی است." : "Treatment-scenario order can change with patient context, availability, price, and insurance; the WorldDrug card is outside treatment ranking."}</p></div>
          <div className={assessment.recommendation.urgentReview ? styles.urgentBadge : styles.gapBadge}><small>{fa ? "فاصله HbA1c" : "A1C gap"}</small><b>{assessment.recommendation.hba1cGap.toFixed(1)}%</b></div>
        </div>

        {assessment.recommendation.urgentReview && <div className={styles.urgentCallout}><b>{fa ? "نیاز به بازبینی فوری مسیر درمان" : "Urgent treatment-path review"}</b><span>{fa ? "علائم/کاتابولیسم یا هایپرگلیسمی شدید، رتبه‌بندی معمول را تغییر داده است." : "Symptoms, catabolism, or severe hyperglycemia changed the usual ranking."}</span></div>}

        <div className={styles.scenarioStack}>{scenarioList.map((scenario) => <article className={styles.scenarioCard} key={scenario.id}>
          <div className={styles.scenarioHead}>
            <div className={styles.rank}>{scenario.kind === "worlddrug_review" ? "WD" : scenario.rank}</div>
            <div><span>{fa ? scenario.titleFa : scenario.titleEn}</span><h3>{fa ? scenario.summaryFa : scenario.summaryEn}</h3></div>
            <span className={styles.kind}>{scenario.kind === "worlddrug_review" ? (fa ? "مرور WorldDrug" : "WorldDrug review") : scenario.kind === "clinical_best" ? (fa ? "بالاترین تناسب بالینی" : "Best clinical fit") : scenario.kind === "access_balanced" ? (fa ? "تعادل علم/دسترسی" : "Clinical/access balance") : scenario.kind === "maintain_monitor" ? (fa ? "عدم تشدید غیرضروری" : "Avoid unnecessary intensification") : (fa ? "جایگزین" : "Alternative")}</span>
          </div>

          {scenario.medications.length > 0 && <div className={styles.scenarioMeds}>{scenario.medications.map((medication, medIndex) => {
            const estimate = scenario.cost30Days[medIndex];
            const profile = clinicianCostingProfileForMedication(
              medication.genericName,
              medication.brandRegistryCode,
            );
            const labels = costingUnitLabels(profile, fa);
            const plan = effectiveCostPlans[medication.genericMedicationId] ?? {};
            const profileHint = costingProfileHint(profile, fa);
            return <section className={styles.scenarioMed} key={medication.cardId ?? medication.genericMedicationId}>
              <div className={styles.medTop}><div><b>{medication.displayName ?? medication.persianName}</b>{medication.selectedBrandName && <small>{fa ? "ژنریک" : "Generic"}: {medication.persianName}</small>}<small>{medication.therapeuticClass}</small></div><span>{medication.outputStatus === "requires_approved_protocol" ? (fa ? "نیازمند پروتکل" : "Protocol required") : `${medication.priorityScore}/100`}</span></div>
              <div className={styles.insuranceRow}>{medication.insuranceCoverages.length ? medication.insuranceCoverages.map((entry) => <span key={entry.provider}>✓ {INSURERS.find((item) => item.value === entry.provider)?.[fa ? "fa" : "en"] ?? entry.provider}: {formatCoveragePercent(entry.percent, locale)}%</span>) : <span>{fa ? "پوشش بیمه ثبت نشده" : "No recorded coverage"}</span>}</div>
              <div className={styles.financialCluster}>
              <MedicationMarketDetails brandRegistryCode={medication.brandRegistryCode} coverages={medication.insuranceCoverages} genericRegistryCode={medication.genericRegistryCode} locale={locale} marketBadge={medication.marketBadge} price={medication.price} priceRange={medication.priceRange} selectedBrands={medication.selectedBrands} />

              <div className={styles.costBox}>
                <div className={styles.costTitle}><div><b>{fa ? "برآورد هزینه ۳۰روزه" : "30-day cost estimate"}</b><small>{fa ? "این ورودی‌ها برای هزینه‌اند، نه پیشنهاد دوز." : "These inputs are for costing, not dose recommendation."}</small></div><span>{estimate?.status === "calculated" ? "✓" : "…"}</span></div>
                <div className={styles.costInputs}>
                  <label><span>{labels.dailyLabel}</span><input type="number" min="0" step="0.1" value={plan.dailyUnits ?? ""} onChange={(event) => setCostPlans((current) => ({ ...current, [medication.genericMedicationId]: { ...current[medication.genericMedicationId], dailyUnits: numberOrUndefined(event.target.value), unitLabel: labels.unitLabel } }))} placeholder={fa ? "ورود پزشک" : "Clinician input"} /></label>
                  <label><span>{labels.packageLabel}</span><input type="number" min="0" step="0.1" value={plan.unitsPerPackage ?? ""} onChange={(event) => setCostPlans((current) => ({ ...current, [medication.genericMedicationId]: { ...current[medication.genericMedicationId], unitsPerPackage: numberOrUndefined(event.target.value), unitLabel: labels.unitLabel, marketPackageVerified: false } }))} placeholder={profile?.autoFillEligible ? String(profile.packageMeasureQuantity ?? "") : (fa ? "انتخاب/ورود بسته" : "Select/enter package")} /></label>
                </div>
                <p className={styles.costProfileHint}>{profileHint}</p>
                <div className={styles.costNumbers}>
                  <div><small>{fa ? "قیمت هر بسته" : "Retail/package"}</small><b>{estimate?.retailPerPackageMinToman !== undefined
                    ? `${tomanRange(estimate.retailPerPackageMinToman, estimate.retailPerPackageMaxToman, locale)} ${fa ? "تومان" : "Toman"}`
                    : `${toman(estimate?.retailPerPackageToman, locale)}${estimate?.retailPerPackageToman !== undefined ? ` ${fa ? "تومان" : "Toman"}` : ""}`}</b></div>
                  <div><small>{fa ? "خرده‌فروشی / ۳۰ روز" : "Retail / 30 days"}</small><b>{estimate?.retail30DaysMinToman !== undefined
                    ? `${tomanRange(estimate.retail30DaysMinToman, estimate.retail30DaysMaxToman, locale)} ${fa ? "تومان" : "Toman"}`
                    : `${toman(estimate?.retail30DaysToman, locale)}${estimate?.retail30DaysToman !== undefined ? ` ${fa ? "تومان" : "Toman"}` : ""}`}</b></div>
                  <div><small>{fa ? "پرداخت بیمار / ۳۰ روز" : "Patient / 30 days"}</small><b>{toman(estimate?.patient30DaysToman, locale)} {estimate?.patient30DaysToman !== undefined ? (fa ? "تومان" : "Toman") : ""}</b></div>
                  <div><small>{fa ? "سهم بیمه / ۳۰ روز" : "Insurer / 30 days"}</small><b>{toman(estimate?.insurer30DaysToman, locale)} {estimate?.insurer30DaysToman !== undefined ? (fa ? "تومان" : "Toman") : ""}</b></div>
                </div>
                <p>{estimate?.calculationBasis}</p>
              </div>
                          </div>
            </section>;
          })}</div>}

          <div className={styles.explainGrid}>
            <div><b>{fa ? "چرا این سناریو؟" : "Why this scenario?"}</b><ul>{(fa ? scenario.rationaleFa : scenario.rationaleEn).map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><b>{fa ? "ریسک‌ها / trade-off" : "Risks / trade-offs"}</b><ul>{(fa ? scenario.tradeoffsFa : scenario.tradeoffsEn).map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
          {(fa ? scenario.parallelCareFa : scenario.parallelCareEn).length > 0 && <div className={styles.parallel}><b>{fa ? "مسیر موازی که نباید فراموش شود" : "Parallel care path"}</b><ul>{(fa ? scenario.parallelCareFa : scenario.parallelCareEn).map((item) => <li key={item}>{item}</li>)}</ul></div>}
        </article>)}</div>

        <details className={styles.engineDetails}><summary>{fa ? "جزئیات تصمیم موتور" : "Engine decision details"}</summary><div><h3>{assessment.recommendation.title}</h3><ul>{assessment.recommendation.rationale.map((line) => <li key={line}>{line}</li>)}</ul><a href={assessment.recommendation.sourceUrl} target="_blank" rel="noreferrer">{assessment.recommendation.sourceReference}</a></div></details>
      </section>}
    </main>
  );
}

function SectionTitle({ n, title, hint }: { n: string; title: string; hint: string }) {
  return <div className={styles.sectionTitle}><span>{n}</span><div><h2>{title}</h2><p>{hint}</p></div></div>;
}

function Field({ label, value, onChange, unit, placeholder }: { label: string; value: string; onChange: (value: string) => void; unit: string; placeholder?: string }) {
  return <label className={styles.field}><span>{label}</span><div><input type="number" inputMode="decimal" step="0.1" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><small>{unit}</small></div></label>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
