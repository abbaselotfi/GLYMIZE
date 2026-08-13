export type InsulinCategory = "basal" | "premix" | "prandial" | "frc";
export type InsulinActionProfile = "rapid" | "short";

export interface InsulinTherapy {
  id: string;
  generic: string;
  brand: string;
  category: InsulinCategory;
  frequencies: number[];
  targetFrequencies?: number[];
  basalPercent?: number;
  prandialPercent?: number;
  actionProfile?: InsulinActionProfile;
  targetOnly?: boolean;
}

export interface InsulinDoseSplit {
  injection: number;
  dose: number;
}

export interface PremixComposition {
  basalPercent: number;
  prandialPercent: number;
  basalDose: number;
  prandialDose: number;
}

export interface SoliquaSelection {
  pen: "100/50" | "100/33";
  penRange: "10–40" | "30–60";
  startingDose: 10 | 20 | 30;
  lixisenatideStartingDoseMcg: 5 | 10;
}

export interface InsulinConversionInput {
  sourceId: string;
  targetId: string;
  totalDailyDose: number;
  sourceFrequency?: number;
  targetFrequency?: number;
  conservativeReduction?: boolean;
  highHypoglycemiaRisk?: boolean;
  diabetesType?: "type_1" | "type_2";
  severeRenalImpairmentOrEsrd?: boolean;
  severeGastroparesis?: boolean;
}

export interface InsulinConversionResult {
  source: InsulinTherapy;
  target: InsulinTherapy;
  currentTotalDailyDose: number;
  estimatedTotalDailyDose: number;
  factor: number;
  formula: string;
  sourceComposition?: PremixComposition;
  targetComposition?: PremixComposition;
  arithmeticSchedule?: InsulinDoseSplit[];
  soliqua?: SoliquaSelection;
  adjustedBasalDose?: number;
  warnings: string[];
  warningsFa: string[];
  rationale: string[];
  rationaleFa: string[];
  evidence: string[];
  specialistReview: boolean;
  requiresPrandialPlan: boolean;
}

export const INSULIN_THERAPIES: readonly InsulinTherapy[] = Object.freeze([
  { id: "glargine-u100", generic: "Insulin glargine U-100", brand: "Lantus / biosimilar", category: "basal", frequencies: [1, 2, 3] },
  { id: "glargine-u300", generic: "Insulin glargine U-300", brand: "Toujeo", category: "basal", frequencies: [1] },
  { id: "degludec-u100", generic: "Insulin degludec U-100", brand: "Tresiba", category: "basal", frequencies: [1] },
  { id: "detemir-u100", generic: "Insulin detemir U-100", brand: "Levemir", category: "basal", frequencies: [1, 2, 3] },
  { id: "nph-u100", generic: "Human insulin NPH U-100", brand: "NPH", category: "basal", frequencies: [1, 2, 3] },
  { id: "aspart-mix-30", generic: "Biphasic insulin aspart 30", brand: "NovoMix 30", category: "premix", frequencies: [1, 2, 3], targetFrequencies: [2, 3], basalPercent: 70, prandialPercent: 30 },
  { id: "lispro-mix-25", generic: "Insulin lispro mix 25", brand: "Humalog Mix 25", category: "premix", frequencies: [1, 2, 3], targetFrequencies: [2, 3], basalPercent: 75, prandialPercent: 25 },
  { id: "lispro-mix-50", generic: "Insulin lispro mix 50", brand: "Humalog Mix 50", category: "premix", frequencies: [1, 2, 3], targetFrequencies: [2, 3], basalPercent: 50, prandialPercent: 50 },
  { id: "human-mix-70-30", generic: "Human insulin 70/30", brand: "Human premix 70/30", category: "premix", frequencies: [1, 2, 3], targetFrequencies: [2, 3], basalPercent: 70, prandialPercent: 30 },
  { id: "degludec-aspart-70-30", generic: "Insulin degludec/aspart 70/30", brand: "Ryzodeg", category: "premix", frequencies: [1, 2], targetFrequencies: [1, 2], basalPercent: 70, prandialPercent: 30 },
  { id: "aspart-u100", generic: "Insulin aspart U-100", brand: "NovoRapid", category: "prandial", actionProfile: "rapid", frequencies: [1, 2, 3] },
  { id: "lispro-u100", generic: "Insulin lispro U-100", brand: "Humalog", category: "prandial", actionProfile: "rapid", frequencies: [1, 2, 3] },
  { id: "glulisine-u100", generic: "Insulin glulisine U-100", brand: "Apidra", category: "prandial", actionProfile: "rapid", frequencies: [1, 2, 3] },
  { id: "regular-u100", generic: "Human regular insulin U-100", brand: "Regular", category: "prandial", actionProfile: "short", frequencies: [1, 2, 3] },
  { id: "soliqua", generic: "Insulin glargine/lixisenatide", brand: "FRC Soliqua / Suliqua", category: "frc", targetOnly: true, frequencies: [1] },
]);

export function getInsulinTherapy(id: string) {
  return INSULIN_THERAPIES.find((item) => item.id === id);
}

export function allowedInsulinTargets(sourceId: string, options?: { diabetesType?: "type_1" | "type_2" }) {
  const source = getInsulinTherapy(sourceId);
  if (!source) return [];
  return INSULIN_THERAPIES.filter((target) => {
    if (target.id === source.id || target.targetOnly === false) return false;
    if (source.category === "prandial") return target.category === "prandial";
    if (target.category === "prandial") return false;
    if (source.category === "frc") return false;
    if (target.category === "frc") return (options?.diabetesType ?? "type_2") === "type_2" && ["basal", "premix"].includes(source.category);
    return true;
  });
}

function roundDose(value: number) {
  return Math.round(value);
}

export function premixComposition(therapy: InsulinTherapy, totalDailyDose: number): PremixComposition | undefined {
  if (therapy.category !== "premix" || therapy.basalPercent === undefined || therapy.prandialPercent === undefined) return undefined;
  return {
    basalPercent: therapy.basalPercent,
    prandialPercent: therapy.prandialPercent,
    basalDose: roundDose(totalDailyDose * therapy.basalPercent / 100),
    prandialDose: roundDose(totalDailyDose * therapy.prandialPercent / 100),
  };
}

export function splitDoseArithmetic(totalDailyDose: number, frequency: number): InsulinDoseSplit[] {
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 3) throw new Error("INVALID_TARGET_FREQUENCY");
  const base = Math.floor(totalDailyDose / frequency);
  let remainder = totalDailyDose - base * frequency;
  return Array.from({ length: frequency }, (_, index) => {
    const dose = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return { injection: index + 1, dose };
  });
}

export function selectSoliquaStartingPen(adjustedBasalDose: number): SoliquaSelection {
  if (!Number.isFinite(adjustedBasalDose) || adjustedBasalDose <= 0 || adjustedBasalDose > 60) throw new Error("SOLIQUA_RANGE");
  if (adjustedBasalDose < 20) {
    return { pen: "100/50", penRange: "10–40", startingDose: 10, lixisenatideStartingDoseMcg: 5 };
  }
  if (adjustedBasalDose < 30) {
    return { pen: "100/50", penRange: "10–40", startingDose: 20, lixisenatideStartingDoseMcg: 10 };
  }
  return { pen: "100/33", penRange: "30–60", startingDose: 30, lixisenatideStartingDoseMcg: 10 };
}

function validatePath(source: InsulinTherapy, target: InsulinTherapy) {
  if (source.id === target.id) throw new Error("SAME_INSULIN");
  if (source.category === "frc") throw new Error("FRC_SOURCE_NOT_SUPPORTED");
  if (source.category === "prandial" && target.category !== "prandial") throw new Error("INSUFFICIENT_REGIMEN");
  if (target.category === "prandial" && source.category !== "prandial") throw new Error("INSUFFICIENT_REGIMEN");
  if (target.category === "frc" && !["basal", "premix"].includes(source.category)) throw new Error("SOLIQUA_BASAL_OR_PREMIX_ONLY");
}

function automaticFactor(source: InsulinTherapy, target: InsulinTherapy, sourceFrequency: number, highHypoglycemiaRisk: boolean) {
  if (source.category === "prandial" && target.category === "prandial") {
    if (source.actionProfile === target.actionProfile) {
      return { factor: 1, locked: true, rationale: "Rapid-acting analog interchange is represented as unit-for-unit; meal timing and glucose monitoring still require review.", rationaleFa: "تبدیل بین آنالوگ‌های سریع‌الاثر به‌صورت واحد به واحد نمایش داده می‌شود؛ زمان‌بندی وعده و پایش قند همچنان باید بازبینی شود." };
    }
    return { factor: 0.8, locked: true, rationale: "A conservative 20% reduction is used for rapid-acting analog ↔ Regular interchange; timing differs and close monitoring is required.", rationaleFa: "در تبدیل آنالوگ سریع‌الاثر ↔ Regular کاهش احتیاطی ۲۰٪ اعمال می‌شود؛ زمان تزریق متفاوت است و پایش نزدیک لازم است." };
  }
  if (source.id === "glargine-u300" && target.id === "glargine-u100") {
    return { factor: 0.8, locked: true, rationale: "Product-label switching from glargine U-300 to glargine U-100 uses an initial dose reduction.", rationaleFa: "در تبدیل گلارژین U-300 به U-100 طبق دستور محصول کاهش دوز اولیه اعمال می‌شود." };
  }
  if (target.id === "glargine-u300" && ["nph-u100", "detemir-u100"].includes(source.id) && sourceFrequency > 1) {
    return { factor: 0.8, locked: true, rationale: "When switching twice-daily NPH/detemir to glargine U-300, 80% of the previous total daily basal dose is used initially.", rationaleFa: "در تبدیل NPH/Detemir دوبار در روز به گلارژین U-300، شروع با ۸۰٪ مجموع دوز روزانه بیزال قبلی انجام می‌شود." };
  }
  if (target.category === "frc" && (source.id === "glargine-u300" || (source.category === "basal" && sourceFrequency > 1))) {
    return { factor: 0.8, locked: true, rationale: "For Suliqua/Soliqua initiation after glargine U-300 or twice-daily basal insulin, the prior basal total is reduced before pen selection.", rationaleFa: "برای شروع Suliqua/Soliqua پس از گلارژین U-300 یا بیزال دوبار در روز، مجموع دوز بیزال قبلی پیش از انتخاب قلم ۲۰٪ کاهش می‌یابد." };
  }
  if (source.category === "basal" && sourceFrequency > 1) {
    return { factor: 0.8, locked: true, rationale: "A 20% reduction is used when consolidating a multiple-injection basal regimen.", rationaleFa: "هنگام تبدیل رژیم بیزال چندتزریقی به رژیم جایگزین، کاهش اولیه ۲۰٪ برای شروع محافظه‌کارانه اعمال می‌شود." };
  }
  if (highHypoglycemiaRisk) {
    return { factor: 0.8, locked: false, rationale: "ADA 2026 allows an initial 10–20% reduction when switching basal insulin in tightly managed patients or those at higher hypoglycemia risk.", rationaleFa: "ADA 2026 در بیماران با کنترل بسیار فشرده یا ریسک بالاتر هیپوگلیسمی، کاهش اولیه ۱۰ تا ۲۰٪ را هنگام تعویض بیزال قابل استفاده می‌داند." };
  }
  return { factor: 1, locked: false, rationale: "Basal insulin switches are commonly initiated unit-for-unit when no product-specific reduction or high hypoglycemia risk applies.", rationaleFa: "در نبود کاهش اختصاصی محصول یا ریسک بالای هیپوگلیسمی، بسیاری از تبدیل‌های بیزال با نسبت واحد به واحد شروع و سپس بر اساس پایش تنظیم می‌شوند." };
}

export function calculateInsulinConversion(input: InsulinConversionInput): InsulinConversionResult {
  const source = getInsulinTherapy(input.sourceId);
  const target = getInsulinTherapy(input.targetId);
  const dose = Number(input.totalDailyDose);
  const sourceFrequency = Number(input.sourceFrequency ?? 1);
  const targetFrequency = Number(input.targetFrequency ?? 1);
  if (!source || !target) throw new Error("UNKNOWN_THERAPY");
  validatePath(source, target);
  if (target.category === "frc" && input.diabetesType === "type_1") throw new Error("FRC_TYPE2_ONLY");
  if (target.category === "frc" && input.severeRenalImpairmentOrEsrd) throw new Error("SOLIQUA_SEVERE_RENAL_NOT_RECOMMENDED");
  if (target.category === "frc" && input.severeGastroparesis) throw new Error("SOLIQUA_SEVERE_GI_NOT_RECOMMENDED");
  if (!Number.isFinite(dose) || dose <= 0 || dose > 300) throw new Error("INVALID_DOSE");
  if (!source.frequencies.includes(sourceFrequency)) throw new Error("INVALID_FREQUENCY");
  if (target.category === "premix" && !(target.targetFrequencies ?? target.frequencies).includes(targetFrequency)) throw new Error("INVALID_TARGET_FREQUENCY");

  const warnings: string[] = [];
  const warningsFa: string[] = [];
  const rationale: string[] = [];
  const rationaleFa: string[] = [];
  const evidence = ["ADA Standards of Care 2026 §9", "Product-specific prescribing information"];
  let specialistReview = false;
  let requiresPrandialPlan = false;
  const sourceComposition = premixComposition(source, dose);

  let calculationBasis = dose;
  let basisLabel = `${dose}`;
  if (source.category === "premix" && ["basal", "frc"].includes(target.category)) {
    calculationBasis = dose * (source.basalPercent ?? 0) / 100;
    basisLabel = `${dose} × ${source.basalPercent}% basal`;
    requiresPrandialPlan = true;
    warnings.push("Premix contains prandial insulin. Converting only its basal fraction does not replace the removed meal-time coverage; a separate prandial/glycemic plan is required.");
    warningsFa.push("انسولین میکس دارای جزء پرندیال است. تبدیل فقط سهم بیزال، پوشش وعده‌ای حذف‌شده را جایگزین نمی‌کند؛ برنامه جداگانه پرندیال/کنترل قند لازم است.");
  }

  const rule = automaticFactor(source, target, sourceFrequency, Boolean(input.highHypoglycemiaRisk));
  const requestedConservativeFactor = input.conservativeReduction ? 0.8 : 1;
  const factor = rule.locked ? rule.factor : Math.min(rule.factor, requestedConservativeFactor);
  rationale.push(rule.rationale);
  rationaleFa.push(rule.rationaleFa);
  const adjustedDose = roundDose(calculationBasis * factor);

  if (source.category === "basal" && sourceFrequency > 2) {
    specialistReview = true;
    warnings.push("A reported three-injection basal regimen is accepted for reconciliation of the total daily dose, but this administration pattern is not treated as a standard autonomous switching rule; specialist review is required.");
    warningsFa.push("رژیم بیزال سه‌تزریقی برای جمع‌زدن دوز روزانه پذیرفته می‌شود، اما به‌عنوان قاعده استاندارد تبدیل خودکار در نظر گرفته نمی‌شود و نیازمند بازبینی تخصصی است.");
  } else if (
    source.category === "basal" &&
    sourceFrequency > 1 &&
    target.category !== "frc" &&
    !(target.id === "glargine-u300" && ["nph-u100", "detemir-u100"].includes(source.id)) &&
    !(source.id === "nph-u100" && target.id === "glargine-u100")
  ) {
    specialistReview = true;
    warnings.push("The 20% reduction for this multi-injection basal consolidation is a conservative switching guardrail rather than a universal product-label rule; review the source regimen, glucose pattern, and monitoring plan before prescribing.");
    warningsFa.push("کاهش ۲۰٪ در این تبدیل بیزال چندتزریقی یک guardrail محافظه‌کارانه است و قاعده عمومی برچسب همه محصولات نیست؛ رژیم مبدأ، الگوی قند و برنامه پایش پیش از تجویز بازبینی شود.");
  }

  if (target.category === "frc") {
    const soliqua = selectSoliquaStartingPen(adjustedDose);
    if (source.category === "premix") {
      specialistReview = true;
      warnings.push("Premix → iGlarLixi is an evidence-supported clinical switch, but the official Suliqua initiation table does not provide a dedicated numeric premix conversion; specialist review is required.");
      warningsFa.push("تغییر Premix → iGlarLixi شواهد بالینی حمایتی دارد، اما جدول رسمی شروع Suliqua تبدیل عددی اختصاصی برای Premix ارائه نمی‌کند؛ بازبینی تخصصی الزامی است.");
      evidence.push("Premix-to-iGlarLixi switch evidence; official initiation table remains the dosing authority");
    }
    return {
      source,
      target,
      currentTotalDailyDose: dose,
      estimatedTotalDailyDose: soliqua.startingDose,
      factor,
      formula: `${basisLabel} × ${factor} → ${soliqua.startingDose} dose steps`,
      sourceComposition,
      soliqua,
      adjustedBasalDose: adjustedDose,
      warnings,
      warningsFa,
      rationale,
      rationaleFa,
      evidence,
      specialistReview,
      requiresPrandialPlan,
    };
  }

  const targetComposition = premixComposition(target, adjustedDose);
  let arithmeticSchedule: InsulinDoseSplit[] | undefined;
  if (target.category === "premix") {
    arithmeticSchedule = splitDoseArithmetic(adjustedDose, targetFrequency);
    warnings.push("The displayed split only reconciles the total daily dose arithmetically. Meal-specific premix allocation must be individualized to meal pattern and SMBG/CGM; do not use this split as an autonomous prescription.");
    warningsFa.push("تقسیم نمایش‌داده‌شده فقط مجموع دوز روزانه را از نظر حسابی بین تزریق‌ها توزیع می‌کند. توزیع میکس نسبت به وعده‌ها باید بر اساس الگوی غذا و SMBG/CGM فردی‌سازی شود و این تقسیم نباید به‌عنوان نسخه خودکار استفاده شود.");
  }
  if (source.category === "premix" && target.category === "basal") specialistReview = true;
  if (source.category === "prandial" && target.actionProfile === "short") { warnings.push("Regular insulin is generally administered earlier before meals than rapid-acting analogs; verify product-specific meal timing."); warningsFa.push("Regular insulin معمولاً زودتر از آنالوگ‌های سریع‌الاثر نسبت به وعده تزریق می‌شود؛ زمان‌بندی اختصاصی محصول بررسی شود."); }
  if (source.category === "prandial" && source.actionProfile === "short" && target.actionProfile === "rapid") { warnings.push("Rapid-acting analog timing differs from Regular insulin; verify meal timing and glucose monitoring."); warningsFa.push("زمان تزریق آنالوگ سریع‌الاثر با Regular متفاوت است؛ زمان وعده و پایش قند بازبینی شود."); }

  return {
    source,
    target,
    currentTotalDailyDose: dose,
    estimatedTotalDailyDose: adjustedDose,
    factor,
    formula: `${basisLabel} × ${factor} = ${adjustedDose}`,
    sourceComposition,
    targetComposition,
    arithmeticSchedule,
    warnings,
    warningsFa,
    rationale,
    rationaleFa,
    evidence,
    specialistReview,
    requiresPrandialPlan,
  };
}
