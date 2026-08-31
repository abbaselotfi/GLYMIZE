import type {
  InsuranceCoverage,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  MedicationClinicalEffect,
} from "@glymize/contracts";
import type {
  ClinicalEffectV2,
  ClinicalObjectiveIdV2,
  DecisionGraphInventoryV2,
  DecisionLaneV2,
  DoseRuleV2,
  EvidenceReferenceV2,
  FrcProductProtocolBindingV2,
  GlycemicEfficacyBandV2,
  InsulinConversionRuleV2,
  InsurancePolicyRuleV2,
  IranMarketProductV2,
  KnowledgeMedicationV2,
  MedicationGateRuleV2,
  RegimenConflictRuleV2,
  RegimenTemplateV2,
  StrengthComponentV2,
  TitrationProtocolV2,
  WeightDirectionV2,
} from "./types.js";
import { applyCoreClinicalRulesToInventoryV2 } from "./inventory-rules.js";

export interface InventoryAdapterPolicyV2 {
  verifiedMatchConfidenceAtOrAbove: number;
  recentObservationMaxAgeDays: number;
  asOf: Date;
}

export const defaultInventoryAdapterPolicyV2: InventoryAdapterPolicyV2 = {
  verifiedMatchConfidenceAtOrAbove: 95,
  recentObservationMaxAgeDays: 45,
  asOf: new Date(),
};

export interface InventoryBuildIssueV2 {
  severity: "info" | "warning" | "blocking";
  code: string;
  entityId?: string;
  message: string;
}

export interface InventoryBuildReportV2 {
  approvedWorldDrugEntries: number;
  knowledgeEntries: number;
  engineApprovedKnowledgeEntries: number;
  inputMarketProducts: number;
  mappedMarketProducts: number;
  verifiedMarketProducts: number;
  reviewRequiredMarketProducts: number;
  unmatchedMarketProducts: number;
  generatedInsurancePolicies: number;
  normalizedKnowledgeEntries?: number;
  coreInsulinDoseRules?: number;
  coreMedicationGateRules?: number;
  coreRegimenConflictRules?: number;
  coreProductDoseRules?: number;
  coreFrcDoseRules?: number;
  autoFrcProtocolBindings?: number;
  coreInsulinConversionRules?: number;
  coreTitrationProtocols?: number;
  issues: InventoryBuildIssueV2[];
}

export interface BuildDecisionGraphInventoryV2Input {
  masterRegistry: readonly MasterDrugRegistryEntry[];
  marketProducts: readonly IranMarketDrugProduct[];
  doseRules?: readonly DoseRuleV2[];
  insurancePolicies?: readonly InsurancePolicyRuleV2[];
  medicationGateRules?: readonly MedicationGateRuleV2[];
  regimenConflictRules?: readonly RegimenConflictRuleV2[];
  regimenTemplates?: readonly RegimenTemplateV2[];
  frcProtocolBindings?: readonly FrcProductProtocolBindingV2[];
  insulinConversionRules?: readonly InsulinConversionRuleV2[];
  titrationProtocols?: readonly TitrationProtocolV2[];
  policy?: Partial<InventoryAdapterPolicyV2>;
}

export interface BuildDecisionGraphInventoryV2Result {
  inventory: DecisionGraphInventoryV2;
  report: InventoryBuildReportV2;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function latinDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (character) => {
    const p = PERSIAN_DIGITS.indexOf(character);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(character);
    return a >= 0 ? String(a) : character;
  });
}

function normalized(value: string | undefined) {
  return latinDigits(value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/[^a-z0-9آ-ی]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function evidenceFromMaster(entry: MasterDrugRegistryEntry): EvidenceReferenceV2[] {
  return entry.sourceCodes.map((sourceId, index) => ({
    sourceId,
    title: sourceId,
    url: entry.sourceUrls[index] ?? entry.sourceUrls[0] ?? "about:blank",
    strength: "supportive" as const,
  }));
}

function objectiveForEffect(effect: MedicationClinicalEffect): ClinicalObjectiveIdV2 | undefined {
  if (effect.domain === "glycemic_control") return "glycemic_control";
  if (effect.domain === "ascvd") return "ascvd_protection";
  if (effect.domain === "heart_failure") return "heart_failure_protection";
  if (effect.domain === "ckd") return "kidney_protection";
  if (effect.domain === "weight") return "weight_benefit";
  if (effect.domain === "masld_mash") return "liver_directed_therapy";
  if (effect.domain === "hypertension") return "blood_pressure_control";
  if (effect.domain === "lipids") return "lipid_risk_reduction";
  if (effect.domain === "diabetic_foot") return "diabetic_foot_parallel_pathway";
  if (effect.domain === "hypoglycemia" && (effect.direction === "benefit" || effect.direction === "strong_benefit")) return "low_hypoglycemia_risk";
  return undefined;
}

function mapEffects(entry: MasterDrugRegistryEntry): ClinicalEffectV2[] {
  const masterEvidence = evidenceFromMaster(entry);
  return entry.clinicalEffects.flatMap((effect): ClinicalEffectV2[] => {
    const objective = objectiveForEffect(effect);
    if (!objective) return [];
    return [{
      objective,
      direction: effect.direction,
      phenotype: effect.phenotype,
      note: effect.practicalNote,
      evidence: masterEvidence,
    }];
  });
}

function primaryLanes(entry: MasterDrugRegistryEntry): DecisionLaneV2[] {
  const text = normalized(`${entry.therapeuticAreas.join(" ")} ${(entry.primaryIndications ?? []).join(" ")} ${entry.diabetesOrPhenotype ?? ""} ${entry.guidelineRole ?? ""}`);
  const lanes = new Set<DecisionLaneV2>();
  if (/diabetes|glucose|glycemic|hyperglyc|t2d|type 2/.test(text)) lanes.add("glycemic");
  if (/kidney|renal|ckd|albuminur/.test(text)) lanes.add("kidney");
  if (/heart failure|hfref|hfpef|hfmr/.test(text)) lanes.add("heart_failure");
  if (/ascvd|atheroscler|coronary|stroke|peripheral artery/.test(text)) lanes.add("ascvd");
  if (/hypertension|blood pressure/.test(text)) lanes.add("hypertension");
  if (/lipid|cholesterol|ldl|triglycer/.test(text)) lanes.add("lipids");
  if (/liver|hepatic|masld|mash|cirrhos/.test(text)) lanes.add("liver");
  if (/diabetic foot|foot ulcer|wound/.test(text)) lanes.add("diabetic_foot");
  for (const effect of entry.clinicalEffects) {
    if (effect.domain === "ckd") lanes.add("kidney");
    if (effect.domain === "heart_failure") lanes.add("heart_failure");
    if (effect.domain === "ascvd") lanes.add("ascvd");
    if (effect.domain === "hypertension") lanes.add("hypertension");
    if (effect.domain === "lipids") lanes.add("lipids");
    if (effect.domain === "masld_mash") lanes.add("liver");
    if (effect.domain === "diabetic_foot") lanes.add("diabetic_foot");
  }
  return [...lanes];
}

function inferTherapyGroup(entry: MasterDrugRegistryEntry) {
  const text = normalized(`${entry.canonicalName} ${entry.drugClass ?? ""} ${entry.therapeuticAreas.join(" ")} ${entry.guidelineRole ?? ""}`);
  if ((/insulin/.test(text) && /glp 1|glp1/.test(text)) || /fixed ratio|frc/.test(text)) return "fixed_ratio_combination";
  if (/insulin degludec.*insulin aspart|basal prandial co formulation/.test(text)) return "premixed_insulin";
  if (/dual gip.*glp|gip.*glp|tirzepatide/.test(text)) return "dual_gip_glp_1_receptor_agonist";
  if (/glp 1|glp1/.test(text)) return "glp_1_receptor_agonist";
  if (/insulin/.test(text)) {
    if (/premix|pre mix|mix/.test(text)) return "premixed_insulin";
    if (/prandial|rapid|short|aspart|lispro|glulisine|regular/.test(text)) return "prandial_insulin_analog";
    if (/basal|glargine|degludec|detemir|nph/.test(text)) return "basal_insulin_analog";
    return "human_insulin";
  }
  if (/sglt2/.test(text)) return "sglt2_inhibitor";
  if (/dpp 4|dpp4/.test(text)) return "dpp4_inhibitor";
  if (/sulfonyl/.test(text)) return "sulfonylurea";
  if (/thiazolidinedione|tzd/.test(text)) return "thiazolidinedione";
  if (/biguanide|metformin/.test(text)) return "biguanide";
  if (/alpha glucosidase/.test(text)) return "alpha_glucosidase_inhibitor";
  if (/mineralocorticoid|finerenone|spironolactone|eplerenone/.test(text)) return "mineralocorticoid_receptor_antagonist";
  if (/raas|ace inhibitor|angiotensin|\barb\b/.test(text)) return "raas_blocker";
  if (/heart failure/.test(text)) return "heart_failure_therapy";
  if (/statin|pcsk9|ezetimibe|lipid lowering|hyperlipid/.test(text)) return "lipid_lowering";
  if (/antiplatelet|aspirin|clopidogrel|ticagrelor/.test(text)) return "antiplatelet";
  if (/anticoag|apixaban|rivaroxaban|warfarin/.test(text)) return "anticoagulant";
  if (/hypertension|antihypertensive|calcium channel blocker|beta blocker/.test(text)) return "antihypertensive";
  if (/resmetirom|liver directed/.test(text)) return "liver_directed_therapy";
  return entry.combination ? "fixed_dose_combination" : "other";
}

function inferEfficacyBand(entry: MasterDrugRegistryEntry): GlycemicEfficacyBandV2 {
  const text = normalized(`${entry.guidelineRole ?? ""} ${(entry.primaryIndications ?? []).join(" ")}`);
  if (/very high efficacy|very high.*glucose|very high.*glycemic/.test(text)) return "very_high";
  if (/high efficacy|high efficacy.*glucose|high.*glucose lowering/.test(text)) return "high";
  if (/intermediate efficacy|moderate efficacy|intermediate.*glucose/.test(text)) return "intermediate";
  if (/modest efficacy|low efficacy|alternative low efficacy|modest.*glucose/.test(text)) return "modest";
  return "none";
}

function inferWeightDirection(entry: MasterDrugRegistryEntry): WeightDirectionV2 {
  const weight = entry.clinicalEffects.find((effect) => effect.domain === "weight");
  if (!weight) return "unknown";
  if (weight.direction === "benefit" || weight.direction === "strong_benefit") return "loss";
  if (weight.direction === "risk" || weight.direction === "avoid") return "gain";
  if (weight.direction === "neutral") return "neutral";
  return "unknown";
}

function inferHypoglycemiaRisk(entry: MasterDrugRegistryEntry): KnowledgeMedicationV2["hypoglycemiaRisk"] {
  const text = normalized(`${entry.drugClass ?? ""} ${entry.guidelineRole ?? ""} ${entry.safetyMonitoring ?? ""}`);
  if (/insulin|sulfonyl|meglitinide|glinide/.test(text)) return "high";
  if (/glp 1|glp1|sglt2|dpp 4|dpp4|metformin|biguanide/.test(text)) return "low";
  return "moderate";
}

function splitCombinationNames(name: string) {
  return name.split(/\s*[\/+]\s*/).map((item) => normalized(item)).filter(Boolean);
}

function resolveCombinationComponents(entry: MasterDrugRegistryEntry, registry: readonly MasterDrugRegistryEntry[]) {
  if (!entry.combination) return undefined;
  const canonical = normalized(entry.canonicalName);

  const exactOrUniquePrefix = (name: string) => {
    const exact = registry.find((candidate) => !candidate.combination && normalized(candidate.canonicalName) === name);
    if (exact) return exact.id;
    const candidates = registry.filter((candidate) => !candidate.combination && normalized(candidate.canonicalName).startsWith(name));
    return candidates.length === 1 ? candidates[0]!.id : undefined;
  };
  const named = (pattern: RegExp) => registry.find((candidate) => !candidate.combination && pattern.test(normalized(candidate.canonicalName)))?.id;

  // Product composition disambiguation that is clinically material. iGlarLixi
  // contains insulin glargine U-100, never the U-300 WorldDrug entry.
  if (/insulin glargine.*lixisenatide/.test(canonical)) {
    const glargineU100 = named(/^insulin glargine u 100$/);
    const lixisenatide = named(/^lixisenatide$/);
    return glargineU100 && lixisenatide ? [glargineU100, lixisenatide] : undefined;
  }
  if (/insulin degludec.*liraglutide/.test(canonical)) {
    const degludec = named(/^insulin degludec/);
    const liraglutide = named(/^liraglutide$/);
    return degludec && liraglutide ? [degludec, liraglutide] : undefined;
  }
  if (/human insulin 70 30.*nph.*regular/.test(canonical)) {
    const nph = named(/^human insulin nph$/);
    const regular = named(/^human insulin regular$/);
    return nph && regular ? [nph, regular] : undefined;
  }
  if (/biphasic insulin aspart/.test(canonical)) {
    const aspart = named(/^insulin aspart$/);
    return aspart ? [aspart] : undefined;
  }
  if (/insulin lispro mix/.test(canonical)) {
    const lispro = named(/^insulin lispro$/);
    return lispro ? [lispro] : undefined;
  }

  const names = splitCombinationNames(entry.canonicalName);
  if (names.length < 2) return undefined;
  const ids = names.map(exactOrUniquePrefix);
  return ids.every((id): id is string => Boolean(id)) ? ids : undefined;
}

function normalizeDosageFormGroup(value: string | undefined) {
  const text = normalized(value);
  if (/extended release|xr|er|modified release|sustained release|آهسته رهش|پیوسته رهش/.test(text) && /tablet|قرص/.test(text)) return "extended_release_tablet";
  if (/tablet|tab|قرص/.test(text)) return "tablet";
  if (/capsule|cap|کپسول/.test(text)) return "capsule";
  if (/syrup|شربت/.test(text)) return "syrup";
  if (/oral.*solution|solution.*oral|محلول خوراکی/.test(text)) return "oral_solution";
  if (/suspension|سوسپانسیون/.test(text)) return "oral_suspension";
  if (/pen|قلم/.test(text)) return "injection_pen";
  if (/prefilled syringe|pre filled syringe|سرنگ از پیش پر/.test(text)) return "prefilled_syringe";
  if (/vial|ویال/.test(text)) return "injection_vial";
  if (/ampoule|ampule|آمپول/.test(text)) return "injection_ampoule";
  if (/inject|تزریق/.test(text)) return "injection";
  if (/ophthalm|eye|چشم/.test(text)) return "ophthalmic";
  if (/cream|ointment|gel|topical|کرم|پماد|موضع/.test(text)) return "topical";
  return text || "unknown";
}

function inferRoute(value: string | undefined, dosageFormGroup: string) {
  const text = normalized(value);
  if (/oral|خوراکی/.test(text) || ["tablet", "extended_release_tablet", "capsule", "syrup", "oral_solution", "oral_suspension"].includes(dosageFormGroup)) return "oral";
  if (/intraven|iv|وریدی/.test(text)) return "intravenous";
  if (/intramus|im|عضلانی/.test(text)) return "intramuscular";
  if (/subcut|sc|زیر جلد/.test(text) || dosageFormGroup.startsWith("injection_")) return "subcutaneous";
  if (/ophthalm|چشم/.test(text) || dosageFormGroup === "ophthalmic") return "ophthalmic";
  if (/topical|موضع/.test(text) || dosageFormGroup === "topical") return "topical";
  return text || "other";
}

interface ParsedJalaliDate { year: number; month: number; day: number }

function parseJalali(value: string | undefined): ParsedJalaliDate | undefined {
  const match = latinDigits(value ?? "").match(/(1[34]\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return { year, month, day };
}

function currentJalali(asOf: Date): ParsedJalaliDate {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tehran",
  }).formatToParts(asOf);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function compareDate(left: ParsedJalaliDate, right: ParsedJalaliDate) {
  return (left.year - right.year) || (left.month - right.month) || (left.day - right.day);
}

function licenseState(product: IranMarketDrugProduct, asOf: Date) {
  const status = normalized(product.licenseStatus);
  const validUntil = parseJalali(product.licenseValidUntilJalali);
  const today = currentJalali(asOf);
  const revoked = /revok|cancel|void|withdraw|لغو|باطل|ابطال/.test(status);
  const suspended = /suspend|تعلیق/.test(status);
  const expiredText = /expired|انقضا|منقض|پایان اعتبار/.test(status);
  const activeText = /active|valid|approved|معتبر|فعال|دارای اعتبار/.test(status);
  const currentByDate = validUntil ? compareDate(validUntil, today) >= 0 : false;
  const currentValid = !revoked && !suspended && !expiredText && (activeText || currentByDate);
  const everValid = currentValid || Boolean(validUntil) || revoked || suspended || expiredText || /license|licence|پروانه/.test(status);
  return {
    everValid,
    currentValid,
    revoked,
    validUntil: product.licenseValidUntilJalali,
    statusText: product.licenseStatus,
  };
}

function daysBetween(fromIso: string | undefined, to: Date) {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  const from = new Date(fromIso);
  if (!Number.isFinite(from.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}

function resolveMaster(product: IranMarketDrugProduct, registry: readonly MasterDrugRegistryEntry[]) {
  if (product.masterDrugId) {
    const direct = registry.find((entry) => entry.id === product.masterDrugId && entry.reviewState === "approved");
    if (direct) return { entry: direct, direct: true };
  }
  const productName = normalized(product.genericName);
  const exact = registry.find((entry) => entry.reviewState === "approved" && [entry.canonicalName, ...(entry.searchSynonyms ?? [])].some((name) => normalized(name) === productName));
  return exact ? { entry: exact, direct: false } : undefined;
}

function nfiMatchState(product: IranMarketDrugProduct, master: ReturnType<typeof resolveMaster>, threshold: number) {
  if (!master) return "unmatched" as const;
  if (master.direct) return "verified" as const;
  if ((product.matchConfidence ?? 0) >= threshold) return "verified" as const;
  return "review_required" as const;
}

function strengthPairs(value: string | undefined) {
  const text = latinDigits(value ?? "");
  const result: Array<{ amount: number; unit: string; denominatorMl?: number }> = [];
  const regex = /(\d+(?:[.,]\d+)?)\s*(mcg|µg|ug|mg|g|iu|u|unit|units)(?:\s*\/\s*(\d+(?:[.,]\d+)?)\s*(ml))?/gi;
  for (const match of text.matchAll(regex)) {
    let amount = Number(match[1]!.replace(",", "."));
    let unit = match[2]!.toUpperCase();
    if (unit === "MCG" || unit === "UG" || unit === "µG") unit = "mcg";
    else if (unit === "MG") unit = "mg";
    else if (unit === "G") unit = "g";
    else if (["IU", "U", "UNIT", "UNITS"].includes(unit)) unit = "U";
    const denominatorMl = match[3] ? Number(match[3].replace(",", ".")) : undefined;
    if (denominatorMl && denominatorMl > 0) amount /= denominatorMl;
    result.push({ amount, unit, denominatorMl });
  }
  return result;
}

function strengthComponents(product: IranMarketDrugProduct, master: MasterDrugRegistryEntry, registry: readonly MasterDrugRegistryEntry[]): StrengthComponentV2[] {
  const strengths = strengthPairs(product.strengthPresentation);
  if (!strengths.length) return [];
  const componentIds = resolveCombinationComponents(master, registry);
  const canonical = normalized(master.canonicalName);
  if (master.combination && componentIds?.length === 2 && strengths.length === 1 && strengths[0]!.unit === "U") {
    const total = strengths[0]!.amount;
    if (/human insulin 70 30/.test(canonical)) {
      return [
        { ingredientKey: componentIds[0]!, amount: total * 0.7, unit: "U" },
        { ingredientKey: componentIds[1]!, amount: total * 0.3, unit: "U" },
      ];
    }
    if (/insulin degludec.*insulin aspart/.test(canonical)) {
      return [
        { ingredientKey: componentIds[0]!, amount: total * 0.7, unit: "U" },
        { ingredientKey: componentIds[1]!, amount: total * 0.3, unit: "U" },
      ];
    }
  }
  if (master.combination && componentIds?.length === strengths.length) {
    return strengths.map((strength, index) => ({ ingredientKey: componentIds[index]!, amount: strength.amount, unit: strength.unit }));
  }
  if (!master.combination) return [{ ingredientKey: master.id, amount: strengths[0]!.amount, unit: strengths[0]!.unit }];
  return [];
}

function packageSizing(product: IranMarketDrugProduct, dosageFormGroup: string) {
  const text = latinDigits(product.packagePresentation ?? "");
  const normalizedText = normalized(text);
  if (["tablet", "extended_release_tablet", "capsule"].includes(dosageFormGroup)) {
    const unitPattern = dosageFormGroup === "capsule" ? /(?:^|\D)(\d+)\s*(?:capsules?|caps?|کپسول)/i : /(?:^|\D)(\d+)\s*(?:tablets?|tabs?|قرص)/i;
    const match = text.match(unitPattern);
    return {
      consumptionUnit: dosageFormGroup === "capsule" ? "capsule" : "tablet",
      unitsPerPurchase: match ? Number(match[1]) : 0,
      purchaseUnitLabel: product.packagePresentation || "package",
    };
  }
  if (["syrup", "oral_solution", "oral_suspension"].includes(dosageFormGroup)) {
    const volume = text.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
    return {
      consumptionUnit: "mL",
      unitsPerPurchase: volume ? Number(volume[1]!.replace(",", ".")) : 0,
      purchaseUnitLabel: product.packagePresentation || "bottle",
    };
  }
  if (dosageFormGroup.startsWith("injection" ) || dosageFormGroup === "prefilled_syringe") {
    const xVolume = text.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*ml/i);
    const containerMatch = text.match(/(\d+)\s*(?:pens?|vials?|ampoules?|ampules?|syringes?|قلم|ویال|آمپول|سرنگ)/i);
    const volumeMatch = text.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
    const containers = xVolume ? Number(xVolume[1]) : containerMatch ? Number(containerMatch[1]) : 1;
    const perContainer = xVolume ? Number(xVolume[2]!.replace(",", ".")) : volumeMatch ? Number(volumeMatch[1]!.replace(",", ".")) : undefined;
    return {
      consumptionUnit: "mL",
      unitsPerPurchase: perContainer ? containers * perContainer : 0,
      purchaseUnitLabel: product.packagePresentation || "package",
      containerLabel: /pen|قلم/i.test(normalizedText) ? "pen" : /vial|ویال/i.test(normalizedText) ? "vial" : undefined,
      unitsPerContainer: perContainer,
      containersPerPurchase: perContainer ? containers : undefined,
    };
  }
  return { consumptionUnit: "unit", unitsPerPurchase: 0, purchaseUnitLabel: product.packagePresentation || "package" };
}

function mapMarketProduct(
  product: IranMarketDrugProduct,
  registry: readonly MasterDrugRegistryEntry[],
  policy: InventoryAdapterPolicyV2,
  issues: InventoryBuildIssueV2[],
): IranMarketProductV2 {
  const resolved = resolveMaster(product, registry);
  const master = resolved?.entry;
  const dosageFormGroup = normalizeDosageFormGroup(product.dosageForm);
  const sizing = packageSizing(product, dosageFormGroup);
  const matchState = nfiMatchState(product, resolved, policy.verifiedMatchConfidenceAtOrAbove);
  const license = licenseState(product, policy.asOf);
  const recent = daysBetween(product.observedAt, policy.asOf) <= policy.recentObservationMaxAgeDays;
  const components = master ? strengthComponents(product, master, registry) : [];

  if (matchState !== "verified") issues.push({
    severity: matchState === "unmatched" ? "blocking" : "warning",
    code: matchState === "unmatched" ? "NFI_MASTER_UNMATCHED" : "NFI_MATCH_REVIEW_REQUIRED",
    entityId: product.id,
    message: `${product.genericName}: WorldDrug ↔ NFI identity is ${matchState}.`,
  });
  if (master?.combination && !components.length) issues.push({ severity: "blocking", code: "FDC_STRENGTH_COMPONENTS_UNRESOLVED", entityId: product.id, message: `${product.genericName}: combination strength could not be assigned to exact component master IDs.` });
  if (sizing.unitsPerPurchase <= 0) issues.push({ severity: "warning", code: "PACKAGE_SIZE_UNRESOLVED", entityId: product.id, message: `${product.genericName}: package quantity is not normalized; monthly cost will remain unavailable.` });
  if (!components.length) issues.push({ severity: "warning", code: "STRENGTH_UNRESOLVED", entityId: product.id, message: `${product.genericName}: strength presentation is not normalized; exact dose-to-product cost matching will remain unavailable.` });

  return {
    productId: product.id,
    masterDrugId: master?.id,
    nfiMatchState: matchState,
    genericName: product.genericName,
    brandName: product.brandName,
    manufacturerName: product.manufacturerName ?? product.brandOwnerName,
    genericRegistryCode: product.genericRegistryCode,
    brandRegistryCode: product.brandRegistryCode,
    ircCode: product.ircCode,
    dosageFormGroup,
    route: inferRoute(product.route, dosageFormGroup),
    consumptionUnit: sizing.consumptionUnit,
    strengthComponents: components,
    consumptionUnitsPerPurchaseUnit: sizing.unitsPerPurchase,
    purchaseUnitLabel: sizing.purchaseUnitLabel,
    containerLabel: sizing.containerLabel,
    consumptionUnitsPerContainer: sizing.unitsPerContainer,
    containersPerPurchaseUnit: sizing.containersPerPurchase,
    priceToman: product.price?.amountToman,
    priceObservedAt: product.price?.effectiveAt ?? product.observedAt,
    license,
    marketPresence: license.currentValid && recent ? "recently_observed" : license.currentValid ? "unknown" : "unknown",
    sourceUrl: product.sourceUrl,
    sourceReference: product.sourceReference,
    observedAt: product.observedAt,
  };
}

function inferRouteOptions(masterId: string, products: readonly IranMarketProductV2[], therapyGroup: string) {
  const routes = unique(products.filter((product) => product.masterDrugId === masterId).map((product) => product.route).filter(Boolean));
  if (routes.length) return routes;
  if (/insulin|glp|fixed_ratio/.test(therapyGroup)) return ["subcutaneous"];
  if (/biguanide|sglt2|dpp4|sulfonyl|thiazolidinedione|alpha_glucosidase|raas|lipid|antiplatelet|anticoagulant|antihypertensive|liver_directed/.test(therapyGroup)) return ["oral"];
  return ["other"];
}

function knowledgeEntry(
  entry: MasterDrugRegistryEntry,
  registry: readonly MasterDrugRegistryEntry[],
  products: readonly IranMarketProductV2[],
  issues: InventoryBuildIssueV2[],
): KnowledgeMedicationV2 {
  const therapyGroup = inferTherapyGroup(entry);
  const lanes = primaryLanes(entry);
  const efficacy = inferEfficacyBand(entry);
  const components = resolveCombinationComponents(entry, registry);
  const evidence = evidenceFromMaster(entry);
  let engineState: KnowledgeMedicationV2["engineState"] = "approved";
  if (!evidence.length || !lanes.length) engineState = "review_required";
  if (entry.combination && !components?.length) {
    engineState = "review_required";
    issues.push({ severity: "blocking", code: "FDC_COMPONENT_IDS_UNRESOLVED", entityId: entry.id, message: `${entry.canonicalName}: fixed-dose combination components are not resolved to individual WorldDrug IDs.` });
  }
  if (lanes.includes("glycemic") && efficacy === "none") {
    engineState = "review_required";
    issues.push({ severity: "blocking", code: "GLYCEMIC_EFFICACY_UNSTRUCTURED", entityId: entry.id, message: `${entry.canonicalName}: glycemic efficacy band is not explicit enough for executable Decision Graph selection.` });
  }
  return {
    masterDrugId: entry.id,
    genericName: entry.canonicalName,
    persianName: entry.persianName,
    combination: entry.combination,
    componentMasterDrugIds: components,
    therapeuticAreas: entry.therapeuticAreas,
    therapyGroup,
    drugClass: entry.drugClass,
    primaryLanes: lanes,
    routeOptions: inferRouteOptions(entry.id, products, therapyGroup),
    dosageFormGroups: unique(products.filter((product) => product.masterDrugId === entry.id).map((product) => product.dosageFormGroup)),
    efficacyBand: efficacy,
    hypoglycemiaRisk: inferHypoglycemiaRisk(entry),
    weightDirection: inferWeightDirection(entry),
    effects: mapEffects(entry),
    tags: unique([therapyGroup, entry.drugClass ?? "", ...entry.therapeuticAreas].filter(Boolean)),
    evidence,
    engineState,
  };
}

function insurancePoliciesFromCoverage(product: IranMarketProductV2, coverages: readonly InsuranceCoverage[]): InsurancePolicyRuleV2[] {
  return coverages.map((coverage, index) => ({
    id: `imported:${product.productId}:${coverage.provider}:${index}`,
    provider: coverage.provider,
    productId: product.productId,
    masterDrugId: product.masterDrugId,
    coveragePercent: Number.isFinite(coverage.percent) ? coverage.percent : undefined,
    referencePriceTomanPerPurchaseUnit: coverage.referencePriceToman,
    patientShareTomanPerPurchaseUnit: coverage.patientShareToman,
    insurerShareTomanPerPurchaseUnit: coverage.insurerShareToman,
    effectiveAt: coverage.effectiveAt,
    sourceUrl: coverage.sourceUrl,
    sourceReference: coverage.sourceReference,
  }));
}

export function buildDecisionGraphInventoryFromContractsV2(
  input: BuildDecisionGraphInventoryV2Input,
): BuildDecisionGraphInventoryV2Result {
  const policy: InventoryAdapterPolicyV2 = { ...defaultInventoryAdapterPolicyV2, ...(input.policy ?? {}) };
  const approved = input.masterRegistry.filter((entry) => entry.reviewState === "approved");
  const issues: InventoryBuildIssueV2[] = [];
  const products = input.marketProducts.map((product) => mapMarketProduct(product, approved, policy, issues));
  const knowledge = approved.map((entry) => knowledgeEntry(entry, approved, products, issues));
  const importedPolicies = input.marketProducts.flatMap((raw) => {
    const mapped = products.find((product) => product.productId === raw.id)!;
    return insurancePoliciesFromCoverage(mapped, raw.insuranceCoverages ?? []);
  });
  const insurancePolicies = [...importedPolicies, ...(input.insurancePolicies ?? [])];

  const baseInventory: DecisionGraphInventoryV2 = {
    knowledge,
    marketProducts: products,
    doseRules: [...(input.doseRules ?? [])],
    insurancePolicies,
    medicationGateRules: [...(input.medicationGateRules ?? [])],
    regimenConflictRules: [...(input.regimenConflictRules ?? [])],
    regimenTemplates: [...(input.regimenTemplates ?? [])],
    frcProtocolBindings: [...(input.frcProtocolBindings ?? [])],
    insulinConversionRules: [...(input.insulinConversionRules ?? [])],
    titrationProtocols: [...(input.titrationProtocols ?? [])],
  };
  const core = applyCoreClinicalRulesToInventoryV2(baseInventory);

  const finalApprovedKnowledgeIds = new Set(core.inventory.knowledge.filter((item) => item.engineState === "approved").map((item) => item.masterDrugId));
  const reconciledIssues = issues.filter((issue) => !(
    issue.code === "GLYCEMIC_EFFICACY_UNSTRUCTURED" && issue.entityId && finalApprovedKnowledgeIds.has(issue.entityId)
  ));

  const report: InventoryBuildReportV2 = {
    approvedWorldDrugEntries: approved.length,
    knowledgeEntries: core.inventory.knowledge.length,
    engineApprovedKnowledgeEntries: core.inventory.knowledge.filter((item) => item.engineState === "approved").length,
    inputMarketProducts: input.marketProducts.length,
    mappedMarketProducts: products.filter((item) => Boolean(item.masterDrugId)).length,
    verifiedMarketProducts: products.filter((item) => item.nfiMatchState === "verified").length,
    reviewRequiredMarketProducts: products.filter((item) => item.nfiMatchState === "review_required").length,
    unmatchedMarketProducts: products.filter((item) => item.nfiMatchState === "unmatched").length,
    generatedInsurancePolicies: importedPolicies.length,
    normalizedKnowledgeEntries: core.report.knowledgeNormalization.normalized,
    coreInsulinDoseRules: core.report.addedInsulinDoseRules,
    coreMedicationGateRules: core.report.addedMedicationGateRules,
    coreRegimenConflictRules: core.report.addedRegimenConflictRules,
    coreProductDoseRules: core.report.addedProductDoseRules,
    coreFrcDoseRules: core.report.addedFrcDoseRules,
    autoFrcProtocolBindings: core.report.autoFrcBindings,
    coreInsulinConversionRules: core.report.insulinConversionRules,
    coreTitrationProtocols: core.report.titrationProtocols,
    issues: [
      ...reconciledIssues,
      ...core.report.frcBindingIssues.map((issue) => ({ severity: "warning" as const, code: issue.code, entityId: issue.productId, message: issue.message })),
    ],
  };

  return { inventory: core.inventory, report };
}
