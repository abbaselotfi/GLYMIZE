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
  CurrentMedicationV2,
  DecisionGraphRequestV2,
  DecisionGraphResultV2,
  RecommendationV2,
} from "./decision-graph-v2/types.js";

export const TYPE2_DECISION_GRAPH_V2_AUTHORITY = "GLYMIZE_DECISION_GRAPH_V2_AUTHORITY";

export interface Type2DecisionGraphMedicationProjection extends Type2MedicationConsideration {
  decisionGraphAuthority: true;
  decisionGraphRank: number;
  decisionGraphComponentOrder: number;
  decisionGraphRegimenId: string;
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

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
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
    [entry.canonicalName, ...(entry.searchSynonyms ?? [])].some((candidate) => normalized(candidate) === name),
  )?.id;
}

function currentMedicationsV2(
  request: Type2ConsiderationRequest,
  medications: readonly GenericMedication[],
  masterRegistry: readonly MasterDrugRegistryEntry[],
): CurrentMedicationV2[] {
  return (request.currentMedications ?? []).map((current) => {
    const generic = current.genericMedicationId
      ? medications.find((item) => item.id === current.genericMedicationId)
      : medications.find((item) => normalized(item.canonicalName) === normalized(current.genericName));
    const unit = current.totalDailyDoseUnit ?? current.doseUnit;
    const totalDailyDose = current.totalDailyDose ?? (
      current.doseAmount !== undefined && current.frequencyPerDay !== undefined
        ? current.doseAmount * current.frequencyPerDay
        : undefined
    );
    const masterDrugId = masterIdForCurrentMedication(current, medications, masterRegistry);
    const insulinLike = [
      "human_insulin",
      "basal_insulin_analog",
      "prandial_insulin_analog",
      "premixed_insulin",
      "fixed_ratio_combination",
    ].includes(generic?.therapyGroup ?? "");
    const normalizedUnit = unit && ["u", "iu", "unit", "units"].includes(normalized(unit)) ? "U" : unit;

    return {
      masterDrugId,
      genericName: current.genericName,
      therapyGroup: generic?.therapyGroup,
      route: current.route ?? generic?.administrationRoute,
      dosageFormGroup: current.dosageForm,
      dailyDose: totalDailyDose !== undefined && normalizedUnit
        ? [{ ingredientKey: masterDrugId ?? normalized(current.genericName), amount: totalDailyDose, unit: normalizedUnit }]
        : undefined,
      administrationsPerDay: current.frequencyPerDay,
      basalInsulinUnitsPerDay: insulinLike && normalizedUnit === "U" ? totalDailyDose : undefined,
      status: current.status,
      adherence: current.adherence,
      tolerance: current.tolerance,
    };
  });
}

function graphRequest(
  input: BuildType2DecisionGraphAssessmentInput,
  inventory: DecisionGraphRequestV2["inventory"],
): DecisionGraphRequestV2 {
  const { request, medications, masterRegistry } = input;
  const context = request.clinicalContext;
  const providerSet = new Set<string>();
  for (const coverages of Object.values(request.insuranceCoverageByMedicationId ?? {})) {
    for (const coverage of coverages) {
      if (coverage.runtimeEligibleForRanking !== false) providerSet.add(coverage.provider);
    }
  }

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
      insuranceProviders: [...providerSet],
    },
    inventory,
  };
}

function priorityFor(result: DecisionGraphResultV2): Type2PathwayPriority {
  if (result.clinicalState.pathway === "maintain_and_monitor" || result.clinicalState.pathway === "insufficient_glycemic_data") {
    return "maintain_and_monitor";
  }
  if (result.clinicalState.pathway === "insulin_centered") return "consider_insulin";
  if (result.clinicalState.pathway === "modest_intensification") return "single_or_stepwise_therapy";
  if (result.primary?.components.some((component) =>
    ["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(component.therapyGroup),
  )) return "glp1_based_therapy";
  return "combination_therapy";
}

function titleFor(result: DecisionGraphResultV2) {
  if (result.status === "urgent_clinician_review") return "بازبینی فوری پزشک پیش از تصمیم درمانی";
  if (result.status === "needs_data") return "تکمیل داده‌های لازم پیش از تصمیم نهایی";
  if (result.status === "no_fully_eligible_regimen") return "نیاز بالینی وجود دارد؛ رژیم کاملاً واجد شرایط یافت نشد";
  if (result.clinicalState.pathway === "maintain_and_monitor") return "حفظ درمان و پایش بر اساس وضعیت فعلی";
  if (result.clinicalState.pathway === "insulin_centered") return "مسیر درمانی مبتنی بر انسولین";
  if (result.clinicalState.pathway === "high_efficacy_combination") return "درمان با اثربخشی بالا / ترکیبی";
  return "تشدید مرحله‌ای درمان بر اساس Decision Graph";
}

function medicationForComponent(
  masterDrugId: string,
  genericName: string,
  medications: readonly GenericMedication[],
) {
  return medications.find((item) => item.masterRegistryId === masterDrugId) ??
    medications.find((item) => normalized(item.canonicalName) === normalized(genericName));
}

function contractTherapyGroup(value: string, fallback?: MedicationTherapyGroup): MedicationTherapyGroup {
  if (fallback) return fallback;
  if (value === "fixed_ratio_combination") return "fixed_ratio_combination";
  if (value === "glp_1_receptor_agonist") return "glp_1_receptor_agonist";
  if (value === "dual_gip_glp_1_receptor_agonist") return "dual_gip_glp_1_receptor_agonist";
  if (value === "basal_insulin_analog") return "basal_insulin_analog";
  if (value === "prandial_insulin_analog") return "prandial_insulin_analog";
  if (value === "premixed_insulin") return "premixed_insulin";
  if (value === "human_insulin") return "human_insulin";
  if (value === "lipid_lowering") return "lipid_lowering";
  if (value === "antiplatelet") return "antiplatelet";
  if (value === "anticoagulant") return "anticoagulant";
  if (value === "raas_blocker") return "raas_blocker";
  if (value === "mineralocorticoid_receptor_antagonist") return "mineralocorticoid_receptor_antagonist";
  if (value === "heart_failure_therapy") return "heart_failure_therapy";
  if (value === "antihypertensive") return "antihypertensive";
  if (value === "liver_directed_therapy") return "liver_directed_therapy";
  return "oral_glucose_lowering";
}

function activeCurrentMedication(
  masterDrugId: string,
  genericName: string,
  request: Type2ConsiderationRequest,
  medications: readonly GenericMedication[],
  masterRegistry: readonly MasterDrugRegistryEntry[],
) {
  return (request.currentMedications ?? []).some((current) =>
    (current.status ?? "active") === "active" && (
      masterIdForCurrentMedication(current, medications, masterRegistry) === masterDrugId ||
      normalized(current.genericName) === normalized(genericName)
    ),
  );
}

function projectionForRegimen(
  regimen: RecommendationV2,
  rank: number,
  input: BuildType2DecisionGraphAssessmentInput,
): Type2DecisionGraphMedicationProjection[] {
  const evidence = regimen.evidenceSummary.length ? regimen.evidenceSummary : regimen.evidence;
  const sourceUrl = evidence[0]?.url ?? "about:blank";
  const sourceReference = `${TYPE2_DECISION_GRAPH_V2_AUTHORITY}${evidence.length ? ` · ${unique(evidence.map((item) => item.sourceId)).join(" · ")}` : ""}`;

  return regimen.components.map((component, componentIndex) => {
    const medication = medicationForComponent(component.masterDrugId, component.genericName, input.medications);
    const currentMedication = activeCurrentMedication(
      component.masterDrugId,
      component.genericName,
      input.request,
      input.medications,
      input.masterRegistry,
    );
    const reasons = unique([...regimen.whySelected, ...regimen.reasons, ...component.availability.reasons]);
    const cautions = unique(regimen.cautions);
    return {
      genericMedicationId: medication?.id ?? `master-${component.masterDrugId.toLocaleLowerCase()}`,
      genericName: medication?.canonicalName ?? component.genericName,
      persianName: medication?.persianName ?? component.persianName ?? component.genericName,
      therapeuticClass: medication?.className ?? component.therapyGroup,
      therapyGroup: contractTherapyGroup(component.therapyGroup, medication?.therapyGroup),
      sourceUrl,
      sourceReference,
      considerations: reasons,
      cautions,
      priorityScore: 0,
      priorityTier: rank === 1 ? "recommended" : rank === 2 ? "preferred" : "consider",
      relativeCost: "medium",
      rankingReasons: reasons,
      risks: cautions,
      insuranceCoverages: medication ? input.request.insuranceCoverageByMedicationId?.[medication.id] ?? [] : [],
      therapyAction: currentMedication
        ? "review_current_therapy"
        : (input.request.currentMedications ?? []).some((item) => (item.status ?? "active") === "active")
          ? "consider_addition"
          : "consider_initiation",
      currentMedication,
      outputStatus: "information_only",
      decisionGraphAuthority: true,
      decisionGraphRank: rank,
      decisionGraphComponentOrder: componentIndex,
      decisionGraphRegimenId: regimen.regimenId,
    };
  });
}

export function buildType2AssessmentFromDecisionGraphV2(
  input: BuildType2DecisionGraphAssessmentInput,
): Type2DecisionGraphAssessmentResult {
  const { inventory } = buildDecisionGraphInventoryFromContractsV2({
    masterRegistry: input.masterRegistry,
    marketProducts: input.marketProducts,
  });
  const result = runDecisionGraphV2(graphRequest(input, inventory));
  const regimens = [result.primary, ...result.alternatives]
    .filter((item): item is RecommendationV2 => Boolean(item))
    .slice(0, 3);
  const evidence = result.primary?.evidenceSummary.length
    ? result.primary.evidenceSummary
    : result.clinicalState.evidence;
  const sourceReference = `${TYPE2_DECISION_GRAPH_V2_AUTHORITY}${evidence.length ? ` · ${unique(evidence.map((item) => item.sourceId)).join(" · ")}` : ""}`;
  const rationale = unique([
    ...result.clinicalState.reasons,
    ...(result.primary?.whySelected ?? []),
    ...result.conflicts,
  ]);

  return {
    recommendation: {
      priority: priorityFor(result),
      title: titleFor(result),
      rationale,
      hba1cGap: result.clinicalState.hba1cGap,
      urgentReview: result.status === "urgent_clinician_review",
      sourceUrl: evidence[0]?.url ?? "about:blank",
      sourceReference,
    },
    medications: regimens.flatMap((regimen, index) => projectionForRegimen(regimen, index + 1, input)),
    decisionGraphAuthority: true,
    decisionGraphStatus: result.status,
    decisionGraphEngine: result.engine,
  };
}
