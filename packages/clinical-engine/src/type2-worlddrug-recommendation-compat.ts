import type {
  GenericMedication,
  MedicationClinicalDomain,
  MedicationPriceRange,
  MedicationTherapyGroup,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2MedicationConsideration,
} from "@glymize/contracts";
import { assessIranAvailabilityV2 } from "./decision-graph-v2/availability.js";
import { buildDecisionGraphInventoryFromContractsV2 } from "./decision-graph-v2/inventory-adapter.js";
import {
  buildType2AssessmentFromDecisionGraphV2,
  type BuildType2DecisionGraphAssessmentInput,
} from "./type2-decision-graph-compat.js";
import { legacyType2HardExclusionReasons } from "./type2-hard-exclusion-compat.js";

export const WORLD_DRUG_CONTEXT_REVIEW_V1 = "GLYMIZE_WORLD_DRUG_CONTEXT_REVIEW_V1";

type MultidomainRequest = Type2ConsiderationRequest & {
  /**
   * Forward-compatible escape hatch for clinical domains not yet represented by
   * dedicated Type2DecisionFactor controls. The UI/patient-record layer can add
   * these explicitly without changing Decision Graph authority.
   */
  activeClinicalDomains?: MedicationClinicalDomain[];
  /**
   * Exact/near-exact WorldDrug therapeutic-area labels supplied by a reviewed
   * patient problem-list adapter. Used only for information-only catalogue
   * projection; it never creates an executable treatment objective.
   */
  activeTherapeuticAreas?: string[];
};

export interface Type2WorldDrugCoverageMetadata {
  activeDomains: MedicationClinicalDomain[];
  activeTherapeuticAreas: string[];
  approvedWorldDrugEntries: number;
  currentIranMarketEntries: number;
  projectedReviewOptions: number;
}

export type Type2AssessmentWithWorldDrugCoverage = Type2AssessmentResult & {
  worldDrugCoverage: Type2WorldDrugCoverageMetadata;
};

function normalized(value: string | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/[^a-z0-9آ-ی]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function activeDomains(request: MultidomainRequest): Set<MedicationClinicalDomain> {
  const result = new Set<MedicationClinicalDomain>(["diabetes"]);
  for (const domain of request.activeClinicalDomains ?? []) result.add(domain);

  const factors = new Set<string>(request.factors);
  if (factors.has("ascvd") || request.clinicalContext?.cardiovascular?.ascvd) {
    result.add("cardiovascular");
    result.add("ascvd");
  }
  if (factors.has("heart_failure") || request.clinicalContext?.cardiovascular?.heartFailure) {
    result.add("cardiovascular");
    result.add("heart_failure");
  }
  if (factors.has("ckd") || request.clinicalContext?.kidney?.ckd || request.clinicalContext?.kidney?.dialysis) {
    result.add("kidney");
  }
  if (factors.has("masld_mash") || request.clinicalContext?.liver?.masldMash) {
    result.add("liver");
    result.add("masld_mash");
  }
  if (factors.has("diabetic_foot")) result.add("diabetic_foot");
  if (factors.has("weight_priority") || (request.clinicalContext?.anthropometrics?.bmi ?? 0) >= 30) result.add("obesity");
  if (factors.has("pregnancy") || request.clinicalContext?.pregnancy) result.add("pregnancy");

  return result;
}

function domainsForEntry(entry: BuildType2DecisionGraphAssessmentInput["masterRegistry"][number]) {
  const result = new Set<MedicationClinicalDomain>();
  for (const effect of entry.clinicalEffects) {
    if (effect.domain === "glycemic_control" || effect.domain === "hypoglycemia") result.add("diabetes");
    if (effect.domain === "ascvd") {
      result.add("ascvd");
      result.add("cardiovascular");
    }
    if (effect.domain === "heart_failure") {
      result.add("heart_failure");
      result.add("cardiovascular");
    }
    if (effect.domain === "ckd") result.add("kidney");
    if (effect.domain === "weight") result.add("obesity");
    if (effect.domain === "masld_mash") {
      result.add("masld_mash");
      result.add("liver");
    }
    if (effect.domain === "hypertension") result.add("hypertension");
    if (effect.domain === "lipids") result.add("lipids");
    if (effect.domain === "neuropathy") result.add("neuropathy");
    if (effect.domain === "retinopathy") result.add("retinopathy");
    if (effect.domain === "diabetic_foot") result.add("diabetic_foot");
  }

  const text = normalized([
    ...entry.therapeuticAreas,
    ...(entry.primaryIndications ?? []),
    entry.drugClass ?? "",
    entry.guidelineRole ?? "",
  ].join(" "));
  if (/diabetes|glyc|glucose|insulin|t2d|type 2/.test(text)) result.add("diabetes");
  if (/cardiovascular|coronary|cardiac/.test(text)) result.add("cardiovascular");
  if (/kidney|renal|ckd|albuminur/.test(text)) result.add("kidney");
  if (/liver|hepatic/.test(text)) result.add("liver");
  if (/obesity|weight management|weight loss/.test(text)) result.add("obesity");
  if (/hypertension|blood pressure/.test(text)) result.add("hypertension");
  if (/lipid|cholesterol|ldl|triglycer/.test(text)) result.add("lipids");
  if (/heart failure|hfref|hfpef|hfmr/.test(text)) result.add("heart_failure");
  if (/ascvd|atheroscler|stroke|peripheral artery/.test(text)) result.add("ascvd");
  if (/masld|mash/.test(text)) result.add("masld_mash");
  if (/neuropath/.test(text)) result.add("neuropathy");
  if (/retinopath|macular edema|macular oedema/.test(text)) result.add("retinopathy");
  if (/diabetic foot|foot ulcer|wound/.test(text)) result.add("diabetic_foot");
  if (/nutrition support|enteral|parenteral nutrition/.test(text)) result.add("nutrition_support");
  if (/pregnan|gestational/.test(text)) result.add("pregnancy");
  return result;
}

function matchesExplicitArea(
  entry: BuildType2DecisionGraphAssessmentInput["masterRegistry"][number],
  activeAreas: readonly string[],
) {
  if (!activeAreas.length) return false;
  const entryAreas = [
    ...entry.therapeuticAreas,
    ...(entry.primaryIndications ?? []),
  ].map(normalized).filter(Boolean);
  return activeAreas.some((area) => {
    const target = normalized(area);
    if (!target) return false;
    return entryAreas.some((candidate) => candidate === target || candidate.includes(target) || target.includes(candidate));
  });
}

function isRelevantEntry(
  entry: BuildType2DecisionGraphAssessmentInput["masterRegistry"][number],
  active: ReadonlySet<MedicationClinicalDomain>,
  activeAreas: readonly string[],
) {
  if ([...domainsForEntry(entry)].some((domain) => active.has(domain))) return true;
  return matchesExplicitArea(entry, activeAreas);
}

function contractTherapyGroup(value: string, fallback?: MedicationTherapyGroup): MedicationTherapyGroup {
  if (fallback) return fallback;
  const direct = new Set<MedicationTherapyGroup>([
    "glp_1_receptor_agonist",
    "dual_gip_glp_1_receptor_agonist",
    "human_insulin",
    "basal_insulin_analog",
    "prandial_insulin_analog",
    "premixed_insulin",
    "fixed_ratio_combination",
    "antihypertensive",
    "raas_blocker",
    "mineralocorticoid_receptor_antagonist",
    "heart_failure_therapy",
    "lipid_lowering",
    "antiplatelet",
    "anticoagulant",
    "liver_directed_therapy",
    "weight_management",
    "vitamin_or_mineral",
    "other",
  ]);
  if (direct.has(value as MedicationTherapyGroup)) return value as MedicationTherapyGroup;
  if (["biguanide", "sglt2_inhibitor", "dpp4_inhibitor", "sulfonylurea", "thiazolidinedione", "alpha_glucosidase_inhibitor", "fixed_dose_combination", "oral_glucose_lowering"].includes(value)) {
    return "oral_glucose_lowering";
  }
  return "other";
}

function medicationForEntry(
  entry: BuildType2DecisionGraphAssessmentInput["masterRegistry"][number],
  medications: readonly GenericMedication[],
) {
  return medications.find((item) => item.masterRegistryId === entry.id) ??
    medications.find((item) => normalized(item.canonicalName) === normalized(entry.canonicalName));
}

function priceRangeForCurrentProducts(
  productIds: readonly string[],
  inventory: ReturnType<typeof buildDecisionGraphInventoryFromContractsV2>["inventory"],
): MedicationPriceRange | undefined {
  const prices = inventory.marketProducts
    .filter((product) => productIds.includes(product.productId) && typeof product.priceToman === "number" && product.priceToman > 0)
    .map((product) => product.priceToman!)
    .sort((a, b) => a - b);
  if (!prices.length) return undefined;
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2
    ? prices[middle]!
    : Math.round((prices[middle - 1]! + prices[middle]!) / 2);
  return {
    minToman: prices[0]!,
    medianToman: median,
    maxToman: prices[prices.length - 1]!,
    productCount: prices.length,
    basis: "nfi_generic_market_range",
    costComparable: false,
    presentationCount: productIds.length,
  };
}

function projectedReviewOptions(
  input: BuildType2DecisionGraphAssessmentInput,
  base: Type2AssessmentResult,
): Type2MedicationConsideration[] {
  const request = input.request as MultidomainRequest;
  const active = activeDomains(request);
  const activeAreas = request.activeTherapeuticAreas ?? [];
  const approvedEntries = input.masterRegistry.filter((entry) => entry.reviewState === "approved");
  const { inventory } = buildDecisionGraphInventoryFromContractsV2({
    masterRegistry: approvedEntries,
    marketProducts: input.marketProducts,
  });
  const selectedNames = new Set(base.medications.map((item) => normalized(item.genericName)));
  const anyCurrentMedication = (request.currentMedications ?? []).some((item) => (item.status ?? "active") === "active");

  return approvedEntries.flatMap((entry): Type2MedicationConsideration[] => {
    if (selectedNames.has(normalized(entry.canonicalName))) return [];
    if (!isRelevantEntry(entry, active, activeAreas)) return [];
    const knowledge = inventory.knowledge.find((item) => item.masterDrugId === entry.id);
    if (!knowledge) return [];
    const availability = assessIranAvailabilityV2(knowledge, inventory.marketProducts);
    if (!availability.mainRecommendationEligible) return [];

    const generic = medicationForEntry(entry, input.medications);
    const safetyProbe: GenericMedication = generic ?? {
      id: `master-${entry.id.toLocaleLowerCase()}`,
      canonicalName: entry.canonicalName,
      persianName: entry.persianName ?? entry.canonicalName,
      className: entry.drugClass,
      therapyGroup: contractTherapyGroup(knowledge.therapyGroup),
      catalogStatus: "admin_added",
      clinicalEngineEnabled: false,
      masterRegistryId: entry.id,
    };
    const hardExclusions = legacyType2HardExclusionReasons(safetyProbe, request);
    if (hardExclusions.length) return [];

    const currentMedication = (request.currentMedications ?? []).some((item) =>
      (item.status ?? "active") === "active" && (
        item.genericMedicationId === generic?.id ||
        normalized(item.genericName) === normalized(entry.canonicalName)
      ),
    );
    const matchedDomains = [...domainsForEntry(entry)].filter((domain) => active.has(domain));
    const reasons = [
      `${WORLD_DRUG_CONTEXT_REVIEW_V1}: approved WorldDrug entry matches active patient domain(s): ${matchedDomains.join(", ") || "explicit therapeutic area"}.`,
      "Iran market eligibility is current and verified through the existing NFI-backed inventory adapter.",
    ];
    const cautions = [
      "این گزینه از WorldDrug برای بازبینی بالینی نمایش داده می‌شود؛ تا زمانی که Rule/Protocol اختصاصی و approved آن مسیر را executable نکند، پیشنهاد نسخه اجرایی محسوب نمی‌شود.",
    ];
    if (knowledge.engineState !== "approved") {
      cautions.push(`Decision Graph knowledge state=${knowledge.engineState}; ساخت Rule اختصاصی پیش از اجرای درمان الزامی است.`);
    }

    return [{
      genericMedicationId: generic?.id ?? safetyProbe.id,
      genericName: generic?.canonicalName ?? entry.canonicalName,
      persianName: generic?.persianName ?? entry.persianName ?? entry.canonicalName,
      therapeuticClass: generic?.className ?? entry.drugClass ?? knowledge.therapyGroup,
      therapyGroup: contractTherapyGroup(knowledge.therapyGroup, generic?.therapyGroup),
      sourceUrl: entry.sourceUrls[0] ?? "about:blank",
      sourceReference: `${WORLD_DRUG_CONTEXT_REVIEW_V1}${entry.sourceCodes.length ? ` · ${entry.sourceCodes.join(" · ")}` : ""}`,
      considerations: reasons,
      cautions,
      priorityScore: 0,
      priorityTier: "consider",
      relativeCost: "medium",
      rankingReasons: reasons,
      risks: cautions,
      insuranceCoverages: generic ? request.insuranceCoverageByMedicationId?.[generic.id] ?? [] : [],
      therapyAction: currentMedication
        ? "review_current_therapy"
        : anyCurrentMedication
          ? "consider_addition"
          : "consider_initiation",
      currentMedication,
      priceRange: priceRangeForCurrentProducts(availability.currentProductIds, inventory),
      outputStatus: "requires_approved_protocol",
    }];
  }).sort((left, right) => left.genericName.localeCompare(right.genericName, "en-US"));
}

export function buildType2AssessmentWithWorldDrugCoverageV2(
  input: BuildType2DecisionGraphAssessmentInput,
): Type2AssessmentWithWorldDrugCoverage {
  const base = buildType2AssessmentFromDecisionGraphV2(input);
  const options = projectedReviewOptions(input, base);
  const request = input.request as MultidomainRequest;
  const active = activeDomains(request);
  const approvedEntries = input.masterRegistry.filter((entry) => entry.reviewState === "approved");
  const currentMarketEntryIds = new Set(input.marketProducts
    .filter((product) => product.masterDrugId)
    .map((product) => product.masterDrugId!));

  return {
    ...base,
    medications: [...base.medications, ...options],
    worldDrugCoverage: {
      activeDomains: [...active],
      activeTherapeuticAreas: [...(request.activeTherapeuticAreas ?? [])],
      approvedWorldDrugEntries: approvedEntries.length,
      currentIranMarketEntries: approvedEntries.filter((entry) => currentMarketEntryIds.has(entry.id)).length,
      projectedReviewOptions: options.length,
    },
  };
}
