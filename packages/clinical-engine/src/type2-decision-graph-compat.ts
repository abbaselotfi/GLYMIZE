import type {
  GenericMedication,
  IranMarketDrugProduct,
  MasterDrugRegistryEntry,
  MedicationTherapyGroup,
  Type2AssessmentResult,
  Type2ConsiderationRequest,
  Type2MedicationConsideration,
  Type2PathwayPriority,
} from "@glymize/contracts";
import { runDecisionGraphV2 } from "./decision-graph-v2/engine.js";
import { buildDecisionGraphInventoryFromContractsV2 } from "./decision-graph-v2/inventory-adapter.js";
import type {
  ComposedTreatmentPlanV2,
  CurrentMedicationV2,
  DecisionGraphRequestV2,
  DecisionGraphResultV2,
  EvidenceReferenceV2,
  RecommendationV2,
  RegimenCandidateV2,
} from "./decision-graph-v2/types.js";

/**
 * Stable marker used by the browser/scenario compatibility layer.
 * Runtime consumers must treat Decision Graph v2 ordering as authoritative and
 * must not feed these results through the retired aggregate-score ranking path.
 */
export const TYPE2_DECISION_GRAPH_V2_AUTHORITY = "GLYMIZE_DECISION_GRAPH_V2_AUTHORITY";

export interface Type2DecisionGraphMedicationProjection extends Type2MedicationConsideration {
  decisionGraphAuthority: true;
  decisionGraphPlanId?: string;
  decisionGraphPlanRank?: number;
  decisionGraphComponentOrder?: number;
  decisionGraphRegimenId?: string;
}

export interface Type2DecisionGraphAssessmentResult extends Type2AssessmentResult {
  decisionGraphAuthority: true;
  decisionGraphStatus: DecisionGraphResultV2["status"];
  decisionGraphEngine: DecisionGraphResultV2["engine"];
  medications: Type2DecisionGraphMedicationProjection[];
}

export interface BuildType2DecisionGraphAssessmentInput {
  medications: readonly GenericMedication[];
  request: Type2ConsiderationRequest;
  masterRegistry: readonly MasterDrugRegistryEntry[];
  marketProducts: readonly IranMarketDrugProduct[];
}

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

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function evidenceFromResult(result: DecisionGraphResultV2) {
  return unique([
    ...result.clinicalState.evidence,
    ...(result.primary?.evidenceSummary ?? []),
    ...result.objectives.flatMap((objective) => objective.evidence),
  ].map((item) => item.sourceId))
    .map((sourceId) => [
      ...result.clinicalState.evidence,
      ...(result.primary?.evidenceSummary ?? []),
      ...result.objectives.flatMap((objective) => objective.evidence),
    ].find((item) => item.sourceId === sourceId))
    .filter((item): item is EvidenceReferenceV2 => Boolean(item));
}

function medicationForMaster(
  masterDrugId: string,
  genericName: string,
  medications: readonly GenericMedication[],
) {
  return medications.find((item) => item.masterRegistryId === masterDrugId) ??
    medications.find((item) => normalized(item.canonicalName) === normalized(genericName));
}

function masterIdForCurrentMedication(
  current: NonNullable<Type2ConsiderationRequest["currentMedications"]>[number],
  medications: readonly GenericMedication[],
  masterRegistry: readonly MasterDrugRegistryEntry[],
) {
  const generic = current.genericMedicationId
    ? medications.find((item) => item.id === current.genericMedicationId)
    : medications.find((item) => normalized(item.canonicalName) === normalized(current.genericName));
  if (generic?.masterRegistryId) return generic.masterRegistryId;
  const name = normalized(current.genericName);
  return masterRegistry.find((entry) =>
    entry.reviewState === "approved" &&
    [entry.canonicalName, ...(entry.searchSynonyms ?? [])].some((candidate) => normalized(candidate) === name)
  )?.id;
}

function doseUnit(value: string | undefined) {
  const text = normalized(value);
  if (["u", "iu", "unit", "units"].includes(text)) return "U";
  return value?.trim() || undefined;
}

function currentMedicationsV2(
  request: Type2ConsiderationRequest,
  medications: readonly GenericMedication[],
  masterRegistry: readonly MasterDrugRegistryEntry[],
): CurrentMedicationV2[] {
  return (request.currentMedications ?? []).map((current) => {
    const masterDrugId = masterIdForCurrentMedication(current, medications, masterRegistry);
    const generic = current.genericMedicationId
      ? medications.find((item) => item.id === current.genericMedicationId)
      : medications.find((item) => normalized(item.canonicalName) === normalized(current.genericName));
    const unit = doseUnit(current.totalDailyDoseUnit ?? current.doseUnit);
    const dailyAmount = current.totalDailyDose ?? (
      current.doseAmount !== undefined && current.frequencyPerDay !== undefined
        ? current.doseAmount * current.frequencyPerDay
        : undefined
    );
    const insulinLike = [
      "human_insulin",
      "basal_insulin_analog",
      "prandial_insulin_analog",
      "premixed_insulin",
      "fixed_ratio_combination",
    ].includes(generic?.therapyGroup ?? "");

    return {
      masterDrugId,
      genericName: current.genericName,
      therapyGroup: generic?.therapyGroup,
      route: current.route ?? generic?.administrationRoute,
      dosageFormGroup: current.dosageForm,
      dailyDose: dailyAmount !== undefined && unit
        ? [{ ingredientKey: masterDrugId ?? normalized(current.genericName), amount: dailyAmount, unit }]
        : undefined,
      administrationsPerDay: current.frequencyPerDay,
      basalInsulinUnitsPerDay: insulinLike && unit === "U" ? dailyAmount : undefined,
      status: current.status,
      adherence: current.adherence,
      tolerance: current.tolerance,
    };
  });
}

function insuranceProviders(request: Type2ConsiderationRequest) {
  return unique(
    Object.values(request.insuranceCoverageByMedicationId ?? {})
      .flat()
      .filter((coverage) => coverage.runtimeEligibleForRanking !== false)
      .map((coverage) => coverage.provider),
  );
}

function graphRequest(
  request: Type2ConsiderationRequest,
  medications: readonly GenericMedication[],
  masterRegistry: readonly MasterDrugRegistryEntry[],
  inventory: DecisionGraphRequestV2["inventory"],
): DecisionGraphRequestV2 {
  const context = request.clinicalContext;
  return {
    patient: {
      ageYears: context?.ageYears,
      sexAtBirth: context?.sexAtBirth,
      pregnancy: context?.pregnancy || request.factors.includes("pregnancy"),
      glycemia: {
        currentHba1c: request.currentHba1c,
        targetHba1c: request.targetHba1c,
        hyperglycemiaSymptoms: request.hyperglycemiaSymptoms,
        catabolicFeatures: request.catabolicFeatures,
      },
      anthropometrics: context?.anthropometrics,
      kidney: {
        ...context?.kidney,
        eGfr: context?.kidney?.eGfr ?? request.eGfr,
        ckd: context?.kidney?.ckd || request.factors.includes("ckd"),
      },
      cardiovascular: {
        ...context?.cardiovascular,
        ascvd: context?.cardiovascular?.ascvd || request.factors.includes("ascvd"),
        heartFailure: context?.cardiovascular?.heartFailure || request.factors.includes("heart_failure"),
      },
      liver: context?.liver ? {
        masldMash: context.liver.masldMash || request.factors.includes("masld_mash"),
        fibrosisStage: context.liver.fibrosisStage,
        cirrhosis: context.liver.cirrhosis,
        decompensatedCirrhosis: context.liver.decompensatedCirrhosis,
        astUL: context.liver.astUeL,
        altUL: context.liver.altUeL,
        plateletCount10e9L: context.liver.plateletCount10e9L,
        liverStiffnessKpa: context.liver.liverStiffnessKpa,
      } : request.factors.includes("masld_mash") ? { masldMash: true } : undefined,
      hypoglycemiaRisk: request.factors.includes("hypoglycemia_risk") ? "high" : "standard",
      currentMedications: currentMedicationsV2(request, medications, masterRegistry),
    },
    preferences: {
      routePreference: request.routePreference === "oral_only" ? "oral_only" : "oral_or_injectable",
      costPreference: request.costPreference === "low_cost_only"
        ? "low_cost"
        : request.costPreference === "insured_only"
          ? "insured_only"
          : request.costPreference === "moderate"
            ? "moderate"
            : "no_constraint",
      insuranceProviders: insuranceProviders(request),
    },
    inventory,
  };
}

function evidenceForRecommendation(result: DecisionGraphResultV2) {
  const evidence = evidenceFromResult(result);
  return {
    sourceUrl: evidence[0]?.url ?? "about:blank",
    sourceReference: `${TYPE2_DECISION_GRAPH_V2_AUTHORITY}${evidence.length ? ` · ${unique(evidence.map((item) => item.sourceId)).join(" · ")}` : ""}`,
  };
}

function recommendationPriority(result: DecisionGraphResultV2): Type2PathwayPriority {
  if (result.clinicalState.pathway === "maintain_and_monitor") return "maintain_and_monitor";
  if (result.clinicalState.pathway === "insulin_centered") return "consider_insulin";
  if (result.clinicalState.pathway === "insufficient_glycemic_data") return "maintain_and_monitor";
  if (result.clinicalState.pathway === "modest_intensification") return "single_or_stepwise_therapy";
  const primaryGroups = result.primary?.components.map((component) => component.therapyGroup) ?? [];
  if (primaryGroups.some((group) => ["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(group))) {
    return "glp1_based_therapy";
  }
  return "combination_therapy";
}

function recommendationTitle(result: DecisionGraphResultV2) {
  if (result.status === "urgent_clinician_review") return "بازبینی فوری پزشک پیش از تصمیم درمانی";
  if (result.status === "needs_data") return "تکمیل داده‌های لازم پیش از تصمیم نهایی";
  if (result.status === "no_fully_eligible_regimen") return "نیاز بالینی وجود دارد؛ رژیم کاملاً واجد شرایط یافت نشد";
  if (result.clinicalState.pathway === "maintain_and_monitor") return "حفظ درمان و پایش بر اساس وضعیت فعلی";
  if (result.clinicalState.pathway === "insulin_centered") return "مسیر درمانی مبتنی بر انسولین";
  if (result.clinicalState.pathway === "high_efficacy_combination") return "درمان با اثربخشی بالا / ترکیبی";
  return "تشدید مرحله‌ای درمان بر اساس Decision Graph";
}

function regimenForPlanRank(result: DecisionGraphResultV2, rank: number): RecommendationV2 | undefined {
  if (rank === 1) return result.primary;
  return result.alternatives[rank - 2];
}

function plansFromResult(result: DecisionGraphResultV2) {
  const composed = [
    result.treatmentPlan,
    ...result.alternativeTreatmentPlans,
  ].filter((plan): plan is ComposedTreatmentPlanV2 => Boolean(plan));
  if (composed.length) return composed.slice(0, 3);

  return [result.primary, ...result.alternatives]
    .filter((regimen): regimen is RecommendationV2 => Boolean(regimen))
    .slice(0, 3)
    .map((regimen, index): ComposedTreatmentPlanV2 => ({
      planId: `compat:${regimen.regimenId}:${index + 1}`,
      glycemicRegimenId: regimen.regimenId,
      supportingRegimenIds: [],
      components: regimen.components.map((component) => ({
        masterDrugId: component.masterDrugId,
        genericName: component.genericName,
        persianName: component.persianName,
        therapyGroup: component.therapyGroup,
        tags: component.tags,
        action: "start",
        sourceRegimenIds: [regimen.regimenId],
        sourceLanes: [regimen.lane],
        servesObjectives: regimen.objectiveCoverage,
        dosePlan: component.dosePlan,
        selectedProduct: component.selectedProduct,
        selectedProductCost: component.selectedProductCost,
        normalized30DayPatientCostToman: component.selectedProductCost?.normalized30DayTreatmentCostToman,
        reasons: component.availability.reasons,
      })),
      coveredObjectives: regimen.objectiveCoverage,
      unresolvedObjectives: [],
      monthlyPatientCostToman: regimen.monthlyPatientCostToman,
      dailyAdministrationBurden: regimen.dailyAdministrationBurden,
      currentTherapyReview: [],
      reasons: regimen.reasons,
      cautions: regimen.cautions,
    }));
}

function contractTherapyGroup(value: string, fallback?: MedicationTherapyGroup): MedicationTherapyGroup {
  if (fallback) return fallback;
  const direct = [
    "oral_glucose_lowering",
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
    "antianginal",
    "antiarrhythmic",
    "liver_directed_therapy",
    "weight_management",
    "vitamin_or_mineral",
    "other",
  ] as const;
  if ((direct as readonly string[]).includes(value)) return value as MedicationTherapyGroup;
  return "oral_glucose_lowering";
}

function regimenEvidence(regimen: RegimenCandidateV2 | undefined, result: DecisionGraphResultV2) {
  const evidence = regimen?.evidence?.length ? regimen.evidence : evidenceFromResult(result);
  return {
    sourceUrl: evidence[0]?.url ?? "about:blank",
    sourceReference: `${TYPE2_DECISION_GRAPH_V2_AUTHORITY}${evidence.length ? ` · ${unique(evidence.map((item) => item.sourceId)).join(" · ")}` : ""}`,
  };
}

function isCurrentMedication(
  masterDrugId: string,
  genericName: string,
  request: Type2ConsiderationRequest,
  medications: readonly GenericMedication[],
  masterRegistry: readonly MasterDrugRegistryEntry[],
) {
  return (request.currentMedications ?? []).some((current) => {
    if ((current.status ?? "active") !== "active") return false;
    const currentMaster = masterIdForCurrentMedication(current, medications, masterRegistry);
    return currentMaster === masterDrugId || normalized(current.genericName) === normalized(genericName);
  });
}

function projectPlans(
  result: DecisionGraphResultV2,
  request: Type2ConsiderationRequest,
  medications: readonly GenericMedication[],
  masterRegistry: readonly MasterDrugRegistryEntry[],
): Type2DecisionGraphMedicationProjection[] {
  const plans = plansFromResult(result);
  return plans.flatMap((plan, planIndex) => {
    const rank = planIndex + 1;
    const regimen = regimenForPlanRank(result, rank);
    const evidence = regimenEvidence(regimen, result);
    return plan.components.map((component, componentIndex): Type2DecisionGraphMedicationProjection => {
      const medication = medicationForMaster(component.masterDrugId, component.genericName, medications);
      const currentMedication = isCurrentMedication(
        component.masterDrugId,
        component.genericName,
        request,
        medications,
        masterRegistry,
      );
      const insuranceCoverages = medication
        ? request.insuranceCoverageByMedicationId?.[medication.id] ?? []
        : [];
      const reasons = unique([
        ...component.reasons,
        ...plan.reasons,
        ...(regimen?.whySelected ?? []),
      ]).filter(Boolean);
      const cautions = unique([
        ...plan.cautions,
        ...(regimen?.cautions ?? []),
      ]).filter(Boolean);

      return {
        genericMedicationId: medication?.id ?? `master-${component.masterDrugId.toLocaleLowerCase()}`,
        genericName: medication?.canonicalName ?? component.genericName,
        persianName: medication?.persianName ?? component.persianName ?? component.genericName,
        therapeuticClass: medication?.className ?? component.therapyGroup,
        therapyGroup: contractTherapyGroup(component.therapyGroup, medication?.therapyGroup),
        sourceUrl: evidence.sourceUrl,
        sourceReference: evidence.sourceReference,
        considerations: reasons,
        cautions,
        priorityScore: 0,
        priorityTier: rank === 1 ? "recommended" : rank === 2 ? "preferred" : "consider",
        relativeCost: "medium",
        rankingReasons: reasons,
        risks: cautions,
        insuranceCoverages,
        therapyAction: currentMedication
          ? "review_current_therapy"
          : (request.currentMedications ?? []).some((item) => (item.status ?? "active") === "active")
            ? "consider_addition"
            : "consider_initiation",
        currentMedication,
        outputStatus: "information_only",
        decisionGraphAuthority: true,
        decisionGraphPlanId: plan.planId,
        decisionGraphPlanRank: rank,
        decisionGraphComponentOrder: componentIndex,
        decisionGraphRegimenId: plan.glycemicRegimenId ?? regimen?.regimenId,
      };
    });
  });
}

/**
 * Behavior-preserving contract adapter for the existing Type 2 UI.
 * Clinical selection is performed exactly once by Decision Graph v2. The
 * legacy `priorityScore` field is deliberately neutralized to zero and is not
 * a clinical ranking signal. Graph plan order is carried separately for the
 * scenario/presentation adapter.
 */
export function buildType2AssessmentFromDecisionGraphV2(
  input: BuildType2DecisionGraphAssessmentInput,
): Type2DecisionGraphAssessmentResult {
  const { inventory } = buildDecisionGraphInventoryFromContractsV2({
    masterRegistry: input.masterRegistry,
    marketProducts: input.marketProducts,
  });
  const request = graphRequest(input.request, input.medications, input.masterRegistry, inventory);
  const result = runDecisionGraphV2(request);
  const evidence = evidenceForRecommendation(result);
  const rationale = unique([
    ...result.clinicalState.reasons,
    ...(result.primary?.whySelected ?? []),
    ...(result.primary?.reasons ?? []),
    ...result.conflicts,
  ]).filter(Boolean);

  return {
    recommendation: {
      priority: recommendationPriority(result),
      title: recommendationTitle(result),
      rationale,
      hba1cGap: result.clinicalState.hba1cGap,
      urgentReview: result.status === "urgent_clinician_review",
      sourceUrl: evidence.sourceUrl,
      sourceReference: evidence.sourceReference,
    },
    medications: projectPlans(result, input.request, input.medications, input.masterRegistry),
    decisionGraphAuthority: true,
    decisionGraphStatus: result.status,
    decisionGraphEngine: result.engine,
  };
}
