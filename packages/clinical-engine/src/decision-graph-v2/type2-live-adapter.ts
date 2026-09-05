/**
 * Phase 3 / Task 2 — live Type 2 convergence adapter.
 *
 * Bridges the live `/type-2` request/catalogue contract (`Type2ConsiderationRequest`
 * + `GenericMedication[]` from `@glymize/contracts`) onto the validated
 * decision-graph-v2 engine, and maps the graph result back onto the stable
 * `Type2AssessmentResult` response contract. No clinical content is invented
 * here: knowledge comes from the published master registry through
 * `buildDecisionGraphInventoryV2`, and thresholds live in the approved policy.
 */
import type {
  GenericMedication,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2MedicationConsideration,
  Type2PathwayPriority,
} from "@glymize/contracts";
import { buildDecisionGraphInventoryFromContractsV2 } from "./inventory-adapter.js";
import { runDecisionGraphV2 } from "./engine.js";
import { defaultDecisionGraphPolicyV2 } from "./policy.js";
import type {
  ComposedTherapyComponentV2,
  CostPreferenceV2,
  DecisionGraphRequestV2,
  DecisionGraphResultV2,
  RoutePreferenceV2,
} from "./types.js";

export const TYPE2_LIVE_ENGINE = {
  id: "decision-graph-v2",
  get name() {
    return defaultDecisionGraphPolicyV2.engine.name;
  },
  get version() {
    return defaultDecisionGraphPolicyV2.engine.version;
  },
} as const;

export interface BuildType2GraphAssessmentInput {
  request: Type2ConsiderationRequest;
  medications: readonly GenericMedication[];
  masterRegistry: readonly MasterDrugRegistryEntry[];
  marketProducts: readonly IranMarketDrugProduct[];
  asOf?: Date;
}

function mapCostPreference(value: Type2ConsiderationRequest["costPreference"]): CostPreferenceV2 {
  if (value === "low_cost_only") return "low_cost";
  if (value === "insured_only") return "insured_only";
  if (value === "moderate") return "moderate";
  return "no_constraint";
}

function mapRoutePreference(value: Type2ConsiderationRequest["routePreference"]): RoutePreferenceV2 {
  return value === "oral_only" ? "oral_only" : "oral_or_injectable";
}

export interface BuildType2DecisionGraphRequestArgs {
  request: Type2ConsiderationRequest;
  masterRegistry: readonly MasterDrugRegistryEntry[];
  marketProducts: readonly IranMarketDrugProduct[];
  asOf?: Date;
}

/** Maps the live live-route request onto the decision-graph-v2 request contract. */
export function buildType2DecisionGraphRequest(
  args: BuildType2DecisionGraphRequestArgs,
): DecisionGraphRequestV2 {
  const { request, masterRegistry, marketProducts } = args;
  const factors = new Set(request.factors);
  const context = request.clinicalContext;
  const { inventory } = buildDecisionGraphInventoryFromContractsV2({
    masterRegistry,
    marketProducts,
    policy: { asOf: args.asOf ?? new Date() },
  });

  return {
    patient: {
      ageYears: context?.ageYears,
      sexAtBirth: context?.sexAtBirth,
      pregnancy: context?.pregnancy === true || factors.has("pregnancy") ? true : undefined,
      glycemia: {
        currentHba1c: request.currentHba1c,
        targetHba1c: request.targetHba1c,
        hyperglycemiaSymptoms: request.hyperglycemiaSymptoms,
        catabolicFeatures: request.catabolicFeatures,
      },
      anthropometrics: context?.anthropometrics,
      kidney: request.eGfr !== undefined || context?.kidney || factors.has("ckd")
        ? {
            ckd: context?.kidney?.ckd ?? factors.has("ckd") ? true : undefined,
            eGfr: request.eGfr ?? context?.kidney?.eGfr,
            uacrMgG: context?.kidney?.uacrMgG,
            potassiumMmolL: context?.kidney?.potassiumMmolL,
            dialysis: context?.kidney?.dialysis,
            kidneyTransplant: context?.kidney?.kidneyTransplant,
            recentAki: context?.kidney?.recentAki,
          }
        : undefined,
      cardiovascular: context?.cardiovascular || factors.has("ascvd") || factors.has("heart_failure")
        ? {
            ascvd: context?.cardiovascular?.ascvd ?? factors.has("ascvd") ? true : undefined,
            heartFailure: context?.cardiovascular?.heartFailure ?? factors.has("heart_failure") ? true : undefined,
            lvefPercent: context?.cardiovascular?.lvefPercent,
            nyhaClass: context?.cardiovascular?.nyhaClass,
            systolicBloodPressure: context?.cardiovascular?.systolicBloodPressure,
            diastolicBloodPressure: context?.cardiovascular?.diastolicBloodPressure,
          }
        : undefined,
      liver: context?.liver || factors.has("masld_mash")
        ? {
            masldMash: context?.liver?.masldMash ?? factors.has("masld_mash") ? true : undefined,
            fibrosisStage: context?.liver?.fibrosisStage,
            cirrhosis: context?.liver?.cirrhosis,
            decompensatedCirrhosis: context?.liver?.decompensatedCirrhosis,
          }
        : undefined,
      hypoglycemiaRisk: factors.has("hypoglycemia_risk") ? "high" : "standard",
      currentMedications: request.currentMedications?.map((medication) => ({
        genericName: medication.genericName,
        route: medication.route,
        dosageFormGroup: medication.dosageForm,
        administrationsPerDay: medication.frequencyPerDay,
        status: medication.status,
        adherence: medication.adherence,
        tolerance: medication.tolerance,
      })),
    },
    preferences: {
      routePreference: mapRoutePreference(request.routePreference),
      costPreference: mapCostPreference(request.costPreference),
    },
    inventory,
  };
}

function mapPathwayPriority(pathway: DecisionGraphResultV2["clinicalState"]["pathway"]): Type2PathwayPriority {
  if (pathway === "high_efficacy_combination") return "combination_therapy";
  if (pathway === "insulin_centered") return "consider_insulin";
  if (pathway === "maintain_and_monitor") return "maintain_and_monitor";
  return "single_or_stepwise_therapy";
}

const PATHWAY_TITLES: Record<Type2PathwayPriority, string> = {
  maintain_and_monitor: "هدف فعلی حفظ شده است؛ پایش و بازبینی ادامه یابد",
  single_or_stepwise_therapy: "درمان مرحله‌ای فردمحور را انتخاب کنید",
  combination_therapy: "درمان ترکیبی را برای شکاف HbA1c بزرگ‌تر بررسی کنید",
  glp1_based_therapy: "درمان ترکیبی با اولویت GLP-1 یا GIP/GLP-1 را بررسی کنید",
  consider_insulin: "مسیر انسولین را با دقت بالینی بررسی کنید",
};

function normalizedKey(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function matchedMedication(
  masterDrugId: string,
  genericName: string,
  medications: readonly GenericMedication[],
): GenericMedication | undefined {
  const byMasterId = medications.find((medication) =>
    (medication as Partial<{ masterRegistryId: string }>).masterRegistryId === masterDrugId);
  if (byMasterId) return byMasterId;
  const key = normalizedKey(genericName);
  return medications.find((medication) =>
    normalizedKey(medication.canonicalName) === key ||
    normalizedKey(medication.persianName) === key);
}

export interface MapDecisionGraphResultArgs {
  result: DecisionGraphResultV2;
  medications: readonly GenericMedication[];
  request: Type2ConsiderationRequest;
}

/** Maps the validated graph output onto the stable live-route response contract. */
export function mapDecisionGraphResultToType2Assessment(
  args: MapDecisionGraphResultArgs,
): Type2AssessmentResult {
  const { result, medications, request } = args;
  const priority = mapPathwayPriority(result.clinicalState.pathway);
  const rationale = [...result.clinicalState.reasons];
  const blockingMissing = result.missingData.filter((item) => item.blocksFinalDecision);
  if (blockingMissing.length) {
    rationale.push(`اطلاعات بالینی بیشتری برای تصمیم نهایی لازم است: ${blockingMissing.map((item) => item.reason).join(" | ")}`);
  }
  rationale.push("انتخاب گزینه‌ها با گیت‌های سخت، اهداف الزامی، برش پارتو و ترتیب واژه‌نگار انجام شد؛ بدون امتیاز تجمیعی [GLYMIZE Decision Graph v2].");

  const pharmacologicEvidence = defaultDecisionGraphPolicyV2.evidence.pharmacologic;
  const plan = result.treatmentPlan;
  const currentTherapyKeys = new Set(
    (plan?.currentTherapyReview ?? [])
      .filter((entry) => entry.disposition === "continue_in_plan" || entry.disposition === "continue_pending_standard_review")
      .map((entry) => normalizedKey(entry.genericName)),
  );
  const considerations: Type2MedicationConsideration[] = [];
  const usedKeys = new Set<string>();

  const pushComponents = (
    candidate: DecisionGraphResultV2["primary"],
    tier: Type2MedicationConsideration["priorityTier"],
    baseScore: number,
    components: readonly ComposedTherapyComponentV2[],
  ) => {
    if (!candidate) return;
    const candidateCautions = [...candidate.cautions, ...(tier === "recommended" ? plan?.cautions ?? [] : [])];
    for (const [componentIndex, component] of components.entries()) {
      const medication = matchedMedication(component.masterDrugId, component.genericName, medications);
      const key = medication?.id ?? component.masterDrugId;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      const isCurrent = currentTherapyKeys.has(normalizedKey(component.genericName)) ||
        (request.currentMedications ?? []).some((entry) => normalizedKey(entry.genericName) === normalizedKey(component.genericName));
      const texts = [...component.reasons, ...(tier === "recommended" ? plan?.reasons ?? [] : [])];
      const dosePlan = component.dosePlan;
      if (dosePlan) {
        texts.push(`دوز شروع پیشنهادی: ${dosePlan.displayStartDose}`);
        if (dosePlan.titrationText) texts.push(`تیتراسیون: ${dosePlan.titrationText}`);
        if (dosePlan.targetDoseText) texts.push(`دوز هدف: ${dosePlan.targetDoseText}`);
        if (dosePlan.monitoring.length) texts.push(`پایش: ${dosePlan.monitoring.join("؛ ")}`);
      }
      considerations.push({
        genericMedicationId: medication?.id ?? component.masterDrugId,
        genericName: component.genericName,
        persianName: component.persianName ?? medication?.persianName ?? component.genericName,
        therapeuticClass: medication?.className ?? "",
        therapyGroup: medication?.therapyGroup ?? (component.therapyGroup as Type2MedicationConsideration["therapyGroup"]),
        sourceUrl: pharmacologicEvidence.url,
        sourceReference: pharmacologicEvidence.locator ?? pharmacologicEvidence.title,
        considerations: [...new Set(texts)],
        cautions: [...new Set(candidateCautions)],
        priorityScore: Math.max(baseScore - componentIndex, 5),
        priorityTier: tier,
        relativeCost: "medium",
        rankingReasons: candidate.whySelected ?? candidate.reasons,
        risks: candidate.cautions,
        insuranceCoverages: [],
        therapyAction: isCurrent
          ? "review_current_therapy"
          : request.workflow === "initiation"
            ? "consider_initiation"
            : "consider_addition",
        currentMedication: isCurrent || undefined,
        outputStatus: dosePlan ? "requires_approved_protocol" : "information_only",
      });
    }
  };

  if (plan && result.primary) pushComponents(result.primary, "recommended", 100, plan.components);
  for (const [index, alternative] of result.alternatives.entries()) {
    pushComponents(alternative, "preferred", 60 - index * 10, alternative.components);
  }
  for (const excluded of result.excluded) {
    const component = excluded.components[0];
    if (!component) continue;
    const medication = matchedMedication(component.masterDrugId, component.genericName, medications);
    const key = medication?.id ?? component.masterDrugId;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    considerations.push({
      genericMedicationId: medication?.id ?? component.masterDrugId,
      genericName: component.genericName,
      persianName: component.persianName ?? medication?.persianName ?? component.genericName,
      therapeuticClass: medication?.className ?? "",
      therapyGroup: medication?.therapyGroup ?? (component.therapyGroup as Type2MedicationConsideration["therapyGroup"]),
      sourceUrl: pharmacologicEvidence.url,
      sourceReference: pharmacologicEvidence.locator ?? pharmacologicEvidence.title,
      considerations: [...excluded.reasons],
      cautions: [],
      blockedBy: [...excluded.gate.reasons],
      priorityScore: 5,
      priorityTier: "consider",
      relativeCost: "medium",
      rankingReasons: excluded.reasons,
      risks: [],
      insuranceCoverages: [],
      outputStatus: "information_only",
    });
  }

  return {
    recommendation: {
      priority,
      title: PATHWAY_TITLES[priority],
      rationale,
      hba1cGap: result.clinicalState.hba1cGap,
      urgentReview: result.status === "urgent_clinician_review" || result.clinicalState.severeHyperglycemia,
      sourceUrl: defaultDecisionGraphPolicyV2.evidence.glycemicGoals.url,
      sourceReference: defaultDecisionGraphPolicyV2.evidence.glycemicGoals.locator ?? defaultDecisionGraphPolicyV2.evidence.glycemicGoals.title,
    },
    medications: considerations,
  };
}

export function buildType2AssessmentFromDecisionGraph(
  input: BuildType2GraphAssessmentInput,
): Type2AssessmentResult {
  const graphRequest = buildType2DecisionGraphRequest({
    request: input.request,
    masterRegistry: input.masterRegistry,
    marketProducts: input.marketProducts,
    asOf: input.asOf,
  });
  const result = runDecisionGraphV2(graphRequest);
  return mapDecisionGraphResultToType2Assessment({
    result,
    medications: input.medications,
    request: input.request,
  });
}
