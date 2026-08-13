import type {
  CurrentMedicationInput,
  InsuranceCoverage,
  InsuranceProvider,
  MedicationPrice,
  MedicationPriceRange,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2MedicationConsideration,
} from "@glymize/contracts";

export type Type2ScenarioKind = "clinical_best" | "access_balanced" | "alternative" | "maintain_monitor";
export type Type2ScenarioSortMode = "balanced" | "clinical" | "patient_cost" | "insurance_access";
export type Type2MonthlyCostStatus = "calculated" | "calculated_range" | "retail_only" | "per_package_only" | "price_missing" | "dose_or_pack_missing";

// GLYMIZE_MARKET_V23_INTEGRATION
export interface Type2CostingPlan {
  dailyUnits?: number;
  unitsPerPackage?: number;
  unitLabel?: string;
  /** True only when Market v2.3 proves a common package measure for the price range. */
  marketPackageVerified?: boolean;
}

export interface Type2MonthlyCostEstimate {
  status: Type2MonthlyCostStatus;
  days: 30;
  retailPerPackageToman?: number;
  retailPerPackageMinToman?: number;
  retailPerPackageMedianToman?: number;
  retailPerPackageMaxToman?: number;
  patientPerPackageToman?: number;
  insurerPerPackageToman?: number;
  packagesFor30Days?: number;
  retail30DaysToman?: number;
  retail30DaysMinToman?: number;
  retail30DaysMaxToman?: number;
  patient30DaysToman?: number;
  insurer30DaysToman?: number;
  coveragePercent?: number;
  insuranceProvider?: InsuranceProvider;
  calculationBasis: string;
}

export interface Type2TreatmentScenario {
  id: string;
  rank: 1 | 2 | 3;
  kind: Type2ScenarioKind;
  titleFa: string;
  titleEn: string;
  summaryFa: string;
  summaryEn: string;
  medicationIds: string[];
  medications: Type2MedicationConsideration[];
  rationaleFa: string[];
  rationaleEn: string[];
  tradeoffsFa: string[];
  tradeoffsEn: string[];
  parallelCareFa: string[];
  parallelCareEn: string[];
  cost30Days: Type2MonthlyCostEstimate[];
  urgentReview: boolean;
}

export interface Type2ScenarioBuildInput {
  assessment: Type2AssessmentResult;
  request: Type2ConsiderationRequest;
  insuranceProvider?: InsuranceProvider;
  costingPlansByMedicationId?: Record<string, Type2CostingPlan>;
  sortMode?: Type2ScenarioSortMode;
  maxScenarios?: 1 | 2 | 3;
}

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function classKey(item: Type2MedicationConsideration) {
  const text = normalized(`${item.therapeuticClass} ${item.genericName}`);
  if (text.includes("sglt2")) return "sglt2";
  if (text.includes("dpp 4")) return "dpp4";
  if (text.includes("sulfonyl")) return "sulfonylurea";
  if (text.includes("meglitin")) return "meglitinide";
  if (text.includes("thiazolidinedione") || text.includes("tzd")) return "tzd";
  if (text.includes("metformin") || text.includes("biguanide")) return "metformin";
  if (text.includes("resmetirom")) return "resmetirom";
  if (["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(item.therapyGroup)) return "glp1";
  if (["human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin"].includes(item.therapyGroup)) return "insulin";
  return item.therapyGroup;
}

function isInjectable(item: Type2MedicationConsideration) {
  return [
    "glp_1_receptor_agonist",
    "dual_gip_glp_1_receptor_agonist",
    "human_insulin",
    "basal_insulin_analog",
    "prandial_insulin_analog",
    "premixed_insulin",
    "fixed_ratio_combination",
  ].includes(item.therapyGroup);
}

function isSglt2(item: Type2MedicationConsideration) {
  return classKey(item) === "sglt2";
}

function isGlp1(item: Type2MedicationConsideration) {
  return classKey(item) === "glp1";
}

function isInsulin(item: Type2MedicationConsideration) {
  return classKey(item) === "insulin";
}

function isTzd(item: Type2MedicationConsideration) {
  return classKey(item) === "tzd";
}

function isHypoglycemiaProne(item: Type2MedicationConsideration) {
  const key = classKey(item);
  return key === "insulin" || key === "sulfonylurea" || key === "meglitinide";
}

function currentMedicationIds(request: Type2ConsiderationRequest) {
  return new Set((request.currentMedications ?? [])
    .filter((item) => (item.status ?? "active") === "active")
    .map((item) => item.genericMedicationId)
    .filter((value): value is string => Boolean(value)));
}

function hasFactor(request: Type2ConsiderationRequest, factor: Type2ConsiderationRequest["factors"][number]) {
  if (request.factors.includes(factor)) return true;
  if (factor === "ascvd") return Boolean(request.clinicalContext?.cardiovascular?.ascvd);
  if (factor === "heart_failure") return Boolean(request.clinicalContext?.cardiovascular?.heartFailure);
  if (factor === "ckd") return Boolean(request.clinicalContext?.kidney?.ckd);
  if (factor === "masld_mash") return Boolean(request.clinicalContext?.liver?.masldMash);
  if (factor === "pregnancy") return Boolean(request.clinicalContext?.pregnancy);
  return false;
}

function coverageFor(item: Type2MedicationConsideration, provider?: InsuranceProvider) {
  if (!provider) return undefined;
  return item.insuranceCoverages.find((entry) => entry.provider === provider);
}

function hasPositiveInsuranceCoverage(item: Type2MedicationConsideration, provider?: InsuranceProvider) {
  if (provider) return (coverageFor(item, provider)?.percent ?? 0) > 0;
  return item.insuranceCoverages.some((entry) => entry.percent > 0);
}

function effectiveRetailPrice(price?: MedicationPrice) {
  if (!price) return undefined;
  return price.manualOverrideToman ?? price.amountToman;
}

/**
 * Cost calculator deliberately never invents a dose. Exact 30-day cost is only
 * produced when a clinician-entered/approved daily-unit plan AND pack size are
 * available. Otherwise package-level price is surfaced transparently.
 */
export function estimateType2Medication30DayCost(input: {
  price?: MedicationPrice;
  priceRange?: MedicationPriceRange;
  coverages?: InsuranceCoverage[];
  insuranceProvider?: InsuranceProvider;
  plan?: Type2CostingPlan;
}): Type2MonthlyCostEstimate {
  const retail = effectiveRetailPrice(input.price);
  const range = retail === undefined ? input.priceRange : undefined;
  const coverage = input.insuranceProvider
    ? (input.coverages ?? []).find((entry) => entry.provider === input.insuranceProvider && entry.runtimeEligibleForRanking !== false)
    : undefined;

  if (retail === undefined && !range) {
    return {
      status: "price_missing",
      days: 30,
      insuranceProvider: input.insuranceProvider,
      coveragePercent: coverage?.percent,
      calculationBasis: "قیمت معتبر NFI برای این فرآورده ثبت نشده است؛ هزینه ماهانه محاسبه نشد.",
    };
  }

  if (range) {
    const base = {
      days: 30 as const,
      retailPerPackageMinToman: range.minToman,
      retailPerPackageMedianToman: range.medianToman,
      retailPerPackageMaxToman: range.maxToman,
      coveragePercent: coverage?.percent,
      insuranceProvider: input.insuranceProvider,
    };
    if (range.costComparable === false && input.plan?.marketPackageVerified !== true) {
      return {
        ...base,
        status: "per_package_only",
        calculationBasis: "این بازه چند Presentation متفاوت را پوشش می‌دهد و Package measure مشترک تأیید نشده است؛ برای محاسبه ۳۰روزه باید فرآورده/قدرت/بسته مشخص شود.",
      };
    }
    const dailyUnits = input.plan?.dailyUnits;
    const unitsPerPackage = input.plan?.unitsPerPackage;
    if (!(dailyUnits && dailyUnits > 0 && unitsPerPackage && unitsPerPackage > 0)) {
      return {
        ...base,
        status: input.plan ? "dose_or_pack_missing" : "per_package_only",
        calculationBasis: `بازه قیمت از ${range.productCount} فرآورده NFI قابل‌مقایسه ساخته شده است؛ برای هزینه ۳۰روزه دوز/واحد روزانه و تعداد واحد در بسته لازم است.`,
      };
    }
    const packages = Math.ceil((dailyUnits * 30) / unitsPerPackage);
    return {
      ...base,
      status: "calculated_range",
      packagesFor30Days: packages,
      retail30DaysMinToman: packages * range.minToman,
      retail30DaysMaxToman: packages * range.maxToman,
      calculationBasis: range.costComparable === false
        ? "Package measure بین فرآورده‌های این بازه توسط Market v2.3 همسان و معتبر تشخیص داده شد؛ هزینه خرده‌فروشی ۳۰روزه به‌صورت بازه محاسبه شد. سهم دقیق بیمار نیازمند انتخاب فرآورده و تعرفه/سهم ریالی معتبر بیمه است."
        : "هزینه خرده‌فروشی ۳۰روزه به‌صورت بازه از قیمت فرآورده‌های NFI محاسبه شده است؛ سهم دقیق بیمار نیازمند انتخاب فرآورده و تعرفه/سهم ریالی معتبر بیمه است.",
    };
  }

  const financial = (() => {
    if (!coverage || coverage.percent <= 0) {
      return { patient: retail!, insurer: 0, exact: true, basis: "بدون پوشش مثبت برای بیمه انتخاب‌شده؛ هزینه بیمار برابر قیمت خرده‌فروشی در نظر گرفته شد." };
    }
    if (coverage.patientShareToman !== undefined) {
      const patient = Math.max(0, coverage.patientShareToman);
      const insurer = coverage.insurerShareToman ?? Math.max(0, retail! - patient);
      return { patient, insurer, exact: true, basis: "سهم ریالی بیمار/سازمان از داده بیمه استفاده شد." };
    }
    if (coverage.insurerShareToman !== undefined) {
      const insurer = Math.max(0, coverage.insurerShareToman);
      return { patient: Math.max(0, retail! - insurer), insurer, exact: true, basis: "سهم ریالی سازمان از داده بیمه استفاده شد." };
    }
    if (coverage.referencePriceToman !== undefined) {
      const insurer = Math.max(0, Math.round(coverage.referencePriceToman * coverage.percent / 100));
      return { patient: Math.max(0, retail! - insurer), insurer, exact: true, basis: "سهم سازمان از درصد پوشش × تعرفه مرجع بیمه محاسبه شد." };
    }
    return { patient: undefined, insurer: undefined, exact: false, basis: "فقط درصد پوشش موجود است؛ بدون تعرفه مرجع یا سهم ریالی، مبلغ بیمار/بیمه ساخته نمی‌شود." };
  })();

  const base = {
    days: 30 as const,
    retailPerPackageToman: retail,
    patientPerPackageToman: financial.patient,
    insurerPerPackageToman: financial.insurer,
    coveragePercent: coverage?.percent,
    insuranceProvider: input.insuranceProvider,
  };

  if (!input.plan) {
    return {
      ...base,
      status: "per_package_only",
      calculationBasis: `${financial.basis} برای هزینه ۳۰روزه، دوز/واحد روزانه و تعداد واحد در بسته لازم است.`,
    };
  }

  const dailyUnits = input.plan.dailyUnits;
  const unitsPerPackage = input.plan.unitsPerPackage;
  if (!(dailyUnits && dailyUnits > 0 && unitsPerPackage && unitsPerPackage > 0)) {
    return {
      ...base,
      status: "dose_or_pack_missing",
      calculationBasis: "دوز روزانه یا تعداد واحد در بسته کامل نیست؛ برآورد ۳۰روزه عمداً ساخته نشد.",
    };
  }

  const packages = Math.ceil((dailyUnits * 30) / unitsPerPackage);
  return {
    ...base,
    status: financial.exact ? "calculated" : "retail_only",
    packagesFor30Days: packages,
    retail30DaysToman: packages * retail!,
    patient30DaysToman: financial.patient === undefined ? undefined : packages * financial.patient,
    insurer30DaysToman: financial.insurer === undefined ? undefined : packages * financial.insurer,
    calculationBasis: `${dailyUnits} ${input.plan.unitLabel ?? "واحد"}/روز × ۳۰ روز ÷ ${unitsPerPackage} ${input.plan.unitLabel ?? "واحد"}/بسته؛ ${financial.basis}`,
  };
}

function adjustedClinicalScore(item: Type2MedicationConsideration, request: Type2ConsiderationRequest) {
  let score = item.priorityScore;
  const eGfr = request.clinicalContext?.kidney?.eGfr ?? request.eGfr;
  const dialysis = Boolean(request.clinicalContext?.kidney?.dialysis);

  // ADA 2026: advanced CKD favors GLP-1 RA for glycemic management; SGLT2
  // initiation is supported at eGFR >=20, while continuation below 20 is a
  // separate decision and should not be represented as a new-start scenario.
  if (hasFactor(request, "ckd") && eGfr !== undefined && eGfr < 30 && isGlp1(item)) score += 24;
  if (eGfr !== undefined && eGfr < 20 && isSglt2(item) && !item.currentMedication) score -= 80;
  if (dialysis && isSglt2(item) && !item.currentMedication) score -= 100;
  if (dialysis && isGlp1(item)) score += 28;

  if (hasFactor(request, "heart_failure") && isSglt2(item)) score += 18;
  if (hasFactor(request, "heart_failure") && isTzd(item)) score -= 100;
  if (hasFactor(request, "hypoglycemia_risk") && isHypoglycemiaProne(item)) score -= 60;
  if (hasFactor(request, "weight_priority") && isGlp1(item)) score += 12;
  if (request.routePreference === "oral_only" && isInjectable(item)) score -= 1000;
  return score;
}

function marketScore(item: Type2MedicationConsideration, request: Type2ConsiderationRequest, provider?: InsuranceProvider) {
  let score = adjustedClinicalScore(item, request);
  const coverage = coverageFor(item, provider);
  if (coverage) score += Math.min(20, coverage.percent / 5);
  if (item.price) score += 5;
  if (item.relativeCost === "low") score += 18;
  else if (item.relativeCost === "medium") score += 8;
  else score -= 8;
  return score;
}

/**
 * The access-oriented scenario may optimize within clinically appropriate
 * choices, but cost/coverage must never promote a medicine that drops the
 * guideline-mandated cardiorenal benefit for an established outcome phenotype.
 */
function isOutcomeAlignedAccessCandidate(item: Type2MedicationConsideration, request: Type2ConsiderationRequest) {
  const eGfr = request.clinicalContext?.kidney?.eGfr ?? request.eGfr;
  const dialysis = Boolean(request.clinicalContext?.kidney?.dialysis);
  const canStartSglt2 = !dialysis && (eGfr === undefined || eGfr >= 20);

  if (hasFactor(request, "heart_failure")) {
    if (isSglt2(item) && canStartSglt2) return true;
    if (hasFactor(request, "ckd") && isGlp1(item)) return true;
    return false;
  }
  if (hasFactor(request, "ckd")) {
    return isGlp1(item) || (isSglt2(item) && canStartSglt2);
  }
  if (hasFactor(request, "ascvd")) {
    return isSglt2(item) || isGlp1(item);
  }
  if (hasFactor(request, "masld_mash")) {
    return isGlp1(item) || classKey(item) === "resmetirom";
  }
  return true;
}

function isCompatiblePair(left: Type2MedicationConsideration, right: Type2MedicationConsideration) {
  const leftKey = classKey(left);
  const rightKey = classKey(right);
  if (leftKey === rightKey) return false;
  if ((leftKey === "glp1" && rightKey === "dpp4") || (leftKey === "dpp4" && rightKey === "glp1")) return false;
  if (left.therapyGroup === "fixed_ratio_combination" || right.therapyGroup === "fixed_ratio_combination") return false;
  return true;
}

function parallelCare(request: Type2ConsiderationRequest) {
  const fa: string[] = [];
  const en: string[] = [];
  if (hasFactor(request, "diabetic_foot")) {
    fa.push("مسیر زخم/عفونت پای دیابتی باید هم‌زمان و مستقل از رتبه‌بندی داروهای کاهنده قند پیگیری شود (IWGDF 2023).",
      "در صورت عفونت، ایسکمی یا زخم فعال، ارزیابی شدت، خون‌رسانی، off-loading و درمان زخم نباید به دلیل انتخاب داروی دیابت به تعویق بیفتد.");
    en.push("Run the diabetes-related foot ulcer/infection pathway in parallel with glucose-lowering selection (IWGDF 2023).",
      "Active ulcer, infection, or ischemia requires severity/perfusion assessment, off-loading, and wound care without delay from diabetes-drug selection.");
  }
  if (request.clinicalContext?.kidney?.recentAki) {
    fa.push("AKI اخیر نیازمند بازبینی وضعیت حجم، عملکرد کلیه و داروهای وابسته به کلیه پیش از شروع/ادامه درمان است.");
    en.push("Recent AKI requires volume, kidney-function, and kidney-dependent medication review before starting or continuing therapy.");
  }
  if (request.clinicalContext?.liver?.decompensatedCirrhosis) {
    fa.push("سیروز دکامپنسیه نیازمند تصمیم‌گیری تخصصی کبد و پرهیز از تعمیم الگوریتم معمول دیابت است.");
    en.push("Decompensated cirrhosis requires specialist liver review rather than routine diabetes-algorithm extrapolation.");
  }
  return { fa, en };
}

function scenarioRationale(item: Type2MedicationConsideration, request: Type2ConsiderationRequest, kind: Type2ScenarioKind) {
  const fa = [...item.rankingReasons.slice(0, 3)];
  const en: string[] = [];
  if (kind === "access_balanced") {
    fa.push("این گزینه علاوه بر تناسب بالینی، بر اساس داده ثبت‌شده قیمت/پوشش بیمه امتیاز دسترسی بهتری دارد.");
    en.push("This option preserves clinical fit while giving greater weight to recorded price and insurance access.");
  }
  if (request.currentHba1c <= request.targetHba1c && (hasFactor(request, "ascvd") || hasFactor(request, "heart_failure") || hasFactor(request, "ckd"))) {
    fa.push("قرار داشتن HbA1c روی هدف، منفعت قلبی/کلیوی مستقل از قند را حذف نمی‌کند [ADA 2026].");
    en.push("Being at the A1C target does not remove glucose-independent cardiovascular/kidney benefit [ADA 2026].");
  }
  if (hasFactor(request, "ckd") && (request.clinicalContext?.kidney?.eGfr ?? request.eGfr) !== undefined) {
    en.push("Kidney function was explicitly included in treatment ranking and safety gating.");
  }
  if (!en.length) en.push("Ranked from clinical fit, safety, current regimen, and the selected access constraints.");
  return { fa, en };
}

function makeScenario(
  rank: 1 | 2 | 3,
  kind: Type2ScenarioKind,
  primary: Type2MedicationConsideration,
  medications: Type2MedicationConsideration[],
  request: Type2ConsiderationRequest,
  insuranceProvider?: InsuranceProvider,
  plans?: Record<string, Type2CostingPlan>,
): Type2TreatmentScenario {
  const rationale = scenarioRationale(primary, request, kind);
  const parallel = parallelCare(request);
  const actionFa = primary.therapyAction === "consider_addition" ? "افزودن" : primary.therapyAction === "review_current_therapy" ? "بازبینی" : "شروع/انتخاب";
  const actionEn = primary.therapyAction === "consider_addition" ? "Add" : primary.therapyAction === "review_current_therapy" ? "Review" : "Start/choose";
  const namesFa = medications.map((item) => item.displayName ?? item.persianName).join(" + ");
  const namesEn = medications.map((item) => item.genericName).join(" + ");
  return {
    id: `${kind}:${medications.map((item) => item.cardId ?? item.genericMedicationId).join("+")}`,
    rank,
    kind,
    titleFa: kind === "clinical_best" ? "سناریوی با بیشترین تناسب بالینی" : kind === "access_balanced" ? "سناریوی متعادل علم/دسترسی" : "سناریوی جایگزین",
    titleEn: kind === "clinical_best" ? "Best clinical-fit scenario" : kind === "access_balanced" ? "Clinical/access balance" : "Alternative scenario",
    summaryFa: `${actionFa} ${namesFa}`,
    summaryEn: `${actionEn} ${namesEn}`,
    medicationIds: medications.map((item) => item.genericMedicationId),
    medications,
    rationaleFa: rationale.fa,
    rationaleEn: rationale.en,
    tradeoffsFa: [...new Set(medications.flatMap((item) => [...item.cautions, ...item.risks]).slice(0, 5))],
    tradeoffsEn: ["Review product-specific adverse effects, contraindications, interactions, and monitoring before prescribing."],
    parallelCareFa: parallel.fa,
    parallelCareEn: parallel.en,
    cost30Days: medications.map((item) => estimateType2Medication30DayCost({
      price: item.price,
      priceRange: item.priceRange,
      coverages: item.insuranceCoverages,
      insuranceProvider,
      plan: plans?.[item.genericMedicationId],
    })),
    urgentReview: Boolean(request.hyperglycemiaSymptoms || request.catabolicFeatures || request.currentHba1c > 10),
  };
}

function maintenanceScenario(request: Type2ConsiderationRequest): Type2TreatmentScenario {
  const parallel = parallelCare(request);
  return {
    id: "maintain-monitor",
    rank: 1,
    kind: "maintain_monitor",
    titleFa: "حفظ درمان و پایش",
    titleEn: "Maintain and monitor",
    summaryFa: "در نبود اندیکاسیون مستقل قلبی/کلیوی و با HbA1c روی هدف، تغییر دارویی صرفاً برای کاهش بیشتر HbA1c اولویت ندارد.",
    summaryEn: "With A1C at target and no independent cardiorenal indication, additional glucose lowering is not the default priority.",
    medicationIds: [],
    medications: [],
    rationaleFa: ["از تشدید درمان بدون نیاز روشن جلوگیری می‌شود و درمان فعلی، پایبندی، عوارض و هدف فردی بازبینی می‌شوند."],
    rationaleEn: ["Avoid unnecessary intensification; review current therapy, adherence, adverse effects, and individualized target."],
    tradeoffsFa: ["اگر ریسک قلبی، کلیوی، وزن یا شرایط بیمار تغییر کند، انتخاب دارو باید دوباره محاسبه شود."],
    tradeoffsEn: ["Recalculate if cardiovascular, kidney, weight, or other patient priorities change."],
    parallelCareFa: parallel.fa,
    parallelCareEn: parallel.en,
    cost30Days: [],
    urgentReview: false,
  };
}

function scenarioMarketCost(scenario: Type2TreatmentScenario) {
  const patientValues = scenario.cost30Days
    .map((estimate) => estimate.patient30DaysToman)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (patientValues.length) return Math.min(...patientValues);

  const retailValues = scenario.cost30Days
    .map((estimate) => estimate.retail30DaysToman)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return retailValues.length ? Math.min(...retailValues) : Number.POSITIVE_INFINITY;
}

function scenarioClinicalScore(scenario: Type2TreatmentScenario, request: Type2ConsiderationRequest) {
  if (!scenario.medications.length) return 0;
  return scenario.medications.reduce((sum, item) => sum + adjustedClinicalScore(item, request), 0) / scenario.medications.length;
}

function scenarioCoverageScore(scenario: Type2TreatmentScenario, provider?: InsuranceProvider) {
  return scenario.medications.reduce((best, item) => {
    const selected = provider
      ? coverageFor(item, provider)?.percent ?? 0
      : item.insuranceCoverages
          .filter((entry) => entry.runtimeEligibleForRanking !== false)
          .reduce((value, entry) => Math.max(value, entry.percent), 0);
    return Math.max(best, selected);
  }, 0);
}

function orderScenarios(
  scenarios: Type2TreatmentScenario[],
  mode: Type2ScenarioSortMode,
  request: Type2ConsiderationRequest,
  provider?: InsuranceProvider,
) {
  if (mode === "balanced") return scenarios;
  const ordered = [...scenarios].sort((left, right) => {
    if (mode === "clinical") {
      return scenarioClinicalScore(right, request) - scenarioClinicalScore(left, request);
    }
    if (mode === "patient_cost") {
      return scenarioMarketCost(left) - scenarioMarketCost(right) ||
        scenarioClinicalScore(right, request) - scenarioClinicalScore(left, request);
    }
    return scenarioCoverageScore(right, provider) - scenarioCoverageScore(left, provider) ||
      scenarioMarketCost(left) - scenarioMarketCost(right) ||
      scenarioClinicalScore(right, request) - scenarioClinicalScore(left, request);
  });
  return ordered.map((scenario, index) => ({ ...scenario, rank: (index + 1) as 1 | 2 | 3 }));
}

/**
 * Produces at most three clinically distinct scenarios. It is intentionally an
 * orchestration layer over the evidence-linked medication engine, not a second
 * source of prescribing doses.
 */
export function buildType2TreatmentScenarios(input: Type2ScenarioBuildInput): Type2TreatmentScenario[] {
  const { assessment, request } = input;
  const maxScenarios = input.maxScenarios ?? 3;
  const currentIds = currentMedicationIds(request);
  const independentOutcomeIndication = hasFactor(request, "ascvd") || hasFactor(request, "heart_failure") || hasFactor(request, "ckd") || hasFactor(request, "masld_mash");

  if (assessment.recommendation.hba1cGap <= 0 && !independentOutcomeIndication && !assessment.recommendation.urgentReview) {
    return [maintenanceScenario(request)];
  }

  const eligible = assessment.medications
    .filter((item) => !item.blockedBy?.length)
    .filter((item) => !item.currentMedication && !currentIds.has(item.genericMedicationId))
    .filter((item) => request.routePreference !== "oral_only" || !isInjectable(item))
    .filter((item) => request.costPreference !== "insured_only" || hasPositiveInsuranceCoverage(item, input.insuranceProvider))
    .sort((left, right) => adjustedClinicalScore(right, request) - adjustedClinicalScore(left, request));

  if (!eligible.length) return [maintenanceScenario(request)];

  const scenarios: Type2TreatmentScenario[] = [];
  const usedPrimary = new Set<string>();
  const first = eligible[0]!;
  const firstMeds: Type2MedicationConsideration[] = [first];

  // ADA 2026 supports initial combination therapy when A1C is substantially
  // above goal. Pair only distinct compatible mechanisms; never GLP-1 + DPP-4.
  if (assessment.recommendation.hba1cGap >= 1.5 && (request.currentMedications ?? []).filter((item) => (item.status ?? "active") === "active").length === 0) {
    const partner = eligible.slice(1).find((candidate) => isCompatiblePair(first, candidate));
    if (partner) firstMeds.push(partner);
  }

  scenarios.push(makeScenario(1, "clinical_best", first, firstMeds, request, input.insuranceProvider, input.costingPlansByMedicationId));
  usedPrimary.add(first.genericMedicationId);

  if (scenarios.length < maxScenarios) {
    const accessPool = eligible.filter((item) => !usedPrimary.has(item.genericMedicationId));
    const clinicallyAlignedPool = accessPool.filter((item) => isOutcomeAlignedAccessCandidate(item, request));
    const candidates = clinicallyAlignedPool.length ? clinicallyAlignedPool : accessPool;
    const access = [...candidates]
      .sort((left, right) => marketScore(right, request, input.insuranceProvider) - marketScore(left, request, input.insuranceProvider))[0];
    if (access) {
      scenarios.push(makeScenario(2, "access_balanced", access, [access], request, input.insuranceProvider, input.costingPlansByMedicationId));
      usedPrimary.add(access.genericMedicationId);
    }
  }

  if (scenarios.length < maxScenarios) {
    const alternative = eligible.find((item) =>
      !usedPrimary.has(item.genericMedicationId) &&
      classKey(item) !== classKey(first) &&
      (!request.hyperglycemiaSymptoms && !request.catabolicFeatures || isInsulin(item) || adjustedClinicalScore(item, request) >= 58)
    );
    if (alternative) scenarios.push(makeScenario(3, "alternative", alternative, [alternative], request, input.insuranceProvider, input.costingPlansByMedicationId));
  }

  return orderScenarios(scenarios.slice(0, maxScenarios), input.sortMode ?? "balanced", request, input.insuranceProvider);
}

export function currentMedicationDailyUnits(current: CurrentMedicationInput | undefined, unitStrength?: number) {
  if (!current || !(unitStrength && unitStrength > 0)) return undefined;
  if (current.totalDailyDose !== undefined) return current.totalDailyDose / unitStrength;
  if (current.doseAmount !== undefined && current.frequencyPerDay !== undefined) return (current.doseAmount * current.frequencyPerDay) / unitStrength;
  return undefined;
}
